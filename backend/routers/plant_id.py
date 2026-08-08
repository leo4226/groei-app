"""HTTP endpoints for plant identification.

Supports two backends:
  1. BioCLIP (self-hosted, unlimited) — primary
  2. Pl@ntNet API (external, 20/day) — fallback
"""

import base64
import io
import json
import logging
import os
import time
from datetime import date
from pathlib import Path

import numpy as np

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from services.deferred import fire_and_forget

from database import db_dep
from auth import get_current_account
from services.plant_id import identify, PlantIdQuotaExceeded, PlantIdServiceError
# bioclip_id is lazily imported in _bioclip_identify (local fallback branch)
# to avoid requiring numpy/scipy/torch on Fly.io (which uses remote worker)
from services.storage import build_storage_from_env

logger = logging.getLogger(__name__)

_DAILY_QUOTA = 20

router = APIRouter(prefix="/plants", tags=["plant-id"])

_MAX_IMAGE_BYTES = 5 * 1024 * 1024

# How many candidate species the result screen shows. Kept small so the ranked
# choices don't get lost under the confidence / source / guidance blocks (#372).
# PlantNet already capped at 3; this makes BioCLIP consistent.
_MAX_CANDIDATES = 3

# Confidence calibration thresholds (informed by scripts/eval_bioclip.py output).
# Tuned 2026-05-24 from 126-photo iNat-only eval (see docs/plans/2026-05-24-bioclip-eval-baseline.txt).
# Key insight from the eval: top-1 score alone barely discriminates correct from wrong
# (mean 0.302 vs 0.287), but margin (top1 - top2) separates strongly (mean 0.035 vs 0.012).
# So HIGH requires BOTH a moderate top-1 AND a meaningful margin; MEDIUM is the
# top-1 band above WRONG median (probably right, but margin doesn't confirm).
_CONFIDENCE_FLOOR = 0.10       # below this -> no_match (no candidates surfaced)
_HIGH_TOP1 = 0.28              # top-1 must clear this AND _HIGH_MARGIN to be "high"
_HIGH_MARGIN = 0.03            # top-1 minus top-2 — primary signal
_MEDIUM_TOP1 = 0.30            # top-1 above median-of-WRONG is at least medium

# (No legacy aliases — _CONFIDENCE_FLOOR / _HIGH_TOP1 / _HIGH_MARGIN / _MEDIUM_TOP1 are
#  the only constants. Old names removed; grep confirmed zero external imports.)


def _classify_confidence(top1: float, top2: float | None) -> str:
    """Bucket a (top1, top2) pair into one of high / medium / low / no_match.

    See docs/plans/2026-05-24-bioclip-confidence-calibration-design.md section 3.
    """
    if top1 < _CONFIDENCE_FLOOR:
        return "no_match"
    margin = top1 - (top2 or 0.0)
    if top1 >= _HIGH_TOP1 and margin >= _HIGH_MARGIN:
        return "high"
    if top1 >= _MEDIUM_TOP1:
        return "medium"
    return "low"


# Image-to-image cosine (the query photo vs a user-confirmed photo, both through
# the SAME visual encoder) sits on a higher, different scale than image-to-text
# cosine (~0.25–0.35). We therefore only trust a confirmed-photo match when it is
# STRONG (>= _IMAGE_MATCH_MIN). Above the floor it can RESCUE a species the text
# ranking missed entirely (union), not merely re-rank the text top-K; below the
# floor the image signal is ignored, so identification degrades gracefully to
# pure text and a weak/wrong confirmation can't hijack the result.
#
# _IMAGE_MATCH_MIN is the key tuning knob and is a CONSERVATIVE default set
# WITHOUT a real-photo calibration run (see docs/plans/2026-07-07-bioclip-audit.md
# §3.1/§6). Validate on the worker before relying on it: lower it if genuine
# repeat photos of a confirmed plant fail to rescue; raise it if look-alikes get
# rescued wrongly. Note: a rescued match's raw image cosine currently flows
# straight into the displayed confidence, so it reads as e.g. "85%" beside text
# candidates' "30%" — that display recalibration is tracked separately (audit §3.3).
#
# 2026-08-06 interim calibration (GBIF eval set, 126 photos / 47 species, worker
# http://127.0.0.1:8001, scripts/eval_blend.py):
#   SAME species pairs:      p50=0.486  p95=0.737
#   DIFFERENT species pairs: p50=0.203  p95=0.411
# The previous 0.80 sat above the same-species p95 (0.737), so the un-gate never
# fired in practice. 0.45 sits below the same-species median (most genuine repeat
# photos clear it) and above the different-species p95 (most look-alikes stay
# below). PENDING: real-photo validation on Leon's garden photos (~2026-08-20);
# re-run eval_blend.py and re-fit this floor before trusting it in production.
_IMAGE_MATCH_MIN = 0.45


def _blend_scores(
    text_matches: list[tuple[int, float]],
    query_embedding: np.ndarray,
    refs_by_species: dict[int, np.ndarray],
    top_k: int = 5,
) -> list[tuple[int, float]]:
    """Combine text-based top-K matches with image-to-image similarity from
    user-confirmed embeddings, return new top-K.

    A confirmed-photo match is used only when it is strong (best ref cosine
    >= _IMAGE_MATCH_MIN). Such a match can RESCUE a species missing from the
    text top-K (union), not just re-rank the ones already present, and a single
    confirmed ref is enough. Weak image matches are ignored, so the result never
    drops below pure-text behaviour. Per-species score: max(text, strong_image).
    """
    text_score_map: dict[int, float] = {sid: s for sid, s in text_matches}

    # Best image-to-image cosine per species, kept only if it clears the floor.
    # A single confirmed ref counts (ref_matrix has ≥1 row by construction).
    strong_image: dict[int, float] = {}
    for sid, ref_matrix in refs_by_species.items():
        if ref_matrix.shape[0] < 1:
            continue
        best = float((ref_matrix @ query_embedding).max())  # (N,512)@(512,) -> (N,)
        if best >= _IMAGE_MATCH_MIN:
            strong_image[sid] = best

    combined: dict[int, float] = {}
    # Text candidates, boosted only by a strong image match for the same species.
    for sid, t in text_score_map.items():
        combined[sid] = max(t, strong_image.get(sid, 0.0))
    # Rescue: a strong image match for a species the text ranking never surfaced.
    for sid, i in strong_image.items():
        combined.setdefault(sid, i)

    ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)
    return ranked[:top_k]


_USER_REFS_CACHE_TTL_S = 300  # 5 min
_user_refs_cache: dict = {"loaded_at": None, "by_species": {}}


async def _load_user_refs_cache(db) -> dict[int, np.ndarray]:
    """Load all user_confirmed_embeddings into an in-memory dict, refreshing
    at most every _USER_REFS_CACHE_TTL_S seconds.
    """
    global _user_refs_cache
    now = time.time()
    if (
        _user_refs_cache["loaded_at"] is not None
        and now - _user_refs_cache["loaded_at"] < _USER_REFS_CACHE_TTL_S
    ):
        return _user_refs_cache["by_species"]

    rows = await db.execute_fetchall(
        "SELECT species_id, embedding FROM user_confirmed_embeddings"
    )
    by_species: dict[int, list[np.ndarray]] = {}
    for r in rows:
        emb = np.frombuffer(r["embedding"], dtype=np.float32)
        by_species.setdefault(r["species_id"], []).append(emb)
    stacked = {sid: np.stack(arrs) for sid, arrs in by_species.items()}

    _user_refs_cache = {"loaded_at": now, "by_species": stacked}
    return stacked


async def _apply_user_refs(
    text_matches: list[tuple[int, float]],
    query_embedding: np.ndarray | None,
    db,
) -> list[tuple[int, float]]:
    """Async wrapper: load refs from cache, blend with text matches. If query
    embedding is None (worker didn't return one — old version), short-circuit
    to text_matches unchanged.
    """
    if query_embedding is None:
        return text_matches
    refs = await _load_user_refs_cache(db)
    if not refs:
        return text_matches
    return _blend_scores(text_matches, query_embedding, refs)


_ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "icons")


class CandidateOut(BaseModel):
    scientific_name: str
    common_names_nl: list[str]
    common_names_en: list[str]
    confidence: float
    species_id: int | None
    thumbnail_url: str | None
    source: str = "bioclip"  # "bioclip" or "plantnet"


class IdentifyResponse(BaseModel):
    candidates: list[CandidateOut]
    confidence: str = "no_match"  # high | medium | low | no_match
    # DEPRECATED: now derived as (confidence != "high"), which is broader than the
    # old "in band [0.10, 0.30)" definition — strong-but-thin-margin matches
    # (confidence = "medium") now flag as low_confidence too. Frontend should
    # migrate to reading `confidence` directly; remove this field after.
    low_confidence: bool = False
    source: str = "bioclip"


def _clean_common_names(names: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        text = str(name).strip()
        key = text.casefold()
        if text and key not in seen:
            seen.add(key)
            out.append(text)
    return out


async def _local_catalog_candidate_details(db, scientific_name: str) -> dict:
    """Best-effort local catalog metadata for a PlantNet candidate.

    PlantNet's default identify response usually does not include images. When
    the returned scientific name exists in our catalog, reuse our localized
    names and representative species image so the second-opinion cards can be
    compared visually with BioCLIP results.
    """
    details = {
        "species_id": None,
        "common_name_nl": None,
        "common_name_en": None,
        "thumbnail_url": None,
    }
    try:
        rows = await db.execute_fetchall(
            "SELECT id, common_name_nl, common_name_en "
            "FROM plant_species WHERE latin_name = ? LIMIT 1",
            (scientific_name,),
        )
    except Exception:
        return details
    if not rows:
        return details

    row = rows[0]
    species_id = row["id"]
    details.update({
        "species_id": species_id,
        "common_name_nl": _text_or_none(row.get("common_name_nl")),
        "common_name_en": _text_or_none(row.get("common_name_en")),
    })

    try:
        img_rows = await db.execute_fetchall(
            "SELECT url, thumbnail_url FROM species_images "
            "WHERE species_id = ? AND COALESCE(NULLIF(thumbnail_url, ''), NULLIF(url, '')) IS NOT NULL "
            "ORDER BY is_primary DESC, id ASC LIMIT 1",
            (species_id,),
        )
    except Exception:
        return details
    if img_rows:
        img = img_rows[0]
        details["thumbnail_url"] = _text_or_none(img.get("thumbnail_url")) or _text_or_none(img.get("url"))
    return details


def _plantnet_candidate_common_names(
    plantnet_names: list[str],
    lang: str,
    local_details: dict,
) -> tuple[list[str], list[str]]:
    """Populate only the requested language bucket for PlantNet candidates.

    The frontend falls back across buckets, so putting Dutch names in an English
    response makes English-mode comparisons confusing. Prefer PlantNet's names
    for the requested language; if PlantNet omitted names, fall back to our
    local catalog in the same requested language only.
    """
    requested_names = _clean_common_names(plantnet_names)
    if lang == "nl":
        local_nl = _text_or_none(local_details.get("common_name_nl"))
        return requested_names or ([local_nl] if local_nl else []), []

    local_en = _text_or_none(local_details.get("common_name_en"))
    return [], requested_names or ([local_en] if local_en else [])


def _text_or_none(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _msg(lang: str, nl: str, en: str) -> str:
    """User-facing error text in the requester's UI language. The frontend
    surfaces HTTPException `detail` strings verbatim, so they must match the
    language the identify flow was asked for."""
    return en if lang == "en" else nl


def _localized_suggested_name(row: dict, lang: str, scientific_name: str) -> str:
    """Display name in the requested language, falling back across the other
    language before the latin name — mirrors the frontend bucket fallback."""
    order = ("common_name_en", "common_name_nl") if lang == "en" else ("common_name_nl", "common_name_en")
    for key in order:
        name = _text_or_none(row.get(key))
        if name:
            return name
    return scientific_name


def _localized_name_missing(value, latin_name: str | None) -> bool:
    text = _text_or_none(value)
    if text is None:
        return True
    latin = _text_or_none(latin_name)
    return bool(latin and text.casefold() == latin.casefold())


def _needs_localized_species_enrichment(row, latin_name: str | None) -> bool:
    return (
        _localized_name_missing(row.get("common_name_nl"), latin_name)
        or _localized_name_missing(row.get("common_name_en"), latin_name)
    )


async def _check_quota(db, account: dict, lang: str = "nl") -> str | None:
    """Check daily Pl@ntNet quota.

    Returns the account email if admin (unlimited), None otherwise.
    Raises HTTPException 429 if quota exceeded.
    """
    rows = await db.execute_fetchall(
        "SELECT email, is_admin FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows:
        raise HTTPException(status_code=403, detail="Account not found")

    email = rows[0]["email"]
    if bool(rows[0]["is_admin"]):
        return email

    today = date.today().isoformat()
    quota_rows = await db.execute_fetchall(
        "SELECT \"count\" FROM plantnet_quota WHERE account_id = ? AND date = ?",
        (account["account_id"], today),
    )
    used = quota_rows[0]["count"] if quota_rows else 0
    if used >= _DAILY_QUOTA:
        raise HTTPException(
            status_code=429,
            detail=_msg(
                lang,
                nl=f"Je hebt vandaag al {_DAILY_QUOTA} identificaties gebruikt. Morgen weer!",
                en=f"You've already used {_DAILY_QUOTA} identifications today. Try again tomorrow!",
            ),
        )
    return None


async def _increment_quota(db, account_id: int) -> None:
    today = date.today().isoformat()
    await db.execute_fetchall(
        """INSERT INTO plantnet_quota (account_id, date, "count")
           VALUES (?, ?, 1)
           ON CONFLICT (account_id, date) DO UPDATE SET "count" = plantnet_quota."count" + 1""",
        (account_id, today),
    )


async def _log_identify(db, account: dict, engine: str, outcome: str) -> None:
    """Best-effort record of an identify call, for the admin growth metrics
    ("how many IDs, by which household, via which engine"). Never fails the
    identify flow — a logging hiccup must not break identification."""
    try:
        await db.execute(
            "INSERT INTO identify_log (account_id, household_id, engine, outcome) VALUES (?, ?, ?, ?)",
            (account["account_id"], account["household_id"], engine, outcome),
        )
        await db.commit()
    except Exception:
        logger.warning("identify_log write failed", exc_info=True)


_BIOCLIP_WORKER_URL = os.environ.get("BIOCLIP_WORKER_URL", "")
_BIOCLIP_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")


def _worker_headers() -> dict:
    """Shared-secret header for the BioCLIP worker. Empty dict if no token set."""
    return {"X-Worker-Token": _BIOCLIP_WORKER_TOKEN} if _BIOCLIP_WORKER_TOKEN else {}


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 1)


async def _bioclip_identify(image_bytes_list: list[bytes], db, lang: str = "nl") -> IdentifyResponse | None:
    """Identify a plant image using BioCLIP worker (remote or local).

    Accepts 1-3 image byte blobs (multi-angle ensemble, #807). When multiple
    images are given, the worker averages their L2-normed embeddings before
    cosine matching; single-image behavior is unchanged.

    When BIOCLIP_WORKER_URL is set, POSTs the image(s) to the worker over HTTP.
    Otherwise falls back to local BioCLIP (requires open_clip_torch + GPU).
    `lang` controls which common name bucket to populate (NL or EN).
    """
    import httpx

    total_started = time.perf_counter()
    engine_ms: float | None = None
    user_ref_ms = 0.0
    worker_url = _BIOCLIP_WORKER_URL
    matches = None

    if worker_url:
        # Remote worker: POST image(s), get species_id + confidence back
        try:
            engine_started = time.perf_counter()
            files = [("image", ("plant.jpg", image_bytes_list[0], "image/jpeg"))]
            for i, extra in enumerate(image_bytes_list[1:], start=2):
                files.append(("extra_images", (f"angle-{i}.jpg", extra, "image/jpeg")))
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{worker_url.rstrip('/')}/identify",
                    files=files,
                    headers=_worker_headers(),
                )
                engine_ms = _elapsed_ms(engine_started)
                if resp.status_code == 200:
                    data = resp.json()
                    matches = [(m["species_id"], m["confidence"]) for m in data.get("matches", [])]
                    # Decode the query embedding if present (new field; may be absent on old worker)
                    emb_b64 = data.get("embedding")
                    if emb_b64:
                        try:
                            query_embedding = np.frombuffer(base64.b64decode(emb_b64), dtype=np.float32)
                            if query_embedding.shape == (512,):
                                refs_started = time.perf_counter()
                                matches = await _apply_user_refs(matches, query_embedding, db)
                                user_ref_ms = _elapsed_ms(refs_started)
                        except Exception as exc:
                            logger.warning("Failed to decode query embedding for blend: %s", exc)
                elif resp.status_code == 503:
                    logger.warning("BioCLIP worker not ready (503)")
                    return None
                else:
                    logger.warning("BioCLIP worker returned %s: %s", resp.status_code, resp.text[:200])
                    return None
        except Exception as exc:
            logger.warning("BioCLIP worker unreachable: %s", exc)
            return None
    else:
        # Local fallback: load BioCLIP in-process
        from PIL import Image
        from services.bioclip_id import get_service as get_bioclip_service
        engine_started = time.perf_counter()
        bioclip = get_bioclip_service()

        bioclip.load_model()
        if not bioclip.load_embeddings():
            return None

        try:
            pil_images = []
            for ib in image_bytes_list:
                try:
                    pil_images.append(Image.open(io.BytesIO(ib)).convert("RGB"))
                except Exception:
                    logger.warning("Skipping unusable angle in local fallback")
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=_msg(lang, nl="Kon afbeelding niet verwerken", en="Could not process image"),
            )

        if not pil_images:
            raise HTTPException(
                status_code=400,
                detail=_msg(lang, nl="Kon afbeelding niet verwerken", en="Could not process image"),
            )

        if len(pil_images) == 1:
            image_emb = bioclip.embed_image(pil_images[0])
        else:
            from services.bioclip_id import average_embeddings
            image_emb = average_embeddings([bioclip.embed_image(p) for p in pil_images])
        matches = bioclip.identify(image_emb, top_k=5)
        engine_ms = _elapsed_ms(engine_started)

    if matches:
        logger.info("BioCLIP top match: species_id=%s confidence=%.4f (all: %s)",
                     matches[0][0], matches[0][1],
                     [(m[0], round(m[1], 4)) for m in matches[:3]])
    if not matches or matches[0][1] < _CONFIDENCE_FLOOR:
        logger.info(
            "BioCLIP identify no_match raw_matches=%d engine_ms=%s user_ref_ms=%.1f total_ms=%.1f",
            len(matches or []),
            engine_ms,
            user_ref_ms,
            _elapsed_ms(total_started),
        )
        return IdentifyResponse(
            candidates=[],
            confidence="no_match",
            low_confidence=False,
            source="bioclip",
        )

    out: list[CandidateOut] = []
    details_started = time.perf_counter()
    skipped_lazy_enrichment = 0
    for species_id, confidence in matches:
        # Look up species details from DB
        rows = await db.execute_fetchall(
            "SELECT latin_name, common_name_nl, common_name_en "
            "FROM plant_species WHERE id = ?",
            (species_id,),
        )
        if not rows:
            continue

        row = rows[0]
        latin_name = row["latin_name"]

        # Do NOT repair localized metadata in the initial identify hot path.
        # That repair calls the LLM via species_service and can make a fast
        # BioCLIP result wait for minutes when several candidates need backfill.
        # The frontend already falls back to the scientific name, and the
        # slower enrichment remains available in /identify/commit and admin
        # backfills once a user actually chooses a candidate.
        if _needs_localized_species_enrichment(row, latin_name):
            skipped_lazy_enrichment += 1

        # Populate only the requested language's common name bucket,
        # mirroring how _plantnet_candidate_common_names shapes PlantNet results.
        if lang == "nl":
            nl = row.get("common_name_nl") or ""
            nl_names = [nl] if nl and nl.lower() != latin_name.lower() else []
            en_names = []
        else:
            en = row.get("common_name_en") or ""
            en_names = [en] if en and en.lower() != latin_name.lower() else []
            nl_names = []

        # Find any image for thumbnail
        img_rows = await db.execute_fetchall(
            "SELECT url FROM species_images "
            "WHERE species_id = ? AND url != '' "
            "LIMIT 1",
            (species_id,),
        )
        thumb = img_rows[0]["url"] if img_rows else None

        out.append(CandidateOut(
            scientific_name=latin_name,
            common_names_nl=nl_names,
            common_names_en=en_names,
            confidence=round(confidence, 3),
            species_id=species_id,
            thumbnail_url=thumb,
            source="bioclip",
        ))

    # Dedup: strip hybrid marker " x " / " × " to merge duplicate entries
    # (e.g. "Rosa × floribunda" = "Rosa floribunda")
    seen: dict[str, CandidateOut] = {}
    deduped: list[CandidateOut] = []
    for cand in out:
        key = cand.scientific_name.lower().replace(" × ", " ").replace(" x ", " ")
        if key not in seen:
            seen[key] = cand
            deduped.append(cand)
        elif cand.confidence > seen[key].confidence:
            # Replace with higher confidence entry
            deduped.remove(seen[key])
            seen[key] = cand
            deduped.append(cand)
    out = deduped[:_MAX_CANDIDATES]

    top1 = matches[0][1]
    top2 = matches[1][1] if len(matches) > 1 else None
    confidence = _classify_confidence(top1, top2)
    logger.info(
        "BioCLIP identify completed raw_matches=%d candidates=%d confidence=%s "
        "engine_ms=%s user_ref_ms=%.1f details_ms=%.1f total_ms=%.1f skipped_lazy_enrichment=%d",
        len(matches),
        len(out),
        confidence,
        engine_ms,
        user_ref_ms,
        _elapsed_ms(details_started),
        _elapsed_ms(total_started),
        skipped_lazy_enrichment,
    )
    return IdentifyResponse(
        candidates=out,
        confidence=confidence,
        low_confidence=(confidence != "high"),
        source="bioclip",
    )


_SUPPORTED_PLANTNET_LANGS = {"en", "nl", "fr", "de", "es", "it", "pt"}


@router.post("/identify", response_model=IdentifyResponse)
async def identify_endpoint(
    image: UploadFile = File(...),
    extra_images: list[UploadFile] = File(default=[]),
    engine: str = Query("bioclip"),
    lang: str = Query("en"),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    lang = lang if lang in _SUPPORTED_PLANTNET_LANGS else "en"
    # 1. Validate images: 1 primary + up to 2 extra angles (multi-angle ensemble #807)
    uploads = [image, *extra_images]
    if len(uploads) > 3:
        raise HTTPException(
            status_code=400,
            detail=_msg(lang, nl="Maximaal 3 foto's per identificatie", en="At most 3 photos per identification"),
        )
    image_bytes_list = []
    for up in uploads:
        image_bytes = await up.read()
        if len(image_bytes) > _MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=_msg(lang, nl="Afbeelding te groot (max 5 MB)", en="Image too large (max 5 MB)"),
            )
        if up.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise HTTPException(
                status_code=400,
                detail=_msg(lang, nl="Onbekend afbeeldingsformaat", en="Unknown image format"),
            )
        image_bytes_list.append(image_bytes)

    # 2. Try BioCLIP first (self-hosted, no quota) — unless user explicitly chose PlantNet
    if engine != "plantnet":
        try:
            result = await _bioclip_identify(image_bytes_list, db, lang)
            if result is not None:
                await _log_identify(db, account, result.source, result.confidence)
                return result
        except Exception as exc:
            logger.warning("BioCLIP failed, falling back to Pl@ntNet: %s", exc)

    # 3. Fallback: Pl@ntNet API (single image — PlantNet takes one photo)
    await _check_quota(db, account, lang)

    try:
        candidates = await identify(image_bytes_list[0], lang=lang)
    except PlantIdQuotaExceeded:
        raise HTTPException(
            status_code=503,
            detail=_msg(
                lang,
                nl="Identificatie tijdelijk niet beschikbaar",
                en="Identification temporarily unavailable",
            ),
        )
    except PlantIdServiceError:
        raise HTTPException(
            status_code=502,
            detail=_msg(
                lang,
                nl="Kon niet verbinden met identificatieservice",
                en="Could not reach the identification service",
            ),
        )

    await _increment_quota(db, account["account_id"])

    if not candidates or candidates[0].confidence < _CONFIDENCE_FLOOR:
        await _log_identify(db, account, "plantnet", "no_match")
        return IdentifyResponse(
            candidates=[],
            confidence="no_match",
            low_confidence=False,
            source="plantnet",
        )

    top_candidates = candidates[:_MAX_CANDIDATES]
    out: list[CandidateOut] = []
    for c in top_candidates:
        local_details = await _local_catalog_candidate_details(db, c.scientific_name)
        common_nl, common_en = _plantnet_candidate_common_names(c.common_names, lang, local_details)
        thumbnail_url = c.plantnet_image_url or local_details["thumbnail_url"]
        out.append(CandidateOut(
            scientific_name=c.scientific_name,
            common_names_nl=common_nl,
            common_names_en=common_en,
            confidence=c.confidence,
            species_id=local_details["species_id"],
            thumbnail_url=thumbnail_url,
            source="plantnet",
        ))

    top1 = candidates[0].confidence
    top2 = candidates[1].confidence if len(candidates) > 1 else None
    confidence = _classify_confidence(top1, top2)
    await _log_identify(db, account, "plantnet", confidence)
    return IdentifyResponse(
        candidates=out,
        confidence=confidence,
        low_confidence=(confidence != "high"),
        source="plantnet",
    )


class IdentifyCommitRequest(BaseModel):
    scientific_name: str
    photo_base64: str


class IdentifyCommitResponse(BaseModel):
    species_id: int
    # Suggested display name in the language the commit was requested with
    # (?lang=). This is what the journal/garden flows should show and save.
    name_suggested: str
    # DEPRECATED: Dutch-preferred name kept for older clients; new code reads
    # name_suggested. (It also still drives the isIdentifyPrefill duck-typing.)
    name_nl_suggested: str
    scientific_name: str
    icon_key: str | None
    care_thresholds: dict
    photo_path: str


def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.lstrip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _match_icon_key(scientific_name: str) -> str | None:
    genus = scientific_name.strip().split(" ", 1)[0].lower()
    if not genus:
        return None
    candidate = Path(_ICONS_DIR) / f"{genus}.svg"
    if candidate.exists():
        return genus
    return None


async def _enrich_species_if_missing(db, scientific_name: str) -> int | None:
    """Ensure a species row exists and has both localized common names.

    Looks up by latin_name first, enriches existing rows, and only creates a new
    species as last resort. Best-effort: callers should not fail identify flows
    just because the LLM/name backfill is temporarily unavailable.
    """
    row = await db.execute_fetchall(
        "SELECT id FROM plant_species WHERE latin_name = ? LIMIT 1",
        (scientific_name,),
    )

    if row:
        species_id = row[0]["id"]
        from species_service import ensure_species_localized_names
        try:
            await ensure_species_localized_names(db, species_id, scientific_name)
        except Exception:
            pass
        return species_id

    from species_service import get_or_create_species
    try:
        return await get_or_create_species(db, scientific_name)
    except Exception:
        return None


def _save_identify_photo(image_bytes: bytes) -> str:
    key = f"photos/identify_{int(time.time())}.jpg"
    storage = build_storage_from_env()
    return storage.put(key, image_bytes, content_type="image/jpeg")


async def _capture_confirmed_embedding(
    species_id: int, image_bytes: bytes, account_id: int, photo_path: str
) -> None:
    """Deferred: embed the confirmed photo on the GPU worker and store it for
    the user-confirmed retrieval layer. Runs after the commit response."""
    import httpx

    from database import get_db

    async with httpx.AsyncClient(timeout=20) as client:
        emb_resp = await client.post(
            f"{_BIOCLIP_WORKER_URL.rstrip('/')}/embed-image",
            files={"image": ("plant.jpg", image_bytes, "image/jpeg")},
            headers=_worker_headers(),
        )
    if emb_resp.status_code == 200 and len(emb_resp.content) == 2048:
        async with get_db() as db:
            await db.execute(
                """INSERT INTO user_confirmed_embeddings
                     (species_id, embedding, source_account_id, source_photo_url)
                   VALUES (?, ?, ?, ?)""",
                (species_id, emb_resp.content, account_id, photo_path),
            )
            await db.commit()
        logger.info("Captured user-confirmed embedding for species_id=%s", species_id)
    else:
        logger.warning(
            "Worker /embed-image returned status=%s size=%s — skipping capture",
            emb_resp.status_code, len(emb_resp.content),
        )


_COMMIT_SYNC_LIMIT = 64


async def _sync_bioclip_catalog() -> None:
    """Deferred: push newly created species to the worker's reference set (#866).

    A species first seen through a PlantNet correction is inserted with
    `embedded_at IS NULL`, i.e. queued. Draining the queue here is what makes
    the plant identifiable by BioCLIP itself next time, instead of relying on
    the user-confirmed image rescue alone."""
    from database import get_db
    from services.bioclip_catalog_sync import sync_pending

    async with get_db() as db:
        # One batch only — this rides along with a user action, so it should not
        # turn into a catalog-wide job. The periodic reconcile drains backlogs.
        await sync_pending(db, limit=_COMMIT_SYNC_LIMIT)


@router.post("/identify/commit", response_model=IdentifyCommitResponse)
async def identify_commit(
    body: IdentifyCommitRequest,
    lang: str = Query("nl"),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    lang = "en" if lang == "en" else "nl"
    try:
        rows = await db.execute_fetchall(
            "SELECT id, common_name_nl, common_name_en, care_thresholds "
            "FROM plant_species WHERE latin_name = ? LIMIT 1",
            (body.scientific_name,),
        )
    except Exception:
        rows = []

    if rows:
        row = dict(rows[0])
        species_id = row["id"]
        if _needs_localized_species_enrichment(row, body.scientific_name):
            try:
                await _enrich_species_if_missing(db, body.scientific_name)
                refreshed = await db.execute_fetchall(
                    "SELECT id, common_name_nl, common_name_en, care_thresholds "
                    "FROM plant_species WHERE id = ?",
                    (species_id,),
                )
                if refreshed:
                    row = dict(refreshed[0])
            except Exception:
                pass
    else:
        species_id = await _enrich_species_if_missing(db, body.scientific_name)
        if species_id is None:
            raise HTTPException(
                status_code=404,
                detail=_msg(lang, nl="Soort niet gevonden", en="Species not found"),
            )
        re_rows = await db.execute_fetchall(
            "SELECT common_name_nl, common_name_en, care_thresholds FROM plant_species WHERE id = ?",
            (species_id,),
        )
        row = dict(re_rows[0])

    name_suggested = _localized_suggested_name(row, lang, body.scientific_name)
    name_nl = row["common_name_nl"] or row["common_name_en"] or body.scientific_name
    thresholds_raw = row["care_thresholds"]
    thresholds = json.loads(thresholds_raw) if thresholds_raw else {}

    try:
        image_bytes = base64.b64decode(_strip_data_url(body.photo_base64))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=_msg(lang, nl="Onbekend afbeeldingsformaat", en="Unknown image format"),
        )
    # boto3 is synchronous — run the R2 upload in a worker thread so it can't
    # block the event loop (a single stalled upload used to freeze every
    # concurrent request on this one small machine).
    photo_path = await run_in_threadpool(_save_identify_photo, image_bytes)

    # Best-effort: capture the image embedding for the user-confirmed retrieval
    # layer AFTER the response — it's a GPU worker round trip the user never
    # needs to wait for, and failure must never break the commit flow.
    if _BIOCLIP_WORKER_URL:
        account_id = account["account_id"]
        fire_and_forget(
            lambda: _capture_confirmed_embedding(species_id, image_bytes, account_id, photo_path),
            f"embed-capture species={species_id}",
        )
        # And teach the identifier the species itself, not just this photo:
        # drains the pending-embedding queue, which a just-created species
        # (embedded_at NULL) is already in.
        fire_and_forget(_sync_bioclip_catalog, f"catalog-sync species={species_id}")

    return IdentifyCommitResponse(
        species_id=species_id,
        name_suggested=name_suggested,
        name_nl_suggested=name_nl,
        scientific_name=body.scientific_name,
        icon_key=_match_icon_key(body.scientific_name),
        care_thresholds=thresholds,
        photo_path=photo_path,
    )

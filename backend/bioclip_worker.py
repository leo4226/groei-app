"""
Lightweight BioCLIP inference worker — GPU-only, no auth, no DB.

Exposes a single POST /identify endpoint that accepts an image and returns
BioCLIP matches as a JSON array. Designed to run behind a Cloudflare Tunnel
so the production backend (Fly.io, no GPU) can offload ML inference here.
"""
import asyncio
import base64
import io
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import anyio
import numpy as np
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from services.bioclip_id import build_prompts as _build_prompts
from services.bioclip_id import center_crop as _center_crop
from services.bioclip_id import image_quality_report as _image_quality_report
from PIL import Image
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bioclip_worker")

_EMBEDDINGS_DIR = Path(__file__).resolve().parent / "data" / "bioclip"
_EMBEDDINGS_PATH = _EMBEDDINGS_DIR / "species_embeddings.npy"
_SPECIES_IDS_PATH = _EMBEDDINGS_DIR / "species_ids.npy"
_META_PATH = _EMBEDDINGS_DIR / "meta.json"
_MODEL_NAME = "hf-hub:imageomics/bioclip"

_MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Species per /embed-text request. Bounds one GPU pass, and doubles as the
# "torn write" tolerance when reloading a catalog (see _load_embeddings).
_MAX_EMBED_TEXT_BATCH = 256

# Shared secret. When set, /identify and /embed-image require a matching
# X-Worker-Token header. Empty => auth disabled (local dev / not yet rolled out).
_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")

# Serializes GPU inference — the model is not thread-safe and we run on one GPU.
# Held only around the threaded compute, so /health stays responsive meanwhile.
_infer_lock = asyncio.Lock()

# --- BioCLIP model (lazy-loaded on first request) ---
_model = None
_preprocess = None
_tokenizer = None
_device = None
_text_embeddings: np.ndarray | None = None
_species_ids: list[int] | None = None
_species_names: list[str] | None = None


def _load_model():
    global _model, _preprocess, _tokenizer, _device
    if _model is not None:
        return
    import open_clip
    import torch

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading BioCLIP on %s...", _device)
    model, _, preprocess = open_clip.create_model_and_transforms(_MODEL_NAME)
    _model = model.to(_device)
    _model.eval()
    _preprocess = preprocess
    _tokenizer = open_clip.get_tokenizer(_MODEL_NAME)
    logger.info("BioCLIP model loaded")


def _load_embeddings():
    global _text_embeddings, _species_ids, _species_names
    if _text_embeddings is not None:
        return True
    if not _EMBEDDINGS_PATH.exists() or not _SPECIES_IDS_PATH.exists():
        logger.error("Embeddings not found at %s", _EMBEDDINGS_PATH)
        return False
    embeddings = np.load(_EMBEDDINGS_PATH)
    ids_and_names = np.load(_SPECIES_IDS_PATH, allow_pickle=True)
    if len(ids_and_names) != embeddings.shape[0]:
        # The two files are written by two os.replace calls, so a crash between
        # them leaves one file a few rows ahead. Both are append-ordered and
        # replacements happen in place, so the common prefix is a consistent
        # (merely older) catalog — recover from it instead of leaving the worker
        # dead until someone rebuilds by hand. The species dropped this way is
        # still queued backend-side (embedded_at is only set on HTTP 200), so
        # the next sync re-adds it. A gap bigger than one batch is not a torn
        # write but genuine corruption, and still refuses to load.
        gap = abs(len(ids_and_names) - embeddings.shape[0])
        if gap > _MAX_EMBED_TEXT_BATCH:
            logger.error(
                "Embedding/id misalignment: %d ids vs %d embedding rows — refusing to load",
                len(ids_and_names), embeddings.shape[0],
            )
            return False
        usable = min(len(ids_and_names), embeddings.shape[0])
        logger.warning(
            "Embedding/id misalignment (%d ids vs %d rows) — torn write, "
            "recovering the first %d aligned species",
            len(ids_and_names), embeddings.shape[0], usable,
        )
        embeddings = embeddings[:usable]
        ids_and_names = ids_and_names[:usable]
    _text_embeddings = embeddings
    _species_ids = [int(x[0]) for x in ids_and_names]
    # Latin names are kept in memory (not just on disk) because /embed-text
    # rewrites the id file on every incremental update and must preserve them.
    _species_names = [str(x[1]) for x in ids_and_names]
    logger.info(
        "Loaded %d species embeddings (shape: %s)",
        len(_species_ids), _text_embeddings.shape,
    )
    return True


async def _read_upload_to_pil(image: UploadFile) -> Image.Image:
    """Read an upload, enforce size cap, decode to PIL RGB. Raises HTTPException(400) on failure."""
    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")
    try:
        return Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")


def _embed_pil_to_float32(pil_image: Image.Image) -> np.ndarray:
    """Encode a PIL image into a 512-dim L2-normalised float32 numpy array."""
    # Center-crop first (drop background rim), then the model's own resize.
    # Default OFF (1.0 = no-op): measured on the GBIF eval, any center crop
    # hurts (GBIF frames are already tight). The crop targets phone photos
    # with pot/soil/mulch background — validate it there (#806 real-photo
    # window) and enable via BIOCLIP_CROP_FRACTION (e.g. 0.9) when it wins.
    import torch

    crop_frac = float(os.environ.get("BIOCLIP_CROP_FRACTION", "1.0"))
    pil_image = _center_crop(pil_image, fraction=crop_frac)
    image_tensor = _preprocess(pil_image).unsqueeze(0).to(_device)
    with torch.no_grad():
        emb = _model.encode_image(image_tensor)
        emb = emb / emb.norm(dim=-1, keepdim=True)
    return emb.cpu().numpy().squeeze().astype(np.float32)


def _encode_species(entries: list["SpeciesPrompt"]) -> np.ndarray:
    """Encode species into (N, 512) unit vectors using the shared prompt ensemble.

    Identical maths to scripts/precompute_embeddings.py (same templates, mean of
    the ensemble, re-normalised) so a species added live lands in exactly the
    same space as the batch-built rows.
    """
    import torch

    _load_model()

    prompts_per_species = [_build_prompts(e.latin_name, e.common_name_en) for e in entries]
    flat_prompts = [p for prompts in prompts_per_species for p in prompts]
    tokens = _tokenizer(flat_prompts).to(_device)
    with torch.no_grad():
        embeddings = _model.encode_text(tokens)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
    embeddings = embeddings.cpu().numpy().astype(np.float32)

    per_species = []
    offset = 0
    for prompts in prompts_per_species:
        chunk = embeddings[offset : offset + len(prompts)]
        mean = chunk.mean(axis=0)
        norm = np.linalg.norm(mean)
        per_species.append(mean / norm if norm > 0 else mean)
        offset += len(prompts)
    return np.stack(per_species).astype(np.float32)


def _persist_catalog(embeddings: np.ndarray, ids: list[int], names: list[str]) -> None:
    """Write the reference set to disk atomically (temp file + os.replace).

    A crash mid-write must never leave a truncated .npy behind: the worker would
    then boot with a misaligned catalog (or none at all) and serve 503s.
    """
    _EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    ids_and_names = np.array(list(zip(ids, names)), dtype=object)

    emb_tmp = _EMBEDDINGS_DIR / "species_embeddings.tmp.npy"
    ids_tmp = _EMBEDDINGS_DIR / "species_ids.tmp.npy"
    np.save(str(emb_tmp), embeddings)
    np.save(str(ids_tmp), ids_and_names)
    os.replace(emb_tmp, _EMBEDDINGS_PATH)
    os.replace(ids_tmp, _SPECIES_IDS_PATH)

    # Keep meta.json honest — /coverage reports it as the staleness signal, and
    # after an incremental update the batch `generated_at` alone would lie.
    meta = {}
    try:
        if _META_PATH.exists():
            meta = json.loads(_META_PATH.read_text(encoding="utf-8"))
        if not isinstance(meta, dict):
            meta = {}
    except Exception:
        meta = {}
    meta["species_count"] = len(ids)
    meta["embeddings_shape"] = list(embeddings.shape)
    meta["catalog_updated_at"] = datetime.now(timezone.utc).isoformat()
    meta.setdefault("prompt_strategy", "ensemble")
    try:
        _META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:  # meta is diagnostics only — never fail the update
        logger.warning("Could not update meta.json: %s", exc)


def _apply_species_embeddings(entries: list["SpeciesPrompt"]) -> dict:
    """Encode `entries` and merge them into the live reference set + disk.

    Existing species_ids are replaced in place (re-embedding after a name
    change), unknown ones appended. Runs on a worker thread, called under
    `_infer_lock` so it can never interleave with an in-flight identify.
    """
    global _text_embeddings, _species_ids, _species_names

    vectors = _encode_species(entries)

    ids = list(_species_ids or [])
    names = list(_species_names or [])
    rows = [row for row in _text_embeddings]
    if rows and vectors.shape[1] != len(rows[0]):
        raise ValueError(
            f"Embedding dim mismatch: catalog {len(rows[0])} vs new {vectors.shape[1]}"
        )

    position = {sid: i for i, sid in enumerate(ids)}
    added: list[int] = []
    updated: list[int] = []
    for entry, vector in zip(entries, vectors):
        index = position.get(entry.species_id)
        if index is None:
            position[entry.species_id] = len(ids)
            ids.append(entry.species_id)
            names.append(entry.latin_name)
            rows.append(vector)
            added.append(entry.species_id)
        else:
            rows[index] = vector
            names[index] = entry.latin_name
            updated.append(entry.species_id)

    matrix = np.stack(rows).astype(np.float32)
    _persist_catalog(matrix, ids, names)

    _text_embeddings, _species_ids, _species_names = matrix, ids, names
    return {"added": added, "updated": updated, "species_count": len(ids)}


def _identify_image(image: Image.Image, top_k: int = 5) -> tuple[list[dict], np.ndarray]:
    """Embed image, match against text embeddings, return top-K + the raw embedding."""
    _load_model()

    image_emb = _embed_pil_to_float32(image)

    similarities = _text_embeddings @ image_emb
    top_indices = np.argsort(similarities)[-top_k:][::-1]

    results = []
    for idx in top_indices:
        results.append({
            "species_id": int(_species_ids[idx]),
            "confidence": round(float(similarities[idx]), 4),
        })
    return results, image_emb


def _identify_multi(images: list[Image.Image], top_k: int = 5) -> tuple[list[dict], np.ndarray]:
    """Embed several angles, average the L2-normed embeddings (multi-angle
    ensemble, audit §3.2 / #807), then match against text embeddings."""
    from services.bioclip_id import average_embeddings

    _load_model()
    embeddings = [_embed_pil_to_float32(img) for img in images]
    image_emb = average_embeddings(embeddings)

    similarities = _text_embeddings @ image_emb
    top_indices = np.argsort(similarities)[-top_k:][::-1]

    results = []
    for idx in top_indices:
        results.append({
            "species_id": int(_species_ids[idx]),
            "confidence": round(float(similarities[idx]), 4),
        })
    return results, image_emb


# --- FastAPI app ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BioCLIP worker starting — preloading model + embeddings...")
    try:
        _load_model()
        if not _load_embeddings():
            logger.error("Failed to load embeddings — worker will return 503")
    except Exception as e:
        logger.error("Startup error: %s", e)
    yield


app = FastAPI(title="BioCLIP Worker", lifespan=lifespan)


async def _require_token(x_worker_token: str | None = Header(default=None)):
    """Enforce the shared secret when one is configured. No-op if _WORKER_TOKEN is empty."""
    if _WORKER_TOKEN and x_worker_token != _WORKER_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing worker token")


@app.post("/identify", dependencies=[Depends(_require_token)])
async def identify(
    image: UploadFile = File(...),
    extra_images: list[UploadFile] = File(default=[]),
):
    """Accept one image, or 1-2 extra angles alongside it (multi-angle
    ensemble, #807). Single-image behavior is unchanged when extra_images
    is empty."""
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")
    if _text_embeddings is None:
        raise HTTPException(status_code=503, detail="Embeddings not loaded")
    if len(extra_images) > 2:
        raise HTTPException(status_code=400, detail="At most 3 images per request")

    uploads = [image, *extra_images]
    pil_images = []
    for up in uploads:
        try:
            pil_images.append(await _read_upload_to_pil(up))
        except HTTPException as exc:
            logger.warning("Skipping unusable angle: %s", exc.detail)

    if not pil_images:
        raise HTTPException(status_code=400, detail="Could not decode any image")

    # Cheap quality diagnostics (resolution / blur / lighting) — log-only,
    # never reject. Helps the #806/#809 validation tell *why* a photo failed.
    quality = _image_quality_report(pil_images[0])
    if any(quality.get(k) for k in ("low_resolution", "blurry", "too_dark", "too_bright")):
        flags = [k for k in ("low_resolution", "blurry", "too_dark", "too_bright") if quality.get(k)]
        logger.info("Image quality flags %s (w=%s h=%s lap=%.1f luma=%.0f)",
                    flags, quality["width"], quality["height"],
                    quality["laplacian_variance"], quality["mean_luma"])

    try:
        async with _infer_lock:
            if len(pil_images) == 1:
                matches, image_emb = await anyio.to_thread.run_sync(_identify_image, pil_images[0])
            else:
                matches, image_emb = await anyio.to_thread.run_sync(_identify_multi, pil_images)
    except Exception as e:
        logger.error("Inference error: %s", e)
        raise HTTPException(status_code=500, detail="Inference failed")

    return {
        "matches": matches,
        "source": "bioclip",
        "embedding": base64.b64encode(image_emb.tobytes()).decode(),
    }


@app.post("/embed-image", dependencies=[Depends(_require_token)])
async def embed_image(image: UploadFile = File(...)):
    """Encode an image into BioCLIP's 512-dim embedding space. Returns
    the raw 2048 bytes (512 × float32) as application/octet-stream.

    Used by the backend to capture user-confirmed image embeddings for
    the retrieval layer (see /identify/commit).
    """
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")

    pil_image = await _read_upload_to_pil(image)
    async with _infer_lock:
        image_emb = await anyio.to_thread.run_sync(_embed_pil_to_float32, pil_image)
    return Response(content=image_emb.tobytes(), media_type="application/octet-stream")


class SpeciesPrompt(BaseModel):
    species_id: int
    latin_name: str
    common_name_en: str | None = None


class EmbedTextRequest(BaseModel):
    species: list[SpeciesPrompt]


@app.post("/embed-text", dependencies=[Depends(_require_token)])
async def embed_text(body: EmbedTextRequest):
    """Add (or re-embed) species in the live reference set.

    This is what lets a species the user just taught us — typically one PlantNet
    corrected and BioCLIP had never heard of — become identifiable without a
    manual precompute_embeddings.py run and worker restart. The update is
    applied in memory AND persisted, so it survives the next restart.
    """
    if _model is None:
        raise HTTPException(status_code=503, detail="BioCLIP model not loaded")
    if _text_embeddings is None:
        # Refuse to bootstrap a catalog from an incremental call: serving
        # identify against a handful of species would be worse than 503.
        raise HTTPException(status_code=503, detail="Embeddings not loaded")

    entries = [e for e in body.species if e.latin_name.strip()]
    if not entries:
        raise HTTPException(status_code=400, detail="No species with a latin_name given")
    if len(entries) > _MAX_EMBED_TEXT_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"At most {_MAX_EMBED_TEXT_BATCH} species per request",
        )

    try:
        async with _infer_lock:
            result = await anyio.to_thread.run_sync(_apply_species_embeddings, entries)
    except Exception as e:
        logger.error("embed-text failed: %s", e)
        raise HTTPException(status_code=500, detail="Embedding failed")

    logger.info(
        "embed-text: %d added, %d updated, catalog now %d species",
        len(result["added"]), len(result["updated"]), result["species_count"],
    )
    return result


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "embeddings_loaded": _text_embeddings is not None,
        "device": _device or "unknown",
    }


@app.get("/coverage", dependencies=[Depends(_require_token)])
async def coverage():
    """Return the currently loaded BioCLIP reference species IDs.

    The Fly backend uses this to compare live DB species against the worker's
    precomputed embedding snapshot. This endpoint does not expose embeddings or
    user data, only integer species IDs and aggregate readiness metadata.
    """
    ready = _model is not None and _text_embeddings is not None and _species_ids is not None
    meta = {}
    try:
        if _META_PATH.exists():
            meta = json.loads(_META_PATH.read_text(encoding="utf-8"))
    except Exception:
        meta = {}
    return {
        "ready": ready,
        "model_loaded": _model is not None,
        "embeddings_loaded": _text_embeddings is not None,
        "device": _device or "unknown",
        "species_count": len(_species_ids or []),
        "species_ids": list(_species_ids or []),
        # Staleness (§7): when the reference embeddings were generated and with
        # what prompt strategy. Compare `generated_at` against species-table
        # changes to decide whether a regenerate is due.
        "embeddings_generated_at": meta.get("generated_at"),
        # Last incremental /embed-text write, if any — a catalog kept fresh by
        # the sync loop stays useful even when `generated_at` is months old.
        "catalog_updated_at": meta.get("catalog_updated_at"),
        "prompt_strategy": meta.get("prompt_strategy", "unknown"),
    }


if __name__ == "__main__":
    port = int(os.environ.get("BIOCLIP_PORT", "8001"))
    # Loopback only: cloudflared connects via localhost, so there is no reason
    # to expose the worker to the LAN.
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

import base64
import logging
import os
import random
import struct
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account

logger = logging.getLogger(__name__)

router = APIRouter(tags=["game"])

# Characters for join codes — exclude ambiguous 0/O/I/1
_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

_BIOCLIP_WORKER_URL = os.environ.get("BIOCLIP_WORKER_URL", "")
_BIOCLIP_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")
_EMBED_THRESHOLD = float(os.environ.get("GAME_EMBED_THRESHOLD", "0.82"))


def _worker_headers() -> dict:
    return {"X-Worker-Token": _BIOCLIP_WORKER_TOKEN} if _BIOCLIP_WORKER_TOKEN else {}


async def _embed_bytes(image_bytes: bytes) -> str | None:
    """POST image bytes to BioCLIP worker /embed-image; return base64-encoded 512-d vector or None."""
    if not _BIOCLIP_WORKER_URL:
        return None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{_BIOCLIP_WORKER_URL.rstrip('/')}/embed-image",
                files={"image": ("plant.jpg", image_bytes, "image/jpeg")},
                headers=_worker_headers(),
            )
        if resp.status_code == 200 and len(resp.content) == 2048:
            return base64.b64encode(resp.content).decode()
    except Exception as exc:
        logger.warning("Game embed failed: %s", exc)
    return None


async def _embed_url(url: str) -> str | None:
    """Download an image from a URL and return its BioCLIP embedding as base64, or None."""
    if not url or not _BIOCLIP_WORKER_URL:
        return None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=20) as client:
            img = await client.get(url, timeout=15)
        if img.status_code != 200:
            return None
        return await _embed_bytes(img.content)
    except Exception as exc:
        logger.warning("Game embed_url failed for %s: %s", url, exc)
    return None


def _cosine_sim(a_b64: str, b_b64: str) -> float:
    """Cosine similarity between two base64-encoded 512-d float32 vectors."""
    a = struct.unpack("512f", base64.b64decode(a_b64))
    b = struct.unpack("512f", base64.b64decode(b_b64))
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0


def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.lstrip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _make_code() -> str:
    return "".join(random.choices(_CODE_CHARS, k=6))


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Species matching ──────────────────────────────────────────────────────────

def _normalise(s: str) -> str:
    return s.lower().strip()


def _species_matches(scanned: str, target: str, alt_names: list[str]) -> bool:
    """Case-insensitive match against target + any alternate common names."""
    scanned_n = _normalise(scanned)
    candidates = [_normalise(target)] + [_normalise(n) for n in alt_names if n]
    return scanned_n in candidates


# ── Pydantic models ───────────────────────────────────────────────────────────

class GameCreateRequest(BaseModel):
    map_id: int
    plant_ids: list[int]
    clue_mode: str = "photo"  # "photo" | "name" | "logbook"
    # How many rounds to play. With "select all" a selection can be large; the
    # backend randomly samples this many plants (capped at MAX_ROUNDS).
    round_count: int | None = None


# Physical hunts get exhausting past this; also bounds hint/embed work at create.
MAX_ROUNDS = 15
MAX_SELECTABLE = 50


class AnswerRequest(BaseModel):
    scanned_species: str
    confidence: float = 0.0
    candidates: list[str] = []
    image_data_url: str | None = None  # base64 data URL for embedding similarity


# ── Helper: build full session state ─────────────────────────────────────────

async def _build_state(db, code: str, account_id: int) -> dict:
    rows = await db.execute_fetchall(
        """SELECT gs.*, m.name AS map_name, m.slug AS map_slug,
                  a.name AS host_name
           FROM game_sessions gs
           JOIN maps m ON m.id = gs.map_id
           JOIN accounts a ON a.id = gs.host_account_id
           WHERE gs.join_code = ?""",
        (code,),
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])

    players_rows = await db.execute_fetchall(
        """SELECT gp.id, gp.account_id, gp.score, a.name AS player_name
           FROM game_players gp
           JOIN accounts a ON a.id = gp.account_id
           WHERE gp.session_id = ?
           ORDER BY gp.score DESC, gp.joined_at""",
        (session["id"],),
    )
    players = [dict(r) for r in players_rows]

    rounds_rows = await db.execute_fetchall(
        """SELECT id, round_index, plant_name_nl, plant_name_en,
                  clue_photo_url, clue_hint_nl, clue_hint_en, target_embedding
           FROM game_rounds WHERE session_id = ? ORDER BY round_index""",
        (session["id"],),
    )
    rounds = [dict(r) for r in rounds_rows]

    # Per-player answered status for current round
    current_round_id = None
    if rounds and session["status"] == "active":
        idx = session["current_round"]
        current = next((r for r in rounds if r["round_index"] == idx), None)
        if current:
            current_round_id = current["id"]

    answered_ids: set[int] = set()
    if current_round_id:
        ans_rows = await db.execute_fetchall(
            "SELECT player_id FROM game_answers WHERE round_id = ? AND is_correct = TRUE",
            (current_round_id,),
        )
        answered_ids = {r["player_id"] for r in ans_rows}

    # Map game_players.id for the answered lookup
    player_id_map = {p["account_id"]: p["id"] for p in players}
    for p in players:
        p["answered_current_round"] = p["id"] in answered_ids

    # My answer for current round
    my_answer = None
    my_player_id = player_id_map.get(account_id)
    if my_player_id and current_round_id:
        my_rows = await db.execute_fetchall(
            "SELECT is_correct, points_awarded, answered_at FROM game_answers WHERE round_id = ? AND player_id = ?",
            (current_round_id, my_player_id),
        )
        if my_rows:
            my_answer = dict(my_rows[0])

    total_rounds = len(rounds)
    current_clue = None
    if rounds and session["status"] in ("active", "finished"):
        idx = session["current_round"]
        current_clue = next((r for r in rounds if r["round_index"] == idx), None)

    # Per-round stats for the host's end-screen breakdown (#245). Only computed
    # once the game is finished so the 3s polling loop stays cheap.
    round_stats = None
    if session["status"] == "finished" and rounds:
        ans_rows = await db.execute_fetchall(
            """SELECT ga.answered_at, gr.started_at, gr.round_index
               FROM game_answers ga
               JOIN game_rounds gr ON gr.id = ga.round_id
               WHERE gr.session_id = ? AND ga.is_correct = TRUE""",
            (session["id"],),
        )
        counts: dict[int, int] = {}
        times: dict[int, list[float]] = {}
        for a in ans_rows:
            a = dict(a)
            ridx = a["round_index"]
            counts[ridx] = counts.get(ridx, 0) + 1
            started, answered = a.get("started_at"), a.get("answered_at")
            if isinstance(started, str):
                started = datetime.fromisoformat(started)
            if isinstance(answered, str):
                answered = datetime.fromisoformat(answered)
            if started and answered:
                times.setdefault(ridx, []).append((answered - started).total_seconds())
        round_stats = [
            {
                "round_index": r["round_index"],
                "plant_name_nl": r["plant_name_nl"],
                "plant_name_en": r["plant_name_en"],
                "answered_count": counts.get(r["round_index"], 0),
                "avg_seconds": (
                    round(sum(times[r["round_index"]]) / len(times[r["round_index"]]))
                    if times.get(r["round_index"])
                    else None
                ),
            }
            for r in rounds
        ]

    return {
        "session": {
            "id": session["id"],
            "join_code": session["join_code"],
            "status": session["status"],
            "current_round": session["current_round"],
            "total_rounds": total_rounds,
            "map_name": session["map_name"],
            "map_slug": session["map_slug"],
            "host_account_id": session["host_account_id"],
            "host_name": session["host_name"],
            "clue_mode": session.get("clue_mode", "photo"),
        },
        "players": players,
        "current_clue": current_clue,
        "rounds": rounds,
        "my_answer": my_answer,
        # So the client can highlight the viewer's own leaderboard row (#245).
        "my_player_id": my_player_id,
        "round_stats": round_stats,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/games", status_code=201)
async def create_game(
    body: GameCreateRequest,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    if len(body.plant_ids) < 3:
        raise HTTPException(400, "Select at least 3 plants")
    if len(body.plant_ids) > MAX_SELECTABLE:
        raise HTTPException(400, f"Select at most {MAX_SELECTABLE} plants")

    # Verify map belongs to this household and is outdoor
    map_rows = await db.execute_fetchall(
        "SELECT id, map_type FROM maps WHERE id = ? AND household_id = ?",
        (body.map_id, account["household_id"]),
    )
    if not map_rows:
        raise HTTPException(404, "Map not found")
    if dict(map_rows[0])["map_type"] != "outdoor":
        raise HTTPException(400, "Garden game is only available for outdoor maps")

    # Generate unique join code
    for _ in range(10):
        code = _make_code()
        existing = await db.execute_fetchall(
            "SELECT id FROM game_sessions WHERE join_code = ?", (code,)
        )
        if not existing:
            break
    else:
        raise HTTPException(500, "Could not generate unique join code")

    clue_mode = body.clue_mode if body.clue_mode in ("photo", "name", "logbook") else "photo"

    # Validate plants against the map FIRST, then sample down to the requested
    # round count — sampling before validation could silently shrink the game.
    valid_plants: list[dict] = []
    for plant_id in body.plant_ids:
        plant_rows = await db.execute_fetchall(
            """SELECT p.id, p.name, p.photo_path,
                      s.common_name_nl, s.common_name_en, s.latin_name
               FROM plants p
               LEFT JOIN plant_species s ON s.id = p.species_id
               WHERE p.id = ? AND p.map_id = ? AND p.is_active = 1""",
            (plant_id, body.map_id),
        )
        if plant_rows:
            valid_plants.append(dict(plant_rows[0]))

    if len(valid_plants) < 3:
        raise HTTPException(400, "Select at least 3 plants")

    k = min(body.round_count or len(valid_plants), MAX_ROUNDS, len(valid_plants))
    k = max(k, 3)
    # random.sample also shuffles round order, so hunts don't follow selection order.
    chosen = random.sample(valid_plants, k)

    await db.execute(
        """INSERT INTO game_sessions (join_code, host_account_id, map_id, status, current_round, created_at, clue_mode)
           VALUES (?, ?, ?, 'waiting', 0, ?, ?)""",
        (code, account["account_id"], body.map_id, _now(), clue_mode),
    )
    session_rows = await db.execute_fetchall(
        "SELECT id FROM game_sessions WHERE join_code = ?", (code,)
    )
    session_id = dict(session_rows[0])["id"]

    # Add host as first player
    await db.execute(
        "INSERT INTO game_players (session_id, account_id, score) VALUES (?, ?, 0)",
        (session_id, account["account_id"]),
    )

    for i, p in enumerate(chosen):
        # Build target species string — prefer Latin, fall back to common names
        target = p.get("latin_name") or p.get("common_name_nl") or p["name"]
        name_nl = p.get("common_name_nl") or p["name"]
        name_en = p.get("common_name_en") or p["name"]

        clue_photo = p.get("photo_path")
        if clue_mode == "logbook":
            # Logbook quiz: the clue is a random progress photo from the plant's
            # logbook — harder and more personal than the profile shot. Fall
            # back to the profile photo for plants without logbook entries.
            photo_rows = await db.execute_fetchall(
                "SELECT url FROM plant_photos WHERE plant_id = ? ORDER BY RANDOM() LIMIT 1",
                (p["id"],),
            )
            if photo_rows:
                clue_photo = dict(photo_rows[0])["url"] or clue_photo

        # Embeddings only matter for camera-scan verification; the logbook quiz
        # is answered by tapping options, so skip the (slow) worker round-trips.
        embedding = None
        if clue_mode != "logbook":
            embedding = await _embed_url(p.get("photo_path") or "")

        await db.execute(
            """INSERT INTO game_rounds
               (session_id, round_index, plant_id, plant_name_nl, plant_name_en,
                target_species, clue_photo_url, target_embedding)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, i, p["id"], name_nl, name_en, target,
             clue_photo, embedding),
        )

    await db.commit()
    return {"join_code": code}


@router.get("/games/{code}")
async def get_game_state(
    code: str,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    return await _build_state(db, code.upper(), account["account_id"])


@router.post("/games/{code}/join")
async def join_game(
    code: str,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    rows = await db.execute_fetchall(
        "SELECT id, status FROM game_sessions WHERE join_code = ?", (code.upper(),)
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if session["status"] != "waiting":
        raise HTTPException(400, "Game has already started")

    # Idempotent — joining twice is fine
    existing = await db.execute_fetchall(
        "SELECT id FROM game_players WHERE session_id = ? AND account_id = ?",
        (session["id"], account["account_id"]),
    )
    if not existing:
        await db.execute(
            "INSERT INTO game_players (session_id, account_id, score) VALUES (?, ?, 0)",
            (session["id"], account["account_id"]),
        )
        await db.commit()

    return await _build_state(db, code.upper(), account["account_id"])


@router.post("/games/{code}/start")
async def start_game(
    code: str,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    rows = await db.execute_fetchall(
        "SELECT id, host_account_id, status FROM game_sessions WHERE join_code = ?",
        (code.upper(),),
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if session["host_account_id"] != account["account_id"]:
        raise HTTPException(403, "Only the host can start the game")
    if session["status"] != "waiting":
        raise HTTPException(400, "Game is not in waiting state")

    now = _now()
    await db.execute(
        "UPDATE game_sessions SET status = 'active', started_at = ?, current_round = 0 WHERE id = ?",
        (now, session["id"]),
    )
    # Mark round 0 as started
    await db.execute(
        "UPDATE game_rounds SET started_at = ? WHERE session_id = ? AND round_index = 0",
        (now, session["id"]),
    )
    await db.commit()
    return await _build_state(db, code.upper(), account["account_id"])


@router.post("/games/{code}/next")
async def next_round(
    code: str,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    rows = await db.execute_fetchall(
        "SELECT id, host_account_id, status, current_round FROM game_sessions WHERE join_code = ?",
        (code.upper(),),
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if session["host_account_id"] != account["account_id"]:
        raise HTTPException(403, "Only the host can advance rounds")
    if session["status"] != "active":
        raise HTTPException(400, "Game is not active")

    total_rows = await db.execute_fetchall(
        "SELECT COUNT(*) AS cnt FROM game_rounds WHERE session_id = ?", (session["id"],)
    )
    total = dict(total_rows[0])["cnt"]
    next_idx = session["current_round"] + 1

    now = _now()
    if next_idx >= total:
        # End the game
        await db.execute(
            "UPDATE game_sessions SET status = 'finished', finished_at = ? WHERE id = ?",
            (now, session["id"]),
        )
    else:
        await db.execute(
            "UPDATE game_sessions SET current_round = ? WHERE id = ?",
            (next_idx, session["id"]),
        )
        await db.execute(
            "UPDATE game_rounds SET started_at = ? WHERE session_id = ? AND round_index = ?",
            (now, session["id"], next_idx),
        )
    await db.commit()
    return await _build_state(db, code.upper(), account["account_id"])


@router.post("/games/{code}/answer")
async def submit_answer(
    code: str,
    body: AnswerRequest,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    rows = await db.execute_fetchall(
        "SELECT id, status, current_round FROM game_sessions WHERE join_code = ?",
        (code.upper(),),
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if session["status"] != "active":
        raise HTTPException(400, "Game is not active")

    # Verify player is in the game
    player_rows = await db.execute_fetchall(
        "SELECT id FROM game_players WHERE session_id = ? AND account_id = ?",
        (session["id"], account["account_id"]),
    )
    if not player_rows:
        raise HTTPException(403, "You have not joined this game")
    player_id = dict(player_rows[0])["id"]

    # Get current round
    round_rows = await db.execute_fetchall(
        """SELECT id, target_species, plant_name_nl, plant_name_en,
                  started_at, target_embedding
           FROM game_rounds WHERE session_id = ? AND round_index = ?""",
        (session["id"], session["current_round"]),
    )
    if not round_rows:
        raise HTTPException(404, "Round not found")
    rnd = dict(round_rows[0])

    # Already answered correctly — reject
    existing = await db.execute_fetchall(
        "SELECT id, is_correct FROM game_answers WHERE round_id = ? AND player_id = ?",
        (rnd["id"], player_id),
    )
    if existing and dict(existing[0])["is_correct"]:
        raise HTTPException(400, "Already answered correctly")

    # Species-name match — accept if primary scanned or any candidate matches
    alt_names = [rnd["plant_name_nl"], rnd["plant_name_en"]]
    all_candidates = [body.scanned_species] + body.candidates
    is_correct = any(
        _species_matches(c, rnd["target_species"], alt_names)
        for c in all_candidates
        if c
    )

    # Embedding similarity — try if we have a reference embedding and a scan image
    if not is_correct and rnd.get("target_embedding") and body.image_data_url:
        try:
            scan_bytes = base64.b64decode(_strip_data_url(body.image_data_url))
            scan_embedding = await _embed_bytes(scan_bytes)
            if scan_embedding:
                sim = _cosine_sim(rnd["target_embedding"], scan_embedding)
                logger.info("Game embedding similarity=%.4f threshold=%.2f", sim, _EMBED_THRESHOLD)
                if sim >= _EMBED_THRESHOLD:
                    is_correct = True
        except Exception as exc:
            logger.warning("Game embedding similarity check failed: %s", exc)

    points = 0
    if is_correct:
        # Speed bonus: up to 50 extra points within 60 seconds of round start
        points = 100
        started = rnd["started_at"]
        if isinstance(started, str):  # aiosqlite (tests) returns TEXT
            started = datetime.fromisoformat(started)
        if started:
            elapsed = (_now() - started).total_seconds()
            speed_bonus = max(0, int(50 * (1 - elapsed / 60)))
            points += speed_bonus

    now = _now()
    if existing:
        # Update existing wrong answer
        await db.execute(
            "UPDATE game_answers SET scanned_species = ?, is_correct = ?, points_awarded = ?, answered_at = ? WHERE round_id = ? AND player_id = ?",
            (body.scanned_species, is_correct, points, now, rnd["id"], player_id),
        )
    else:
        await db.execute(
            "INSERT INTO game_answers (round_id, player_id, scanned_species, is_correct, points_awarded, answered_at) VALUES (?, ?, ?, ?, ?, ?)",
            (rnd["id"], player_id, body.scanned_species, is_correct, points, now),
        )

    if is_correct:
        await db.execute(
            "UPDATE game_players SET score = score + ? WHERE id = ?",
            (points, player_id),
        )

    await db.commit()
    return {"is_correct": is_correct, "points_awarded": points}


@router.delete("/games/{code}", status_code=204)
async def delete_game(
    code: str,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    rows = await db.execute_fetchall(
        "SELECT id, host_account_id FROM game_sessions WHERE join_code = ?", (code.upper(),)
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if session["host_account_id"] != account["account_id"]:
        raise HTTPException(403, "Only the host can delete the game")

    await db.execute("DELETE FROM game_sessions WHERE id = ?", (session["id"],))
    await db.commit()

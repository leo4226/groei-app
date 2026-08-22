"""Garden game — a plant hunt you can run at a party.

Three clue modes (photo / name / logbook quiz) and two pacings:

- **host**: the host taps through rounds. Good for four people round a table.
- **race**: everyone gets the same clue at once and the round closes on a timer
  or once enough players have found it. Nobody has to referee.

Guests play without a Floreren account — they type a name, get a session-scoped
guest token, and scan through `POST /games/{code}/scan`, which is the only
identify path a guest can reach. Grading is deliberately forgiving; see
`services/game_matching.py` for why.
"""

import asyncio
import base64
import json
import logging
import os
import random
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, File, Query, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from pydantic import BaseModel, Field

from database import db_dep
from auth import (
    create_guest_token,
    decode_guest_token,
    get_current_account_from_token,
)
from services.game_matching import (
    as_vector,
    best_name_match,
    best_similarity,
    decode_b64_vector,
    encode_vector,
    genus_of,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["game"])

# Characters for join codes — exclude ambiguous 0/O/I/1
_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

_BIOCLIP_WORKER_URL = os.environ.get("BIOCLIP_WORKER_URL", "")
_BIOCLIP_WORKER_TOKEN = os.environ.get("BIOCLIP_WORKER_TOKEN", "")

# Lower than the identify flow's bar on purpose: a guest photographing the right
# plant from a different angle should pass. See services/game_matching.py.
_EMBED_THRESHOLD = float(os.environ.get("GAME_EMBED_THRESHOLD", "0.74"))
# How close to the threshold a photo must land before an exact species name is
# allowed to rescue it. At the default threshold this is a similarity of 0.63 —
# a scan that plausibly shows the target under bad light or from an odd angle
# (the two real scans measured so far sat at 0.71 and 0.88), while a photo of a
# different plant scores far below it.
_NEAR_MISS_RATIO = float(os.environ.get("GAME_NEAR_MISS_RATIO", "0.85"))
# How many wrong plants a player may photograph in one round before it closes
# for them. Without a limit a guest can walk the border scanning everything
# until something sticks, which is not a hunt — it is an inventory. Two leaves
# room for one honest mistake (the lookalike next to it) and no more.
MAX_WRONG_ATTEMPTS = int(os.environ.get("GAME_MAX_WRONG_ATTEMPTS", "2"))
# The host types the loser's forfeit; the app supplies the mechanic, not the
# penalty. Bounded so it stays a caption rather than an essay.
MAX_FORFEIT_LEN = 80
# Extra points for finding it early in the round, on top of the rank bonus.
# Rank already orders people by speed, but only by a hair — 150 vs 140 does not
# feel like a race. This makes the clock worth something: everything left on it
# when you find the plant, scaled to this much.
MAX_SPEED_BONUS = int(os.environ.get("GAME_MAX_SPEED_BONUS", "50"))

# How many stored photos of a plant we keep as visual references per round.
_MAX_REFERENCES = 8

MAX_ROUNDS = 15
MAX_SELECTABLE = 50
MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Race pacing defaults. A physical hunt across a garden is slow — the old
# 60-second scoring window meant everyone flatlined at the base score after one
# minute of walking.
DEFAULT_ROUND_SECONDS = 180
MIN_ROUND_SECONDS = 30
MAX_ROUND_SECONDS = 900

_game_bearer = HTTPBearer(auto_error=False)


def _worker_headers() -> dict:
    return {"X-Worker-Token": _BIOCLIP_WORKER_TOKEN} if _BIOCLIP_WORKER_TOKEN else {}


async def _embed_bytes(image_bytes: bytes) -> bytes | None:
    """POST image bytes to the BioCLIP worker; return raw float32[512] or None."""
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
            return resp.content
    except Exception as exc:
        logger.warning("Game embed failed: %s", exc)
    return None


async def _embed_url(url: str) -> bytes | None:
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


def _make_code() -> str:
    return "".join(random.choices(_CODE_CHARS, k=6))


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_dt(value) -> datetime | None:
    """TIMESTAMP columns come back as datetime on asyncpg, str on aiosqlite."""
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return value


# ── Actor resolution (account host/player, or session-scoped guest) ──────────

class GameActor(dict):
    """{'account_id': int|None, 'player_id': int|None, 'is_guest': bool}."""


async def _resolve_actor(
    db,
    credentials: HTTPAuthorizationCredentials | None,
) -> GameActor:
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    token = credentials.credentials

    # Guest token first — it's the narrower, self-describing case.
    try:
        guest = decode_guest_token(token)
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

    if guest is not None:
        rows = await db.execute_fetchall(
            "SELECT id, session_id, guest_secret FROM game_players WHERE id = ?",
            (guest["player_id"],),
        )
        if not rows:
            raise HTTPException(401, "This guest is no longer in the game")
        player = dict(rows[0])
        # Constant-time compare: the secret is the only thing standing between a
        # guessed token and someone else's player row.
        if not secrets.compare_digest(
            str(player.get("guest_secret") or ""), guest["game_secret"]
        ):
            raise HTTPException(401, "This guest is no longer in the game")
        if player["session_id"] != guest["session_id"]:
            raise HTTPException(401, "Guest token does not match this game")
        return GameActor(
            account_id=None, player_id=player["id"], is_guest=True,
            session_id=player["session_id"],
        )

    account = await get_current_account_from_token(token, db)
    return GameActor(
        account_id=account["account_id"], player_id=None, is_guest=False,
        household_id=account["household_id"], session_id=None,
        role=account["role"], capabilities=account["capabilities"],
    )


async def game_actor(
    db=Depends(db_dep),
    credentials: HTTPAuthorizationCredentials | None = Depends(_game_bearer),
) -> GameActor:
    """Dependency accepting either an account token or a game guest token."""
    return await _resolve_actor(db, credentials)


async def game_mutation_actor(actor: GameActor = Depends(game_actor)) -> GameActor:
    """Allow game guests, but reject viewer accounts before game work begins."""
    if not actor["is_guest"] and not actor["capabilities"]["can_edit"]:
        raise HTTPException(403, "Forbidden")
    return actor


async def _player_row(db, session_id: int, actor: GameActor) -> dict | None:
    """The actor's game_players row in this session, if they're in it."""
    if actor["is_guest"]:
        # A guest token is bound to one session — it can't reach another game.
        if actor["session_id"] != session_id:
            return None
        rows = await db.execute_fetchall(
            "SELECT * FROM game_players WHERE id = ? AND session_id = ?",
            (actor["player_id"], session_id),
        )
    else:
        rows = await db.execute_fetchall(
            "SELECT * FROM game_players WHERE session_id = ? AND account_id = ?",
            (session_id, actor["account_id"]),
        )
    return dict(rows[0]) if rows else None


# ── Pydantic models ──────────────────────────────────────────────────────────

class GameCreateRequest(BaseModel):
    # map_id stays for older clients; map_ids is the multi-map path.
    map_id: int | None = None
    map_ids: list[int] = []
    plant_ids: list[int]
    clue_mode: str = "photo"           # "photo" | "name" | "logbook"
    pacing: str = "host"               # "host" | "race"
    round_seconds: int | None = None   # race mode only
    round_count: int | None = None
    forfeit: str | None = None         # what the loser has to do; host's words


class GuestJoinRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class AnswerRequest(BaseModel):
    scanned_species: str
    confidence: float = 0.0
    candidates: list[str] = []
    image_data_url: str | None = None


# ── Reference photo gathering ────────────────────────────────────────────────

async def _gather_references(db, plant: dict) -> list[str]:
    """Every stored embedding we have for this exact plant, base64-encoded.

    Ordered strongest first: owner-confirmed anchors, then logbook photos, then
    (only if we still have nothing) a live embed of the profile photo. The live
    embed is the one that needs the BioCLIP worker to be awake, so a game
    created while the worker is off still gets references from the DB.
    """
    encoded: list[str] = []

    anchor_rows = await db.execute_fetchall(
        "SELECT embedding FROM user_confirmed_embeddings WHERE source_plant_id = ?",
        (plant["id"],),
    )
    photo_rows = await db.execute_fetchall(
        "SELECT embedding FROM plant_photos WHERE plant_id = ? AND embedding IS NOT NULL "
        "ORDER BY taken_at DESC",
        (plant["id"],),
    )

    for row in [*anchor_rows, *photo_rows]:
        raw = dict(row).get("embedding")
        if isinstance(raw, memoryview):
            raw = bytes(raw)
        if as_vector(raw) is not None:
            encoded.append(encode_vector(raw))
        if len(encoded) >= _MAX_REFERENCES:
            break

    if not encoded:
        live = await _embed_url(plant.get("photo_path") or "")
        if live:
            encoded.append(encode_vector(live))

    return encoded


async def _stored_references(db, plant: dict) -> list[str]:
    """The DB half of `_gather_references` — no worker call, no HTTP.

    Split out because the two halves have opposite constraints. The queries
    must stay sequential: a request holds ONE asyncpg connection, and asyncpg
    raises "another operation is in progress" if two queries share it. The live
    embed is HTTP and is the slow part, so it wants to run concurrently. Mixing
    them in one coroutine makes the fast half hostage to the slow one.
    """
    encoded: list[str] = []
    anchor_rows = await db.execute_fetchall(
        "SELECT embedding FROM user_confirmed_embeddings WHERE source_plant_id = ?",
        (plant["id"],),
    )
    photo_rows = await db.execute_fetchall(
        "SELECT embedding FROM plant_photos WHERE plant_id = ? AND embedding IS NOT NULL "
        "ORDER BY taken_at DESC",
        (plant["id"],),
    )
    for row in [*anchor_rows, *photo_rows]:
        raw = dict(row).get("embedding")
        if isinstance(raw, memoryview):
            raw = bytes(raw)
        if as_vector(raw) is not None:
            encoded.append(encode_vector(raw))
        if len(encoded) >= _MAX_REFERENCES:
            break
    return encoded


async def _references_for_all(db, plants: list[dict]) -> dict[int, list[str]]:
    """References for every plant in one pass: DB first, then the live embeds
    for whatever came back empty — all of those at once.

    A fifteen-round hunt whose plants have never been photographed used to make
    fifteen worker round-trips one after another while the host stared at a
    spinner. They are independent requests; nothing was gaining from the queue.
    """
    refs = {p["id"]: await _stored_references(db, p) for p in plants}

    missing = [p for p in plants if not refs[p["id"]]]
    if missing:
        live = await asyncio.gather(
            *(_embed_url(p.get("photo_path") or "") for p in missing),
            return_exceptions=True,
        )
        for plant, vector in zip(missing, live):
            if isinstance(vector, BaseException) or not vector:
                continue
            refs[plant["id"]] = [encode_vector(vector)]
    return refs


# ── Session state ────────────────────────────────────────────────────────────

async def _session_by_code(db, code: str) -> dict:
    rows = await db.execute_fetchall(
        """SELECT gs.*, m.name AS map_name, m.slug AS map_slug, a.name AS host_name
           FROM game_sessions gs
           JOIN maps m ON m.id = gs.map_id
           JOIN accounts a ON a.id = gs.host_account_id
           WHERE gs.join_code = ?""",
        (code,),
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    return dict(rows[0])


async def _maybe_auto_advance(db, session: dict) -> dict:
    """Close an expired race round and open the next one.

    Advancement is lazy — driven by whoever polls next — rather than a
    background task, so it survives the API restarting mid-party and needs no
    scheduler. Every client polls every few seconds, so in practice the round
    turns over within a poll interval of its deadline.
    """
    if session["status"] != "active" or session.get("pacing") != "race":
        return session

    round_rows = await db.execute_fetchall(
        "SELECT id, ends_at FROM game_rounds WHERE session_id = ? AND round_index = ?",
        (session["id"], session["current_round"]),
    )
    if not round_rows:
        return session
    current = dict(round_rows[0])

    ends_at = _as_dt(current.get("ends_at"))
    expired = ends_at is not None and _now() >= ends_at

    # Everyone found it — no reason to make the whole party watch a timer run
    # out. Latecomers joining mid-round push this back out, which is correct:
    # they haven't had their turn yet.
    if not expired:
        counts = await db.execute_fetchall(
            """SELECT
                 (SELECT COUNT(*) FROM game_players WHERE session_id = ?) AS players,
                 (SELECT COUNT(*) FROM game_answers
                   WHERE round_id = ? AND is_correct = TRUE) AS found""",
            (session["id"], current["id"]),
        )
        row = dict(counts[0])
        if row["players"] > 0 and row["found"] >= row["players"]:
            expired = True

    if not expired:
        return session

    return await _advance(db, session)


async def _advance(db, session: dict) -> dict:
    """Move to the next round, or finish the game. Returns the updated session."""
    total_rows = await db.execute_fetchall(
        "SELECT COUNT(*) AS cnt FROM game_rounds WHERE session_id = ?", (session["id"],)
    )
    total = dict(total_rows[0])["cnt"]
    next_idx = session["current_round"] + 1
    now = _now()

    if next_idx >= total:
        await db.execute(
            "UPDATE game_sessions SET status = 'finished', finished_at = ? WHERE id = ?",
            (now, session["id"]),
        )
        session["status"] = "finished"
    else:
        ends_at = None
        if session.get("pacing") == "race":
            ends_at = now + timedelta(
                seconds=session.get("round_seconds") or DEFAULT_ROUND_SECONDS
            )
        await db.execute(
            "UPDATE game_sessions SET current_round = ? WHERE id = ?",
            (next_idx, session["id"]),
        )
        await db.execute(
            "UPDATE game_rounds SET started_at = ?, ends_at = ? "
            "WHERE session_id = ? AND round_index = ?",
            (now, ends_at, session["id"], next_idx),
        )
        session["current_round"] = next_idx
    await db.commit()
    return session


async def _build_state(db, code: str, actor: GameActor) -> dict:
    session = await _session_by_code(db, code)
    session = await _maybe_auto_advance(db, session)

    maps_rows = await db.execute_fetchall(
        """SELECT m.id, m.name, m.slug, m.map_type
           FROM game_session_maps gsm JOIN maps m ON m.id = gsm.map_id
           WHERE gsm.session_id = ? ORDER BY m.name""",
        (session["id"],),
    )
    session_maps = [dict(r) for r in maps_rows]

    players_rows = await db.execute_fetchall(
        """SELECT gp.id, gp.account_id, gp.score, gp.is_guest,
                  COALESCE(gp.display_name, a.name) AS player_name
           FROM game_players gp
           LEFT JOIN accounts a ON a.id = gp.account_id
           WHERE gp.session_id = ?
           ORDER BY gp.score DESC, gp.joined_at""",
        (session["id"],),
    )
    players = [dict(r) for r in players_rows]

    rounds_rows = await db.execute_fetchall(
        """SELECT gr.id, gr.round_index, gr.plant_name_nl, gr.plant_name_en,
                  gr.target_species, gr.clue_photo_url, gr.clue_hint_nl,
                  gr.clue_hint_en, gr.ends_at, gr.map_id,
                  m.name AS map_name, m.map_type
           FROM game_rounds gr
           LEFT JOIN maps m ON m.id = gr.map_id
           WHERE gr.session_id = ? ORDER BY gr.round_index""",
        (session["id"],),
    )
    rounds = [dict(r) for r in rounds_rows]

    # The Latin name is part of the clue when the clue IS a name — a guest who
    # knows "Monstera deliciosa" but neither common name can still play. In
    # photo and logbook modes the species name is the ANSWER, so shipping it
    # would hand every player the round for free.
    if session.get("clue_mode") != "name":
        for r in rounds:
            r.pop("target_species", None)

    current_round_id = None
    if rounds and session["status"] == "active":
        current = next(
            (r for r in rounds if r["round_index"] == session["current_round"]), None
        )
        if current:
            current_round_id = current["id"]

    answered_ids: set[int] = set()
    if current_round_id:
        ans_rows = await db.execute_fetchall(
            "SELECT player_id FROM game_answers WHERE round_id = ? AND is_correct = TRUE",
            (current_round_id,),
        )
        answered_ids = {r["player_id"] for r in ans_rows}

    for p in players:
        p["answered_current_round"] = p["id"] in answered_ids

    me = await _player_row(db, session["id"], actor)
    my_player_id = me["id"] if me else None

    my_answer = None
    if my_player_id and current_round_id:
        my_rows = await db.execute_fetchall(
            "SELECT is_correct, points_awarded, answered_at, finish_rank, "
            "wrong_attempts FROM game_answers WHERE round_id = ? AND player_id = ?",
            (current_round_id, my_player_id),
        )
        if my_rows:
            my_answer = dict(my_rows[0])
            # Carried in the state, not just in the scan response: otherwise
            # reloading the page — or reopening the PWA — hands a locked-out
            # player their attempts back.
            used = int(my_answer.get("wrong_attempts") or 0)
            my_answer["attempts_left"] = max(0, MAX_WRONG_ATTEMPTS - used)
            my_answer["locked"] = (
                not my_answer["is_correct"] and used >= MAX_WRONG_ATTEMPTS
            )

    current_clue = None
    if rounds and session["status"] in ("active", "finished"):
        current_clue = next(
            (r for r in rounds if r["round_index"] == session["current_round"]), None
        )

    # Seconds left in a race round, computed server-side so a guest's phone
    # clock being wrong can't hand them extra time.
    seconds_remaining = None
    if current_clue and session["status"] == "active":
        ends_at = _as_dt(current_clue.get("ends_at"))
        if ends_at:
            seconds_remaining = max(0, int((ends_at - _now()).total_seconds()))

    is_host = (
        not actor["is_guest"] and actor["account_id"] == session["host_account_id"]
    )

    round_stats = None
    if session["status"] == "finished" and rounds:
        ans_rows = await db.execute_fetchall(
            """SELECT ga.answered_at, ga.match_kind, gr.started_at, gr.round_index
               FROM game_answers ga
               JOIN game_rounds gr ON gr.id = ga.round_id
               WHERE gr.session_id = ? AND ga.is_correct = TRUE""",
            (session["id"],),
        )
        counts: dict[int, int] = {}
        times: dict[int, list[float]] = {}
        kinds: dict[int, dict[str, int]] = {}
        for row in ans_rows:
            a = dict(row)
            ridx = a["round_index"]
            counts[ridx] = counts.get(ridx, 0) + 1
            started, answered = _as_dt(a.get("started_at")), _as_dt(a.get("answered_at"))
            if started and answered:
                times.setdefault(ridx, []).append((answered - started).total_seconds())
            # Answers predating the match_kind column have no route recorded;
            # they are counted as 'unknown' rather than guessed at.
            kind = a.get("match_kind") or "unknown"
            kinds.setdefault(ridx, {})[kind] = kinds.setdefault(ridx, {}).get(kind, 0) + 1
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
                # How each correct answer was accepted. Host-only: it is a
                # diagnostic about the grader, not part of anyone's score, and
                # telling a player their find was carried by a name match would
                # only take the win away from them.
                "match_kinds": kinds.get(r["round_index"], {}) if is_host else None,
            }
            for r in rounds
        ]

    return {
        "session": {
            "id": session["id"],
            "join_code": session["join_code"],
            "status": session["status"],
            "current_round": session["current_round"],
            "total_rounds": len(rounds),
            "map_name": session["map_name"],
            "map_slug": session["map_slug"],
            "maps": session_maps,
            "host_account_id": session["host_account_id"],
            "host_name": session["host_name"],
            "clue_mode": session.get("clue_mode", "photo"),
            "pacing": session.get("pacing", "host"),
            "round_seconds": session.get("round_seconds"),
            "seconds_remaining": seconds_remaining,
            "forfeit": session.get("forfeit"),
            # Sent so a player's screen can count down "2 tries left" without
            # hard-coding the server's limit in the client.
            "max_wrong_attempts": MAX_WRONG_ATTEMPTS,
        },
        "players": players,
        "current_clue": current_clue,
        "rounds": rounds,
        "my_answer": my_answer,
        "my_player_id": my_player_id,
        "is_host": is_host,
        "round_stats": round_stats,
    }


# ── Readiness ────────────────────────────────────────────────────────────────

# NOTE: this lettered path must stay ABOVE `GET /games/{code}` or FastAPI
# matches the parameter route first and answers "Game not found" — the same
# trap that made `POST /plants/bulk-archive` return 405 (see CLAUDE.md).
@router.get("/games/plant-readiness")
async def plant_readiness(
    map_ids: str = Query("", description="Comma-separated map ids"),
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    """Which plants on these maps can be graded by their own photographs.

    A plant is "ready" when we hold at least one stored embedding for it —
    exactly the two sources `_gather_references` reads first, and deliberately
    NOT its profile photo: that path needs a live embed from the BioCLIP
    worker, so it is unavailable precisely when the worker is asleep, which is
    when a party is most likely to be happening.

    Readiness matters because grading falls back to species-name matching for a
    plant with no references, and name matching cannot tell two plants of a
    species apart — the failure that graded a red climber as a Scindapsus. A
    hunt built only from ready plants is decided by photographs every round.
    """
    if actor["is_guest"]:
        raise HTTPException(403, "Guests cannot inspect the catalog")

    try:
        wanted = [int(v) for v in map_ids.split(",") if v.strip()]
    except ValueError:
        raise HTTPException(400, "map_ids must be comma-separated integers")
    if not wanted:
        return {"ready_plant_ids": [], "total": 0}

    placeholders = ",".join("?" for _ in wanted)
    rows = await db.execute_fetchall(
        f"""SELECT DISTINCT p.id
              FROM plants p
              JOIN maps m ON m.id = p.map_id
             WHERE p.map_id IN ({placeholders})
               AND m.household_id = ?
               AND p.is_active = 1
               AND (
                   EXISTS (SELECT 1 FROM user_confirmed_embeddings uce
                            WHERE uce.source_plant_id = p.id)
                OR EXISTS (SELECT 1 FROM plant_photos ph
                            WHERE ph.plant_id = p.id AND ph.embedding IS NOT NULL)
               )""",
        (*wanted, actor["household_id"]),
    )
    ready = [dict(r)["id"] for r in rows]
    return {"ready_plant_ids": ready, "total": len(ready)}


# ── Create ───────────────────────────────────────────────────────────────────

@router.post("/games", status_code=201)
async def create_game(
    body: GameCreateRequest,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    if actor["is_guest"]:
        raise HTTPException(403, "Guests cannot create games")

    requested_maps = list(dict.fromkeys(body.map_ids or ([body.map_id] if body.map_id else [])))
    if not requested_maps:
        raise HTTPException(400, "Select at least one map")
    if len(body.plant_ids) < 3:
        raise HTTPException(400, "Select at least 3 plants")
    if len(body.plant_ids) > MAX_SELECTABLE:
        raise HTTPException(400, f"Select at most {MAX_SELECTABLE} plants")

    # Every map must belong to the host's household. Indoor maps are allowed —
    # a hunt that crosses from the living room into the garden is the point.
    valid_maps: list[dict] = []
    for map_id in requested_maps:
        map_rows = await db.execute_fetchall(
            "SELECT id, name, map_type FROM maps WHERE id = ? AND household_id = ?",
            (map_id, actor["household_id"]),
        )
        if not map_rows:
            raise HTTPException(404, "Map not found")
        valid_maps.append(dict(map_rows[0]))

    clue_mode = body.clue_mode if body.clue_mode in ("photo", "name", "logbook") else "photo"
    pacing = body.pacing if body.pacing in ("host", "race") else "host"
    round_seconds = None
    if pacing == "race":
        round_seconds = body.round_seconds or DEFAULT_ROUND_SECONDS
        round_seconds = max(MIN_ROUND_SECONDS, min(MAX_ROUND_SECONDS, round_seconds))

    map_ids = [m["id"] for m in valid_maps]
    placeholders = ",".join("?" for _ in map_ids)
    plant_placeholders = ",".join("?" for _ in body.plant_ids)
    plant_rows = await db.execute_fetchall(
        f"""SELECT p.id, p.name, p.photo_path, p.map_id,
                   s.common_name_nl, s.common_name_en, s.latin_name
            FROM plants p
            LEFT JOIN plant_species s ON s.id = p.species_id
            WHERE p.id IN ({plant_placeholders})
              AND p.map_id IN ({placeholders})
              AND p.is_active = 1""",
        (*body.plant_ids, *map_ids),
    )
    valid_plants = [dict(r) for r in plant_rows]

    if len(valid_plants) < 3:
        raise HTTPException(400, "Select at least 3 plants")

    k = min(body.round_count or len(valid_plants), MAX_ROUNDS, len(valid_plants))
    k = max(k, 3)
    # Variety. `random.sample` has no memory, so with a small pool of
    # photo-ready plants the same handful kept coming back: at eight eligible
    # plants and three rounds, the chance of a repeat next game is 82%. That is
    # the dice being fair, and it still feels broken.
    recent_rows = await db.execute_fetchall(
        """SELECT gr.plant_id
             FROM game_rounds gr
             JOIN game_sessions gs ON gs.id = gr.session_id
            WHERE gs.host_account_id = ?
            ORDER BY gs.created_at DESC, gr.round_index
            LIMIT ?""",
        (actor["account_id"], k * 2),
    )
    recent = {dict(r)["plant_id"] for r in recent_rows}
    fresh = [p for p in valid_plants if p["id"] not in recent]
    # Fall back the moment the pool is too small to fill a game. A repeat is a
    # mild disappointment; refusing to start is the end of the party.
    chosen = random.sample(fresh if len(fresh) >= k else valid_plants, k)

    for _ in range(10):
        code = _make_code()
        existing = await db.execute_fetchall(
            "SELECT id FROM game_sessions WHERE join_code = ?", (code,)
        )
        if not existing:
            break
    else:
        raise HTTPException(500, "Could not generate unique join code")

    # Blank and whitespace-only both mean "no forfeit"; storing '' would make
    # the UI render an empty penalty line.
    forfeit = (body.forfeit or "").strip()[:MAX_FORFEIT_LEN] or None

    await db.execute(
        """INSERT INTO game_sessions
           (join_code, host_account_id, map_id, status, current_round, created_at,
            clue_mode, pacing, round_seconds, forfeit)
           VALUES (?, ?, ?, 'waiting', 0, ?, ?, ?, ?, ?)""",
        (code, actor["account_id"], map_ids[0], _now(), clue_mode, pacing,
         round_seconds, forfeit),
    )
    session_rows = await db.execute_fetchall(
        "SELECT id FROM game_sessions WHERE join_code = ?", (code,)
    )
    session_id = dict(session_rows[0])["id"]

    for map_id in map_ids:
        await db.execute(
            "INSERT INTO game_session_maps (session_id, map_id) VALUES (?, ?)",
            (session_id, map_id),
        )

    # The host is a player too, so they can hunt along.
    await db.execute(
        "INSERT INTO game_players (session_id, account_id, score, is_guest) "
        "VALUES (?, ?, 0, FALSE)",
        (session_id, actor["account_id"]),
    )

    # Gathered up front so the live embeds (HTTP, and the slow part) run
    # concurrently instead of once per round in sequence.
    all_references = (
        {} if clue_mode == "logbook" else await _references_for_all(db, chosen)
    )

    for i, p in enumerate(chosen):
        target = p.get("latin_name") or p.get("common_name_nl") or p["name"]
        name_nl = p.get("common_name_nl") or p["name"]
        name_en = p.get("common_name_en") or p["name"]

        clue_photo = p.get("photo_path")
        if clue_mode == "logbook":
            photo_rows = await db.execute_fetchall(
                "SELECT url FROM plant_photos WHERE plant_id = ? ORDER BY RANDOM() LIMIT 1",
                (p["id"],),
            )
            if photo_rows:
                clue_photo = dict(photo_rows[0])["url"] or clue_photo

        # The logbook quiz is answered by tapping, so it needs no visual
        # references — skip the (slow) embedding gather entirely.
        references: list[str] = []
        if clue_mode != "logbook":
            references = all_references.get(p["id"], [])

        await db.execute(
            """INSERT INTO game_rounds
               (session_id, round_index, plant_id, plant_name_nl, plant_name_en,
                target_species, target_genus, clue_photo_url, target_embeddings, map_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, i, p["id"], name_nl, name_en, target, genus_of(target),
             clue_photo, json.dumps(references) if references else None, p["map_id"]),
        )

    await db.commit()
    return {"join_code": code}


# ── Join ─────────────────────────────────────────────────────────────────────

@router.get("/games/{code}/preview")
async def preview_game(code: str, db=Depends(db_dep)):
    """Unauthenticated peek so the join screen can name the game before signup."""
    rows = await db.execute_fetchall(
        """SELECT gs.status, m.name AS map_name, a.name AS host_name
           FROM game_sessions gs
           JOIN maps m ON m.id = gs.map_id
           JOIN accounts a ON a.id = gs.host_account_id
           WHERE gs.join_code = ?""",
        (code.upper(),),
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    players = await db.execute_fetchall(
        """SELECT COUNT(*) AS cnt FROM game_players gp
           JOIN game_sessions gs ON gs.id = gp.session_id WHERE gs.join_code = ?""",
        (code.upper(),),
    )
    return {
        "status": session["status"],
        "map_name": session["map_name"],
        "host_name": session["host_name"],
        "player_count": dict(players[0])["cnt"],
    }


@router.post("/games/{code}/join-guest")
async def join_as_guest(code: str, body: GuestJoinRequest, db=Depends(db_dep)):
    """Name-only join. No account, no email — the party path.

    Latecomers are welcome: joining an already-running game is allowed, you just
    start on the round everyone else is on with the points you've earned so far
    (none). Only a finished game turns people away.
    """
    rows = await db.execute_fetchall(
        "SELECT id, status FROM game_sessions WHERE join_code = ?", (code.upper(),)
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if session["status"] == "finished":
        raise HTTPException(400, "This game has finished")

    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Enter a name")

    secret = secrets.token_urlsafe(24)
    cursor = await db.execute(
        """INSERT INTO game_players
           (session_id, account_id, score, display_name, is_guest, guest_secret)
           VALUES (?, NULL, 0, ?, TRUE, ?)""",
        (session["id"], name, secret),
    )
    player_id = cursor.lastrowid
    await db.commit()

    token = create_guest_token(player_id, session["id"], secret)
    actor = GameActor(
        account_id=None, player_id=player_id, is_guest=True, session_id=session["id"]
    )
    return {
        "guest_token": token,
        "player_id": player_id,
        "state": await _build_state(db, code.upper(), actor),
    }


@router.post("/games/{code}/join")
async def join_game(
    code: str,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    """Join with a Floreren account. Idempotent, and open to latecomers."""
    rows = await db.execute_fetchall(
        "SELECT id, status FROM game_sessions WHERE join_code = ?", (code.upper(),)
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if session["status"] == "finished":
        raise HTTPException(400, "This game has finished")

    if actor["is_guest"]:
        if actor["session_id"] != session["id"]:
            raise HTTPException(403, "This guest belongs to another game")
        return await _build_state(db, code.upper(), actor)

    existing = await db.execute_fetchall(
        "SELECT id FROM game_players WHERE session_id = ? AND account_id = ?",
        (session["id"], actor["account_id"]),
    )
    if not existing:
        await db.execute(
            "INSERT INTO game_players (session_id, account_id, score, is_guest) "
            "VALUES (?, ?, 0, FALSE)",
            (session["id"], actor["account_id"]),
        )
        await db.commit()

    return await _build_state(db, code.upper(), actor)


@router.post("/games/{code}/leave")
async def leave_game(
    code: str,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    """Step out of the hunt without ending it.

    A host who is running the party rather than playing it should not be on the
    scoreboard: they are the one holding the phone with the QR on it, they can
    see the answer behind the peek toggle, and a "winner" who never left the
    terrace is not much of a result. Hosting and playing are separate things,
    and this is what separates them — the host keeps every host power (start,
    skip, award) and simply stops being a competitor.

    Rejoining is the existing `POST /games/{code}/join`, so this is a toggle
    rather than a door that locks behind you.
    """
    session = await _session_by_code(db, code.upper())
    me = await _player_row(db, session["id"], actor)
    if not me:
        return await _build_state(db, code.upper(), actor)

    others = await db.execute_fetchall(
        "SELECT COUNT(*) AS cnt FROM game_players WHERE session_id = ? AND id != ?",
        (session["id"], me["id"]),
    )
    if int(dict(others[0])["cnt"]) == 0:
        # A hunt with nobody in it has no rounds to grade and no scoreboard to
        # show. Leaving is for stepping back from a party, not for emptying it.
        raise HTTPException(400, "Someone has to play")

    # The answers go with the player: leaving them behind would keep this
    # person in every round's found-count while they are no longer on the
    # scoreboard, which reads as a bug to everyone still playing.
    await db.execute(
        "DELETE FROM game_answers WHERE player_id = ?", (me["id"],))
    await db.execute("DELETE FROM game_players WHERE id = ?", (me["id"],))
    await db.commit()
    return await _build_state(db, code.upper(), actor)


@router.get("/games/{code}")
async def get_game_state(
    code: str,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_actor),
):
    return await _build_state(db, code.upper(), actor)


# ── Host controls ────────────────────────────────────────────────────────────

async def _require_host(db, code: str, actor: GameActor) -> dict:
    rows = await db.execute_fetchall(
        "SELECT * FROM game_sessions WHERE join_code = ?", (code.upper(),)
    )
    if not rows:
        raise HTTPException(404, "Game not found")
    session = dict(rows[0])
    if actor["is_guest"] or session["host_account_id"] != actor["account_id"]:
        raise HTTPException(403, "Only the host can do that")
    return session


@router.post("/games/{code}/start")
async def start_game(
    code: str,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    session = await _require_host(db, code, actor)
    if session["status"] != "waiting":
        raise HTTPException(400, "Game is not in waiting state")

    now = _now()
    ends_at = None
    if session.get("pacing") == "race":
        ends_at = now + timedelta(
            seconds=session.get("round_seconds") or DEFAULT_ROUND_SECONDS
        )

    await db.execute(
        "UPDATE game_sessions SET status = 'active', started_at = ?, current_round = 0 WHERE id = ?",
        (now, session["id"]),
    )
    await db.execute(
        "UPDATE game_rounds SET started_at = ?, ends_at = ? "
        "WHERE session_id = ? AND round_index = 0",
        (now, ends_at, session["id"]),
    )
    await db.commit()
    return await _build_state(db, code.upper(), actor)


@router.post("/games/{code}/next")
async def next_round(
    code: str,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    session = await _require_host(db, code, actor)
    if session["status"] != "active":
        raise HTTPException(400, "Game is not active")
    await _advance(db, session)
    return await _build_state(db, code.upper(), actor)


@router.post("/games/{code}/players/{player_id}/award")
async def award_player(
    code: str,
    player_id: int,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    """Host override — mark a stuck guest correct for the current round.

    The identifier will occasionally refuse to place a plant no matter how good
    the photo is. Rather than have a guest stand there arguing with a phone, the
    host can wave them through.
    """
    session = await _require_host(db, code, actor)
    if session["status"] != "active":
        raise HTTPException(400, "Game is not active")

    round_rows = await db.execute_fetchall(
        "SELECT id FROM game_rounds WHERE session_id = ? AND round_index = ?",
        (session["id"], session["current_round"]),
    )
    if not round_rows:
        raise HTTPException(404, "Round not found")
    round_id = dict(round_rows[0])["id"]

    player_rows = await db.execute_fetchall(
        "SELECT id FROM game_players WHERE id = ? AND session_id = ?",
        (player_id, session["id"]),
    )
    if not player_rows:
        raise HTTPException(404, "Player not found")

    result = await _record_answer(
        db, session, round_id, player_id, "host-override", is_correct=True,
        host_override=True,
    )
    await db.commit()
    return result


@router.delete("/games/{code}", status_code=204)
async def delete_game(
    code: str,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    session = await _require_host(db, code, actor)
    await db.execute("DELETE FROM game_sessions WHERE id = ?", (session["id"],))
    await db.commit()


# ── Answering ────────────────────────────────────────────────────────────────

async def _locked_out(db, round_id: int, player_id: int) -> bool:
    """Has this player used up their scans on this plant?

    Checked BEFORE any identification work, not just inside `_record_answer`.
    A refused scan is cheap to answer and expensive to compute: the identify
    path runs a GPU inference on the BioCLIP worker (serialized behind one
    lock, so it queues behind every other guest's legitimate scan), may fall
    back to PlantNet's rate-limited API, and then embeds the image a second
    time. At a party, a handful of locked-out guests retrying would slow the
    hunt down for everyone still playing.
    """
    rows = await db.execute_fetchall(
        "SELECT is_correct, wrong_attempts FROM game_answers "
        "WHERE round_id = ? AND player_id = ?",
        (round_id, player_id),
    )
    if not rows:
        return False
    row = dict(rows[0])
    return (not row["is_correct"]) and int(row["wrong_attempts"] or 0) >= MAX_WRONG_ATTEMPTS


async def _record_answer(
    db, session: dict, round_id: int, player_id: int,
    scanned: str, is_correct: bool, match_kind: str | None = None,
    *, host_override: bool = False,
) -> dict:
    """Write the answer, award points, and return the player-facing result.

    Wrong guesses are counted, and past MAX_WRONG_ATTEMPTS the round closes for
    that player: a hunt where you can photograph every plant in the garden
    until one sticks is an inventory, not a hunt.

    The host override deliberately ignores the lock. It is the escape hatch for
    a guest whose phone will not focus or whose plant has no usable reference
    photos, and a locked-out player is exactly who most needs waving through.
    """
    existing_rows = await db.execute_fetchall(
        "SELECT id, is_correct, wrong_attempts FROM game_answers "
        "WHERE round_id = ? AND player_id = ?",
        (round_id, player_id),
    )
    existing = dict(existing_rows[0]) if existing_rows else None
    if existing and existing["is_correct"]:
        raise HTTPException(400, "Already answered correctly")

    wrong_attempts = int(existing["wrong_attempts"] or 0) if existing else 0
    if not host_override and wrong_attempts >= MAX_WRONG_ATTEMPTS:
        # Not an error: the player did nothing wrong by asking, and the client
        # needs a normal result it can render as the locked-out screen.
        return {
            "is_correct": False, "points_awarded": 0, "finish_rank": None,
            "match_kind": None, "wrong_attempts": wrong_attempts,
            "attempts_left": 0, "locked": True, "speed_bonus": 0,
        }
    if not is_correct:
        wrong_attempts += 1

    now = _now()
    points = 0
    finish_rank = None
    speed_bonus = 0
    if is_correct:
        # Two parts, because they answer different questions. Rank rewards
        # beating the others to it and keeps a big group's race meaningful even
        # when the far end of the garden is a two-minute walk away. The speed
        # bonus rewards the clock: rank alone separates first from second by ten
        # points out of a hundred and fifty, which nobody can feel.
        rank_rows = await db.execute_fetchall(
            "SELECT COUNT(*) AS cnt FROM game_answers WHERE round_id = ? AND is_correct = TRUE",
            (round_id,),
        )
        finish_rank = dict(rank_rows[0])["cnt"] + 1
        points = 100 + max(0, 50 - (finish_rank - 1) * 10)

        # Race pacing only: a host-paced round has no clock to be quick against,
        # and timing someone against a round the host ends by hand would score
        # the host's attention span rather than the player's speed.
        if session.get("pacing") == "race":
            round_rows = await db.execute_fetchall(
                "SELECT started_at FROM game_rounds WHERE id = ?", (round_id,))
            started = _as_dt(dict(round_rows[0])["started_at"]) if round_rows else None
            limit = session.get("round_seconds") or DEFAULT_ROUND_SECONDS
            if started and limit > 0:
                elapsed = (now - started).total_seconds()
                # Whatever is left on the clock, as a fraction of the round.
                remaining = max(0.0, min(1.0, 1.0 - elapsed / limit))
                speed_bonus = int(round(MAX_SPEED_BONUS * remaining))
                points += speed_bonus

    if existing:
        await db.execute(
            "UPDATE game_answers SET scanned_species = ?, is_correct = ?, "
            "points_awarded = ?, answered_at = ?, finish_rank = ?, match_kind = ?, "
            "wrong_attempts = ? WHERE round_id = ? AND player_id = ?",
            (scanned, is_correct, points, now, finish_rank, match_kind,
             wrong_attempts, round_id, player_id),
        )
    else:
        await db.execute(
            "INSERT INTO game_answers (round_id, player_id, scanned_species, "
            "is_correct, points_awarded, answered_at, finish_rank, match_kind, "
            "wrong_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (round_id, player_id, scanned, is_correct, points, now, finish_rank,
             match_kind, wrong_attempts),
        )

    if is_correct:
        await db.execute(
            "UPDATE game_players SET score = score + ? WHERE id = ?", (points, player_id)
        )

    attempts_left = max(0, MAX_WRONG_ATTEMPTS - wrong_attempts)
    return {
        "is_correct": is_correct,
        "points_awarded": points,
        "finish_rank": finish_rank,
        "match_kind": match_kind,
        "wrong_attempts": wrong_attempts,
        "attempts_left": attempts_left,
        # A correct answer is never a lockout, however many wrong ones came
        # before it.
        "locked": (not is_correct) and attempts_left == 0,
        # Broken out so the result screen can show what the clock was worth,
        # rather than a single number nobody can account for.
        "speed_bonus": speed_bonus,
    }


async def _grade(
    db, rnd: dict, candidates: list[str], scan_embedding: bytes | None
) -> tuple[bool, str | None]:
    """Grade a scan. Returns (correct, match_kind).

    Photo first when we have references, name only as the fallback. The two
    signals answer different questions, and only one of them answers this game's:

      - name matching asks "what species is this?"
      - the photo comparison asks "is this the plant we sent you to find?"

    A hunt asks the second. Species identification cannot tell two plants of the
    same species apart, and it confidently confuses lookalikes: a red-leaved
    climber was graded correct for a Scindapsus round because BioCLIP called it
    a Scindapsus, with high confidence, and the name path returned before the
    photo comparison ever ran. Photo similarity against THAT plant's own photos
    would have rejected it.

    So the name path is now the fallback for a plant with no reference photos —
    a new plant, or one whose photos never got embedded — where a species guess
    is the only signal available and being generous beats being useless.
    """
    references = []
    raw_refs = rnd.get("target_embeddings")
    if raw_refs:
        try:
            references = [
                v for v in (decode_b64_vector(e) for e in json.loads(raw_refs))
                if v is not None
            ]
        except (ValueError, TypeError):
            references = []

    def name_kind() -> str | None:
        common_names = [rnd.get("plant_name_nl"), rnd.get("plant_name_en")]
        return best_name_match(
            [c for c in candidates if c],
            rnd["target_species"],
            rnd.get("target_genus") or "",
            [c for c in common_names if c],
        )

    # No references, or no embedding to compare: the species guess is all there is.
    if not references or scan_embedding is None:
        kind = name_kind()
        logger.info(
            "Game graded by name (refs=%d, embedding=%s): kind=%s",
            len(references), scan_embedding is not None, kind,
        )
        return (True, kind) if kind else (False, None)

    similarity = best_similarity(as_vector(scan_embedding), references)
    logger.info(
        "Game photo similarity=%.4f threshold=%.2f refs=%d",
        similarity, _EMBED_THRESHOLD, len(references),
    )
    if similarity >= _EMBED_THRESHOLD:
        return True, "photo"

    # Below the line, an exact species match can still rescue the round — but
    # only a near miss. Without the floor this rescue reinstates the exact bug
    # it sits below: the red climber scored 0.0 against the Scindapsus photos
    # and BioCLIP still called it "Scindapsus pictus", so an unfloored rescue
    # grades it correct again. A photo that resembles nothing about the target
    # is not a near miss, however confident the identifier is about the name.
    if similarity >= _EMBED_THRESHOLD * _NEAR_MISS_RATIO and name_kind() == "exact":
        logger.info(
            "Game rescued below threshold by an exact species name match "
            "(similarity=%.4f)", similarity,
        )
        return True, "exact_below_threshold"

    return False, None


async def _current_round(db, session: dict) -> dict:
    round_rows = await db.execute_fetchall(
        """SELECT id, target_species, target_genus, plant_name_nl, plant_name_en,
                  started_at, target_embeddings
           FROM game_rounds WHERE session_id = ? AND round_index = ?""",
        (session["id"], session["current_round"]),
    )
    if not round_rows:
        raise HTTPException(404, "Round not found")
    return dict(round_rows[0])


@router.post("/games/{code}/answer")
async def submit_answer(
    code: str,
    body: AnswerRequest,
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    """Grade a client-side identification (logbook quiz, or an account player)."""
    session = await _session_by_code(db, code.upper())
    session = await _maybe_auto_advance(db, session)
    if session["status"] != "active":
        raise HTTPException(400, "Game is not active")

    me = await _player_row(db, session["id"], actor)
    if not me:
        raise HTTPException(403, "You have not joined this game")

    rnd = await _current_round(db, session)

    scan_embedding = None
    if body.image_data_url:
        try:
            raw = body.image_data_url
            if "," in raw and raw.lstrip().startswith("data:"):
                raw = raw.split(",", 1)[1]
            scan_embedding = await _embed_bytes(base64.b64decode(raw))
        except Exception as exc:
            logger.warning("Game scan embed failed: %s", exc)

    is_correct, kind = await _grade(
        db, rnd, [body.scanned_species, *body.candidates], scan_embedding
    )
    result = await _record_answer(
        db, session, rnd["id"], me["id"], body.scanned_species, is_correct, kind
    )
    await db.commit()
    return result


@router.post("/games/{code}/scan")
async def scan_answer(
    code: str,
    image: UploadFile = File(...),
    lang: str = Query("nl"),
    db=Depends(db_dep),
    actor: GameActor = Depends(game_mutation_actor),
):
    """Identify a photo and grade it in one call — the only identify path guests reach.

    Deliberately *not* a thin wrapper over `/plants/identify`: that endpoint is
    account-scoped (quota, telemetry, catalog writes) and handing guests a token
    for it would let a party guest reach the rest of the app. Here the image
    goes in, a verdict comes out, and nothing else is exposed.
    """
    session = await _session_by_code(db, code.upper())
    session = await _maybe_auto_advance(db, session)
    if session["status"] != "active":
        raise HTTPException(400, "Game is not active")

    me = await _player_row(db, session["id"], actor)
    if not me:
        raise HTTPException(403, "You have not joined this game")

    image_bytes = await image.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "Image too large (max 5 MB)")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Unknown image format")

    rnd = await _current_round(db, session)

    # Refuse before identifying anything — see `_locked_out`. The client
    # already hides the camera from a locked player, but a stale tab or a
    # reopened PWA can still reach this, and the cost lands on the shared GPU.
    if await _locked_out(db, rnd["id"], me["id"]):
        return {
            "is_correct": False, "points_awarded": 0, "finish_rank": None,
            "match_kind": None, "wrong_attempts": MAX_WRONG_ATTEMPTS,
            "attempts_left": 0, "locked": True, "speed_bonus": 0, "candidates": [],
        }

    # Two independent signals, gathered in whatever order succeeds: the
    # identifier's species guess, and the raw photo embedding. Either can carry
    # the round on its own, so a BioCLIP worker outage still leaves name
    # matching working and vice versa.
    candidates: list[str] = []
    # Bound before the try: the except below swallows the failure, and reading
    # an unbound local afterwards would turn a worker hiccup into a 500.
    result = None
    try:
        from routers.plant_id import _bioclip_identify
        result = await _bioclip_identify([image_bytes], db, lang)
        if result is not None:
            candidates = [c.scientific_name for c in result.candidates[:3]]
    except Exception as exc:
        logger.warning("Game scan identify failed: %s", exc)

    if not candidates:
        try:
            from services.plant_id import identify as plantnet_identify
            plantnet = await plantnet_identify(image_bytes, lang=lang)
            candidates = [c.scientific_name for c in plantnet[:3]]
        except Exception as exc:
            logger.warning("Game scan PlantNet fallback failed: %s", exc)

    # The worker already computed an embedding for this exact photo during
    # /identify and sends it back; re-posting the image to /embed-image made it
    # do the same GPU work twice. Both calls queue behind one lock on the
    # worker, so at a party that doubled everyone's wait. Fall back to the
    # second call only when identify produced nothing (PlantNet path, or a
    # worker too old to send the embedding).
    scan_embedding = getattr(result, "query_embedding_bytes", None) if result else None
    if scan_embedding is None:
        scan_embedding = await _embed_bytes(image_bytes)

    is_correct, kind = await _grade(db, rnd, candidates, scan_embedding)
    result = await _record_answer(
        db, session, rnd["id"], me["id"],
        candidates[0] if candidates else "", is_correct, kind,
    )
    await db.commit()
    result["candidates"] = candidates
    return result

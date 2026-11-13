"""Jaarquiz: a ranking quiz for a group of friends, served at floreren.app/jaarquiz.

Not part of the plant app. It lives here because floreren.app already has a
host, a database and an admin login, and the quiz needs exactly those three.

Each participant drags a fixed list of people into an order (1 = most) for every
question. Answers stay private: a participant reads and edits only their own,
and sees nothing of anyone else's until an admin reveals the results, which are
then served as aggregates (average place per person), never per participant.

    GET    /api/jaarquiz/admin                         admin: config, progress, live results
    PUT    /api/jaarquiz/admin                         admin: save config / join code / reveal
    DELETE /api/jaarquiz/admin/responses/{voter}       admin: free a claimed name
    GET    /api/jaarquiz/{code}                        quiz for participants (names, questions)
    POST   /api/jaarquiz/{code}/join                   claim a name -> participant token
    GET    /api/jaarquiz/{code}/me                     own answers        (X-Quiz-Token)
    PUT    /api/jaarquiz/{code}/me                     save own answers   (X-Quiz-Token)
    GET    /api/jaarquiz/{code}/results                aggregates, once revealed

Who is who. The join code in the invite link admits someone to the quiz; the
name they pick is claimed once (first come) and bound to a random token kept in
their browser. Only its SHA-256 is stored. Nobody can prove they are who they
pick, but nobody can overwrite someone else's answers either, and the admin can
free a name that was claimed by mistake.

The repo is public, so the names, photos and questions are not in it: the admin
loads them as config, which is stored in the database (one quiz, row id 1).

Errors carry machine-readable codes in `detail`; the page translates them.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from hashlib import sha256
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator

from auth import require_admin
from database import db_dep

router = APIRouter(prefix="/jaarquiz", tags=["jaarquiz"])

QUIZ_ID = 1
MAX_CONFIG_BYTES = 600_000  # ten small inline photos fit comfortably
MAX_PEOPLE = 20
MAX_QUESTIONS = 40


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash(raw: str) -> str:
    return sha256(raw.encode("utf-8")).hexdigest()


# ── config shape ──────────────────────────────────────────────────────────────

class Person(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    photo: Optional[str] = Field(default=None, max_length=120_000)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("empty name")
        return v

    @field_validator("photo")
    @classmethod
    def _photo_is_inline_image(cls, v: Optional[str]) -> Optional[str]:
        # Inline only: the page runs on floreren.app, and a remote URL here
        # would let the config point participants' browsers anywhere.
        if v and not v.startswith("data:image/"):
            raise ValueError("photo must be a data:image URI")
        return v or None


class Question(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    text: str = Field(min_length=1, max_length=200)
    sub: Optional[str] = Field(default=None, max_length=200)
    # A question can rank its own list (e.g. "rank these men") instead of the people.
    options: Optional[list[str]] = None

    @field_validator("options")
    @classmethod
    def _options(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return None
        v = [str(o).strip() for o in v]
        if not (2 <= len(v) <= MAX_PEOPLE) or any(not o or len(o) > 40 for o in v):
            raise ValueError("options must be 2-20 non-empty names")
        if len(set(v)) != len(v):
            raise ValueError("options must be unique")
        return v


class Liar(BaseModel):
    """Optional joke: the first time a participant drags `name` to last place,
    the page refuses once and shows `message`."""
    name: str = Field(min_length=1, max_length=40)
    message: str = Field(min_length=1, max_length=120)


class QuizConfig(BaseModel):
    title: str = Field(default="Jaarquiz", min_length=1, max_length=80)
    people: list[Person]
    questions: list[Question]
    liar: Optional[Liar] = None

    @model_validator(mode="after")
    def _consistent(self) -> "QuizConfig":
        names = [p.name for p in self.people]
        if not (2 <= len(names) <= MAX_PEOPLE):
            raise ValueError("2-20 people")
        if len(set(names)) != len(names):
            raise ValueError("people must be unique")
        if not (1 <= len(self.questions) <= MAX_QUESTIONS):
            raise ValueError("1-40 questions")
        ids = [q.id for q in self.questions]
        if len(set(ids)) != len(ids):
            raise ValueError("question ids must be unique")
        return self

    def names(self) -> list[str]:
        return [p.name for p in self.people]

    def options_for(self, q: Question) -> list[str]:
        return q.options or self.names()


class AdminUpdate(BaseModel):
    config: QuizConfig
    revealed: bool = False
    # Omit to keep the current code (or get a fresh one for a new quiz);
    # send "new" to rotate it, which invalidates the old invite link.
    join_code: Optional[str] = None


class JoinBody(BaseModel):
    voter: str = Field(min_length=1, max_length=40)


class AnswersBody(BaseModel):
    answers: dict[str, list[str]]
    done: bool = False


# ── storage ───────────────────────────────────────────────────────────────────

async def _load_quiz(db) -> Optional[dict]:
    rows = await db.execute_fetchall(
        "SELECT id, join_code, config, revealed FROM jaarquiz WHERE id = ?", (QUIZ_ID,)
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "join_code": row["join_code"],
        "config": QuizConfig.model_validate(json.loads(row["config"])),
        "revealed": bool(row["revealed"]),
    }


async def _quiz_by_code(db, code: str) -> dict:
    quiz = await _load_quiz(db)
    # Constant-time compare; a wrong code looks exactly like no quiz at all.
    if not quiz or not secrets.compare_digest(quiz["join_code"], code):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "quiz_not_found")
    return quiz


async def _responses(db) -> list[dict]:
    rows = await db.execute_fetchall(
        "SELECT voter, answers, done, updated_at FROM jaarquiz_responses "
        "WHERE quiz_id = ? ORDER BY voter",
        (QUIZ_ID,),
    )
    out = []
    for r in rows:
        try:
            answers = json.loads(r["answers"] or "{}")
        except ValueError:
            answers = {}
        out.append({
            "voter": r["voter"],
            "answers": answers if isinstance(answers, dict) else {},
            "done": bool(r["done"]),
            "updated_at": str(r["updated_at"]) if r["updated_at"] is not None else None,
        })
    return out


async def _participant(db, code: str, token: Optional[str]) -> tuple[dict, dict]:
    quiz = await _quiz_by_code(db, code)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token_required")
    rows = await db.execute_fetchall(
        "SELECT voter, answers, done FROM jaarquiz_responses WHERE quiz_id = ? AND token_hash = ?",
        (QUIZ_ID, _hash(token)),
    )
    if not rows:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token_invalid")
    r = rows[0]
    return quiz, {
        "voter": r["voter"],
        "answers": json.loads(r["answers"] or "{}"),
        "done": bool(r["done"]),
    }


# ── results ───────────────────────────────────────────────────────────────────

def compute_results(config: QuizConfig, responses: list[dict]) -> dict:
    """Average place per person per question, plus 'self-knowledge': how far
    each participant's place for themselves was from where the others put them.

    Only aggregates leave here — no participant's own ranking is exposed."""
    names = config.names()
    per_question = []
    for q in config.questions:
        options = config.options_for(q)
        places: dict[str, list[int]] = {o: [] for o in options}
        votes = 0
        for r in responses:
            order = r["answers"].get(q.id)
            if not isinstance(order, list):
                continue
            votes += 1
            for i, name in enumerate(order):
                if name in places:
                    places[name].append(i + 1)
        rows = []
        for name, p in places.items():
            if not p:
                continue
            rows.append({
                "name": name,
                "avg": round(sum(p) / len(p), 2),
                "min": min(p),
                "max": max(p),
            })
        rows.sort(key=lambda x: (x["avg"], x["name"]))
        per_question.append({"id": q.id, "votes": votes, "rows": rows})

    self_knowledge = []
    own_questions = [q for q in config.questions if not q.options]
    for r in responses:
        voter = r["voter"]
        if voter not in names:
            continue
        diffs = []
        for q in own_questions:
            mine = r["answers"].get(q.id)
            if not isinstance(mine, list) or voter not in mine:
                continue
            others = [
                o["answers"][q.id].index(voter) + 1
                for o in responses
                if o is not r and isinstance(o["answers"].get(q.id), list) and voter in o["answers"][q.id]
            ]
            if others:
                diffs.append(abs(mine.index(voter) + 1 - sum(others) / len(others)))
        if diffs:
            self_knowledge.append({"name": voter, "off_by": round(sum(diffs) / len(diffs), 2)})
    self_knowledge.sort(key=lambda x: (x["off_by"], x["name"]))

    return {
        "participants": len(responses),
        "done": sum(1 for r in responses if r["done"]),
        "questions": per_question,
        "self_knowledge": self_knowledge,
    }


def _public_config(config: QuizConfig) -> dict:
    return config.model_dump()


# ── admin ─────────────────────────────────────────────────────────────────────

async def _admin_state(db) -> dict:
    quiz = await _load_quiz(db)
    if not quiz:
        return {"exists": False}
    responses = await _responses(db)
    return {
        "exists": True,
        "join_code": quiz["join_code"],
        "revealed": quiz["revealed"],
        "config": _public_config(quiz["config"]),
        "responses": [
            {
                "voter": r["voter"],
                "answered": sum(1 for q in quiz["config"].questions if isinstance(r["answers"].get(q.id), list)),
                "done": r["done"],
                "updated_at": r["updated_at"],
            }
            for r in responses
        ],
        "results": compute_results(quiz["config"], responses),
    }


@router.get("/admin")
async def admin_get(admin=Depends(require_admin), db=Depends(db_dep)):
    return await _admin_state(db)


@router.put("/admin")
async def admin_put(body: AdminUpdate, admin=Depends(require_admin), db=Depends(db_dep)):
    raw = json.dumps(body.config.model_dump(), ensure_ascii=False)
    if len(raw.encode("utf-8")) > MAX_CONFIG_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "config_too_large")

    current = await _load_quiz(db)
    if body.join_code == "new" or not current:
        code = secrets.token_urlsafe(9)
    else:
        code = current["join_code"]

    now = _now()
    if current:
        await db.execute(
            "UPDATE jaarquiz SET join_code = ?, config = ?, revealed = ?, updated_at = ? WHERE id = ?",
            (code, raw, body.revealed, now, QUIZ_ID),
        )
    else:
        await db.execute(
            "INSERT INTO jaarquiz (id, join_code, config, revealed, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (QUIZ_ID, code, raw, body.revealed, now, now),
        )
    await db.commit()
    return await _admin_state(db)


@router.delete("/admin/responses/{voter}")
async def admin_free_name(voter: str, admin=Depends(require_admin), db=Depends(db_dep)):
    await db.execute(
        "DELETE FROM jaarquiz_responses WHERE quiz_id = ? AND voter = ?", (QUIZ_ID, voter)
    )
    await db.commit()
    return await _admin_state(db)


# ── participants ──────────────────────────────────────────────────────────────

@router.get("/{code}")
async def quiz_get(code: str, db=Depends(db_dep)):
    quiz = await _quiz_by_code(db, code)
    rows = await db.execute_fetchall(
        "SELECT voter FROM jaarquiz_responses WHERE quiz_id = ?", (QUIZ_ID,)
    )
    return {
        **_public_config(quiz["config"]),
        "revealed": quiz["revealed"],
        "taken": sorted(r["voter"] for r in rows),
    }


@router.post("/{code}/join", status_code=status.HTTP_201_CREATED)
async def quiz_join(code: str, body: JoinBody, db=Depends(db_dep)):
    quiz = await _quiz_by_code(db, code)
    voter = body.voter.strip()
    if voter not in quiz["config"].names():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_voter")
    taken = await db.execute_fetchall(
        "SELECT 1 FROM jaarquiz_responses WHERE quiz_id = ? AND voter = ?", (QUIZ_ID, voter)
    )
    if taken:
        raise HTTPException(status.HTTP_409_CONFLICT, "voter_taken")
    token = secrets.token_urlsafe(32)
    now = _now()
    try:
        await db.execute(
            "INSERT INTO jaarquiz_responses (quiz_id, voter, token_hash, answers, done, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (QUIZ_ID, voter, _hash(token), "{}", False, now, now),
        )
        await db.commit()
    except Exception as exc:  # the UNIQUE (quiz_id, voter) lost a race
        if "unique" in str(exc).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "voter_taken")
        raise
    return {"token": token, "voter": voter}


@router.get("/{code}/me")
async def quiz_me(code: str, x_quiz_token: Optional[str] = Header(default=None), db=Depends(db_dep)):
    _quiz, me = await _participant(db, code, x_quiz_token)
    return me


@router.put("/{code}/me")
async def quiz_save(
    code: str,
    body: AnswersBody,
    x_quiz_token: Optional[str] = Header(default=None),
    db=Depends(db_dep),
):
    quiz, me = await _participant(db, code, x_quiz_token)
    if quiz["revealed"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "quiz_closed")
    config: QuizConfig = quiz["config"]
    by_id = {q.id: q for q in config.questions}
    answers = {}
    for qid, order in body.answers.items():
        q = by_id.get(qid)
        if q is None:
            continue  # a question removed since the page loaded; drop it
        expected = config.options_for(q)
        if sorted(order) != sorted(expected) or len(order) != len(expected):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_order")
        answers[qid] = order
    done = body.done and all(q.id in answers for q in config.questions)
    await db.execute(
        "UPDATE jaarquiz_responses SET answers = ?, done = ?, updated_at = ? "
        "WHERE quiz_id = ? AND token_hash = ?",
        (json.dumps(answers, ensure_ascii=False), done, _now(), QUIZ_ID, _hash(x_quiz_token)),
    )
    await db.commit()
    return {"voter": me["voter"], "answers": answers, "done": done}


@router.get("/{code}/results")
async def quiz_results(code: str, db=Depends(db_dep)):
    quiz = await _quiz_by_code(db, code)
    if not quiz["revealed"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not_revealed")
    return compute_results(quiz["config"], await _responses(db))

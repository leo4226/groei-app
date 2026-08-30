"""Learning plant names by spaced repetition.

The party game already had a photo quiz (`clue_mode='logbook'`), and it is the
wrong tool for learning: it needs a session, a lobby and other people, every
game is independent, and — since the variety fix — it actively AVOIDS asking
about the same plant twice. That is right for a party and precisely backwards
for study, where the whole point is being asked again about the ones you got
wrong.

So this is its own thing. Two ideas carry it:

**The schedule is the feature.** A card you answer correctly moves up a Leitner
box and comes back later; a card you miss drops to box 0 and returns the same
day. Questions are cheap, the interval is what makes a name stick.

**Recognition first, recall second.** New cards are multiple choice, because
picking "Grote weegbree" out of four is achievable on day one. From box 2 the
same card asks you to type the name, which is a much harder and much more
durable thing to do. Answering is graded through the game's own name matcher,
so a near-miss spelling still counts.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import db_dep
from auth import get_current_account
# The solo quiz (#2026-08-07 design, "phase 1") already grades a typed plant
# name properly: diacritics stripped, token prefixes, Levenshtein <= 2. Writing
# a second, weaker matcher here would mean a name that counts on /quiz is
# rejected on /study, which the learner would rightly read as a bug.
from routers.quiz import _name_matches

logger = logging.getLogger(__name__)

router = APIRouter(tags=["study"])

# Days until a card in each box comes back. Box 0 returns the same session;
# the top box is "you know this" and only reappears seasonally, which for a
# garden is about right — you meet a plant again when it is in leaf.
_BOX_INTERVALS = [0, 1, 3, 7, 21, 60]
MAX_BOX = len(_BOX_INTERVALS) - 1
# Below this box a card is multiple choice; from here on it asks you to type.
TYPING_FROM_BOX = 2
# How many wrong options to offer alongside the right one.
_CHOICES = 4


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class StudyAnswer(BaseModel):
    card_id: int
    # What the learner said. Empty means "I don't know", which is a legitimate
    # answer and is graded as wrong without any spelling argument.
    answer: str = Field(default="", max_length=200)


def _display(item: dict) -> dict:
    """The names a card can be answered with, strongest first."""
    return {
        "name_nl": item.get("name_nl") or item.get("name") or "",
        "name_en": item.get("name_en"),
        "latin": item.get("latin"),
    }


async def _catalog(db, account: dict) -> list[dict]:
    """Everything this account could be asked about, with a photo to show.

    Two sources, because they teach different things: the field guide is what
    you met in the wild and want to recognise again, and your own plants are
    the names you use daily. A card needs a picture, so anything without one is
    not a card yet — that is also the honest nudge towards photographing more.
    """
    items: list[dict] = []

    discoveries = await db.execute_fetchall(
        """SELECT id, common_name, latin_name, thumbnail_url
             FROM plant_discoveries
            WHERE household_id = ? AND thumbnail_url IS NOT NULL
            ORDER BY discovered_at DESC""",
        (account["household_id"],),
    )
    for row in discoveries:
        d = dict(row)
        items.append({
            "source": "discovery", "ref_id": d["id"],
            "name_nl": d["common_name"], "name_en": None,
            "latin": d["latin_name"], "photo_url": d["thumbnail_url"],
        })

    plants = await db.execute_fetchall(
        """SELECT p.id,
                  p.name,
                  s.common_name_nl,
                  s.common_name_en,
                  s.latin_name,
                  MAX(ph.url) AS photo_url
             FROM plants p
             JOIN plant_photos ph ON ph.plant_id = p.id AND ph.url IS NOT NULL
             LEFT JOIN plant_species s ON s.id = p.species_id
            WHERE p.household_id = ? AND p.is_active = 1
            GROUP BY p.id, p.name, s.common_name_nl, s.common_name_en, s.latin_name""",
        (account["household_id"],),
    )
    for row in plants:
        p = dict(row)
        items.append({
            "source": "plant", "ref_id": p["id"],
            "name_nl": p["common_name_nl"] or p["name"],
            "name_en": p["common_name_en"],
            "latin": p["latin_name"], "photo_url": p["photo_url"],
        })

    return items


async def _ensure_cards(db, account_id: int, items: list[dict]) -> dict[tuple, dict]:
    """Create a card for anything new, and return every card by (source, ref_id).

    Cards are made on demand rather than by a backfill: a plant photographed
    this morning should be askable this afternoon without anyone running a job.
    """
    rows = await db.execute_fetchall(
        "SELECT id, source, ref_id, box, due_at, seen, correct FROM study_cards "
        "WHERE account_id = ?",
        (account_id,),
    )
    cards = {(r["source"], r["ref_id"]): dict(r) for r in map(dict, rows)}

    now = _now()
    for item in items:
        key = (item["source"], item["ref_id"])
        if key in cards:
            continue
        # Two overlapping requests — the field guide's stats call still in
        # flight when Study opens — both see the card missing and both insert.
        # The unique constraint then 500s one of them, on a screen the learner
        # did nothing wrong to reach. Losing the race is fine; the row exists
        # either way and the refetch below picks it up.
        await db.execute(
            "INSERT INTO study_cards (account_id, source, ref_id, box, due_at) "
            "VALUES (?, ?, ?, 0, ?) ON CONFLICT (account_id, source, ref_id) "
            "DO NOTHING",
            (account_id, item["source"], item["ref_id"], now),
        )
    if len(cards) != len(items):
        await db.commit()
        rows = await db.execute_fetchall(
            "SELECT id, source, ref_id, box, due_at, seen, correct FROM study_cards "
            "WHERE account_id = ?",
            (account_id,),
        )
        cards = {(r["source"], r["ref_id"]): dict(r) for r in map(dict, rows)}
    return cards


def _distractors(items: list[dict], target: dict, count: int) -> list[str]:
    """Wrong options for a multiple-choice card.

    Drawn from the learner's own catalog, never invented: recognising "Grote
    weegbree" among plants you actually have is the skill being practised, and
    made-up names would make every question answerable by elimination.
    """
    seen = {(_display(target)["name_nl"] or "").casefold()}
    out: list[str] = []
    # Shuffled, or the same three wrong answers would sit beside a plant every
    # time it came round and the card would become a shape to memorise rather
    # than a name to learn.
    import random
    pool = [i for i in items if i is not target]
    random.shuffle(pool)
    for other in pool:
        name = _display(other)["name_nl"]
        key = (name or "").casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        out.append(name)
        if len(out) >= count:
            break
    return out


@router.get("/study/next")
async def next_card(
    db=Depends(db_dep),
    account: dict = Depends(get_current_account),
):
    """The next card to answer, or a summary when nothing is due.

    Due cards come first, oldest deadline first; then cards never seen. A
    session therefore always repairs what is slipping before adding anything
    new, which is the part that stops a growing collection from becoming a
    growing backlog.
    """
    items = await _catalog(db, account)
    if not items:
        return {"card": None, "reason": "no_material", "stats": _empty_stats()}

    cards = await _ensure_cards(db, account["account_id"], items)
    by_key = {(i["source"], i["ref_id"]): i for i in items}
    now = _now()

    # Only cards whose item still exists: a deleted plant leaves its card behind.
    live = [(cards[k], by_key[k]) for k in by_key if k in cards]

    def due_at(card):
        value = card["due_at"]
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                return now
        return value or now

    due = sorted(
        [(c, i) for c, i in live if c["seen"] > 0 and due_at(c) <= now],
        key=lambda pair: due_at(pair[0]),
    )
    fresh = [(c, i) for c, i in live if c["seen"] == 0]
    queue = due + fresh

    stats = {
        "total": len(live),
        "due": len(due),
        "new": len(fresh),
        "learned": sum(1 for c, _ in live if c["box"] >= MAX_BOX),
    }
    if not queue:
        # Nothing to do is a real answer, not an empty screen: it means the
        # schedule is satisfied, and the next card has a date.
        upcoming = min((due_at(c) for c, _ in live), default=None)
        return {
            "card": None, "reason": "all_caught_up",
            "next_due_at": upcoming.isoformat() if upcoming else None,
            "stats": stats,
        }

    card, item = queue[0]
    typing = card["box"] >= TYPING_FROM_BOX
    names = _display(item)
    return {
        "card": {
            "card_id": card["id"],
            "photo_url": item["photo_url"],
            "box": card["box"],
            "mode": "type" if typing else "choose",
            # Options only in choose mode — sending them in type mode would put
            # the answer in the page for anyone who opens devtools.
            "options": (
                None if typing else
                _shuffled([names["name_nl"], *_distractors(items, item, _CHOICES - 1)])
            ),
        },
        "stats": stats,
    }


def _shuffled(values: list[str]) -> list[str]:
    import random
    out = [v for v in values if v]
    random.shuffle(out)
    return out


def _empty_stats() -> dict:
    return {"total": 0, "due": 0, "new": 0, "learned": 0}


@router.post("/study/answer")
async def answer_card(
    body: StudyAnswer,
    db=Depends(db_dep),
    account: dict = Depends(get_current_account),
):
    """Grade an answer and reschedule the card."""
    rows = await db.execute_fetchall(
        "SELECT id, source, ref_id, box, seen, correct FROM study_cards "
        "WHERE id = ? AND account_id = ?",
        (body.card_id, account["account_id"]),
    )
    if not rows:
        raise HTTPException(404, "Card not found")
    card = dict(rows[0])

    items = {(i["source"], i["ref_id"]): i for i in await _catalog(db, account)}
    item = items.get((card["source"], card["ref_id"]))
    if item is None:
        raise HTTPException(410, "This card's plant is gone")

    names = _display(item)
    correct = _is_correct(body.answer, names)

    box = min(card["box"] + 1, MAX_BOX) if correct else 0
    due = _now() + timedelta(days=_BOX_INTERVALS[box])
    await db.execute(
        "UPDATE study_cards SET box = ?, due_at = ?, seen = seen + 1, "
        "correct = correct + ?, last_answered_at = ? WHERE id = ?",
        (box, due, 1 if correct else 0, _now(), card["id"]),
    )
    await db.commit()

    return {
        "correct": correct,
        "box": box,
        "next_due_at": due.isoformat(),
        # Always returned, right or wrong: the moment right after answering is
        # when the name is worth reading, and a wrong answer that just says
        # "wrong" teaches nothing.
        "answer": names,
    }


# A typed answer must be at least this long, and cover at least this much of
# the shortest name, before the matcher's verdict is trusted.
_MIN_ANSWER_CHARS = 4
_MIN_ANSWER_RATIO = 0.5


def _is_correct(given: str, names: dict) -> bool:
    """Forgiving on spelling, strict on which plant.

    Delegates to the quiz's matcher so the two modes agree: a learner who types
    "monstera deliciosa" and is told it is right on one screen must not be told
    it is wrong on the other. An empty answer is "I don't know" — a legitimate
    thing to say, graded as wrong with no spelling argument.

    But that matcher accepts any substring and any token prefix, which is right
    for a quiz — one shot, points, answer revealed — and wrong here. Verified:
    it accepts "g" for "Gatenplant", and "ant" too. In a quiz that is a
    generous mark; in a schedule it promotes a card to a longer interval on the
    strength of a keystroke, which makes the whole schedule a lie.

    So a length floor comes first: enough characters to be a name, and enough
    of the shortest accepted name to be THAT name. "monstera" still passes for
    "Monstera deliciosa" — a genus is a real answer — while "g" and "grote" do
    not.
    """
    said = (given or "").strip()
    if not said:
        return False
    accepted = [n for n in (names.get("name_nl"), names.get("name_en"),
                            names.get("latin")) if n]
    if not accepted:
        return False

    shortest = min(len(n) for n in accepted)
    if len(said) < max(_MIN_ANSWER_CHARS, shortest * _MIN_ANSWER_RATIO):
        return False
    return _name_matches(said, accepted)


@router.get("/study/stats")
async def study_stats(
    db=Depends(db_dep),
    account: dict = Depends(get_current_account),
    _: int = Query(0, include_in_schema=False),
):
    """Counts for the entry point, so a card is only fetched when tapped."""
    items = await _catalog(db, account)
    if not items:
        return _empty_stats()
    cards = await _ensure_cards(db, account["account_id"], items)
    by_key = {(i["source"], i["ref_id"]) for i in items}
    live = [c for k, c in cards.items() if k in by_key]

    now = _now()

    def due_at(card):
        value = card["due_at"]
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                return now
        return value or now

    return {
        "total": len(live),
        "due": sum(1 for c in live if c["seen"] > 0 and due_at(c) <= now),
        "new": sum(1 for c in live if c["seen"] == 0),
        "learned": sum(1 for c in live if c["box"] >= MAX_BOX),
    }

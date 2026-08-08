"""Turn a free-text user report into a well-formed GitHub issue draft.

Stekkie's feedback flow asks the user exactly one question ("what's up?").
This module does the rest of the work: it classifies the report as a bug or a
feature request, writes a scannable English title and a structured body, and
guesses a difficulty — so the reporter never has to fill in a form.

The LLM is an enhancement, never a dependency: every failure path falls back to
`fallback_draft()`, which composes a usable (if plainer) issue from the raw text
alone. A report is never lost because the model was slow, down, or chatty.
"""
import json
import logging
from dataclasses import dataclass
from typing import Literal

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

logger = logging.getLogger(__name__)

FeedbackKind = Literal["bug", "feature"]
Difficulty = Literal["easy", "medium", "hard"]

VALID_KINDS: tuple[str, ...] = ("bug", "feature")
VALID_DIFFICULTIES: tuple[str, ...] = ("easy", "medium", "hard")
VALID_COMPOSED_BY: tuple[str, ...] = ("llm", "fallback")

TITLE_MAX = 100
# Keep the prompt (and so the cost) bounded no matter how long the chat ran.
MAX_TRANSCRIPT_MESSAGES = 10
MAX_TRANSCRIPT_CHARS = 400
MAX_REPORT_CHARS = 4000


@dataclass
class FeedbackDraft:
    kind: FeedbackKind
    title: str
    body: str
    difficulty: Difficulty | None = None
    # "llm" when the model composed it, "fallback" when we did it ourselves.
    # Surfaced so the UI/tests can tell the two apart.
    composed_by: Literal["llm", "fallback"] = "fallback"


def truncate_words(text: str, limit: int) -> str:
    """Trim to `limit` chars on a word boundary, so titles don't end mid-word."""
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    window = collapsed[:limit]
    # Peek one char past the limit: if it's a space the cut already lands on a
    # word boundary, so keep the whole window instead of dropping a word that fit.
    if collapsed[limit] != " ":
        window = window.rsplit(" ", 1)[0]
    clipped = window.rstrip(" ,.;:—-")
    # A single word longer than the limit has no boundary to fall back on.
    return clipped or collapsed[:limit]


def _first_sentence(text: str) -> str:
    collapsed = " ".join(text.split())
    for end in (". ", "! ", "? ", "\n"):
        head, sep, _ = collapsed.partition(end)
        if sep:
            collapsed = head
            break
    return collapsed.rstrip(".!?")


def fallback_draft(report: str, kind: FeedbackKind = "bug") -> FeedbackDraft:
    """Compose a draft without the LLM. Always succeeds for non-empty input."""
    title = truncate_words(_first_sentence(report), TITLE_MAX)
    return FeedbackDraft(
        kind=kind,
        title=title or "Feedback from Stekkie (no details)",
        body=report.strip(),
        difficulty=None,
        composed_by="fallback",
    )


def format_transcript(conversation: list[dict]) -> str:
    """Render the tail of a Stekkie chat as plain text for prompt/issue context."""
    lines = []
    for message in conversation[-MAX_TRANSCRIPT_MESSAGES:]:
        role = message.get("role")
        content = (message.get("content") or "").strip()
        if not content or role not in ("user", "assistant"):
            continue
        speaker = "User" if role == "user" else "Stekkie"
        lines.append(f"{speaker}: {truncate_words(content, MAX_TRANSCRIPT_CHARS)}")
    return "\n".join(lines)


def build_prompt(report: str, *, page: str = "", transcript: str = "") -> str:
    context_parts = []
    if page:
        context_parts.append(f"App page the user was on: {page}")
    if transcript:
        context_parts.append(
            "Preceding conversation with Stekkie (the in-app assistant):\n" + transcript
        )
    context = ("\n\n" + "\n\n".join(context_parts)) if context_parts else ""

    return f"""You triage incoming feedback for Floreren, a plant-care and garden-planning app.

A user submitted this report. It may be in Dutch or English, and may be very short.

USER REPORT:
\"\"\"
{report[:MAX_REPORT_CHARS]}
\"\"\"{context}

Write a GitHub issue for the development team. Return ONLY valid JSON, no markdown
fences and no commentary, in exactly this shape:
{{
  "kind": "bug" | "feature",
  "title": "<English, max {TITLE_MAX} chars, specific and scannable, no emoji, no trailing period>",
  "body": "<English markdown, 2-6 short lines>",
  "difficulty": "easy" | "medium" | "hard"
}}

Rules:
- "kind" is "bug" if something is broken, wrong, or not working; "feature" if the
  user wants something new, changed, or improved.
- Write "title" and "body" in English even when the report is Dutch — this is a
  developer-facing artifact.
- The body should state the problem or request, and where in the app it applies.
  Use the page and conversation above only as supporting context.
- Do NOT invent reproduction steps, error messages, screen names, or causes that
  the user did not mention. If details are missing, say what is unknown instead.
- "difficulty" is your rough guess at implementation effort; use "medium" if unsure."""


def parse_llm_draft(content: str) -> FeedbackDraft | None:
    """Parse the model's JSON reply. Returns None for anything unusable."""
    raw = (content or "").strip()
    if raw.startswith("```"):
        # Strip a ```json fence the model added despite being told not to.
        parts = raw.split("\n", 1)
        raw = parts[1].rsplit("```", 1)[0] if len(parts) == 2 else ""

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None

    kind = data.get("kind")
    title = data.get("title")
    body = data.get("body")
    if kind not in VALID_KINDS:
        return None
    if not isinstance(title, str) or not title.strip():
        return None
    if not isinstance(body, str) or not body.strip():
        return None

    difficulty = data.get("difficulty")
    if difficulty not in VALID_DIFFICULTIES:
        difficulty = None

    return FeedbackDraft(
        kind=kind,
        title=truncate_words(title.strip(), TITLE_MAX),
        body=body.strip(),
        difficulty=difficulty,
        composed_by="llm",
    )


async def compose_draft(
    report: str,
    *,
    page: str = "",
    conversation: list[dict] | None = None,
) -> FeedbackDraft:
    """Compose an issue draft from a free-text report, via LLM where possible.

    Never raises and never returns None — on any failure (no API key, network
    error, non-200, unparseable reply) it degrades to `fallback_draft()`.
    """
    transcript = format_transcript(conversation or [])

    if not LLM_API_KEY:
        return fallback_draft(report)

    prompt = build_prompt(report, page=page, transcript=transcript)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                LLM_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "content-type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "max_tokens": 800,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        if resp.status_code != 200:
            logger.warning("Feedback composer LLM returned %s", resp.status_code)
            return fallback_draft(report)
        content = resp.json()["choices"][0]["message"].get("content")
    # A 200 whose body is valid JSON but the wrong shape ({"choices": null},
    # a null message, a list where a dict belongs) must fall back like any
    # other failure — never surface as a 500 and lose the user's report.
    except (
        httpx.RequestError, KeyError, IndexError, TypeError, AttributeError, ValueError
    ) as exc:
        logger.warning("Feedback composer LLM call failed: %s", exc)
        return fallback_draft(report)

    return parse_llm_draft(content or "") or fallback_draft(report)

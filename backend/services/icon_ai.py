"""Ask the configured LLM (Nous Portal) for a distinctive plant icon.

Returns dict {plant_svg, cat} — only the PLANT foliage, no pot. The caller
(admin_panel.generate-icons) composites it onto the standard terracotta pot
(make_pot) for the potted variant and a ground shadow for the bare variant, so
every icon shares the exact same pot as the curated icons. Pure I/O —
validation, fallback, storage and DB writes are the caller's job.

**Why this streams.** Nous sits behind Cloudflare, which gives an origin 100
seconds to *start* responding before it synthesises a 524. A non-streamed
completion sends nothing until the model has finished thinking, so a slow
generation is indistinguishable from a dead origin — and every icon run failed
that way (#890: five species, three attempts each, fifteen straight 524s, zero
AI icons). Streaming puts the first token on the wire in a second or two, which
satisfies Cloudflare no matter how long the full drawing takes.

The old client timeout of 180s could never fire: it was longer than Cloudflare's
own window, so we always sat waiting to be handed a 524 rather than timing out
on our own terms. Timeouts here are deliberately *under* that window.
"""
from __future__ import annotations

import json
import logging
import re

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

logger = logging.getLogger(__name__)

# Room for one SVG plus a reasoning model's thinking. It was 12000, justified by
# a comment saying the prompt "asks for TWO full SVGs" — it does not, and has not
# for some time: the response carries a single `plant_svg` and the caller derives
# the potted and bare variants from it. A budget this size mostly bought a longer
# generation, which is what pushed the request past Cloudflare's ceiling.
MAX_TOKENS = 4000

# Under Cloudflare's ~100s origin window on every axis, so a stall surfaces as
# our own TimeoutException — a thing we can recognise and retry — instead of an
# opaque 524. `read` is per-chunk while streaming, so a generation may take far
# longer than 45s in total as long as tokens keep arriving.
STREAM_TIMEOUT = httpx.Timeout(connect=10.0, read=45.0, write=10.0, pool=10.0)
NON_STREAM_TIMEOUT = httpx.Timeout(connect=10.0, read=90.0, write=10.0, pool=10.0)

_PROMPT = """You design tiny flat-vector plant FOLIAGE for a gardening-app icon.
The terracotta pot is drawn separately and your foliage is placed on top of it,
so draw ONLY the plant — no pot, no soil, no background, no <svg> wrapper.

Follow EXACTLY:
- Output SVG drawing elements only: a single <g> wrapping any of path, ellipse,
  circle, line, polyline, polygon (optional nested g, defs, linearGradient, stop).
- NO <svg>, NO <rect>, NO pot/soil/ground, NO <script>, NO <image>, NO external
  href/url, NO event handlers.
- The plant is rooted at the soil line y≈75, centred at x=50, and grows UPWARD to
  about y≈15. Keep every coordinate within the 0..100 box.
- Greens only: #2F5D3A dark, #4A7C4E mid, #5C8A4E light, #3D5C3A stems. A small
  accent colour is allowed for flowers/fruit if characteristic of the species.
- Style: a few layered simple leaves with thin vein strokes. Reference (Monstera leaf):
  <g transform="translate(50 50) rotate(10)"><path d="M 0 2 Q -24 -6 -28 -26 Q -22 -36 -12 -30 Q -4 -22 0 -14 Q 4 -22 12 -30 Q 22 -36 28 -26 Q 24 -6 0 2 Z" fill="#4A7C4E"/><path d="M -18 -20 L -8 -14 M 18 -20 L 8 -14" stroke="#2F5D3A" stroke-width="2.4" stroke-linecap="round"/></g>
- Make it recognisably "{name}"{sci_clause}. Keep it simple and centred.

Return ONLY minified JSON, no prose:
{{"plant_svg": "<g>...</g>", "cat": "<one of: houseplant,flower,succulent,herb,edible,tree,shrub,grass,fern,bulb,climber,cactus>"}}"""


def _build_prompt(name: str, sci: str) -> str:
    sci_clause = f" (scientific name {sci})" if sci else ""
    return _PROMPT.format(name=name, sci_clause=sci_clause)


def _request_body(prompt: str, *, stream: bool) -> dict:
    return {
        "model": LLM_MODEL,
        "max_tokens": MAX_TOKENS,
        "stream": stream,
        "messages": [{"role": "user", "content": prompt}],
    }


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "content-type": "application/json",
    }


def content_from_sse(lines) -> str:
    """Assemble `choices[0].delta.content` from an OpenAI-style SSE stream.

    Deliberately forgiving. A gateway may interleave comment lines, send
    keep-alive blanks, split a frame oddly, or emit a chunk with no `content`
    (reasoning models put their thinking in a separate field, and the final
    frame usually carries only `finish_reason`). None of that is worth failing a
    drawing over, so anything unparseable is skipped rather than raised — if the
    result really is empty, the caller notices that instead.
    """
    parts: list[str] = []
    for raw in lines:
        line = (raw or "").strip()
        if not line or not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if payload == "[DONE]":
            break
        try:
            chunk = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            continue
        try:
            delta = chunk["choices"][0].get("delta") or {}
        except (KeyError, IndexError, TypeError, AttributeError):
            continue
        piece = delta.get("content")
        if isinstance(piece, str):
            parts.append(piece)
    return "".join(parts)


def parse_icon_payload(content: str) -> dict:
    """Turn the model's reply into {plant_svg, cat}.

    Handles the ```json fences the model sometimes adds despite being told not
    to, and falls back to the outermost {...} span when it wraps the JSON in
    prose — cheaper than losing a whole generation to a stray sentence.
    """
    raw = (content or "").strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end <= start:
            raise
        data = json.loads(raw[start:end + 1])
    if not isinstance(data, dict) or not data.get("plant_svg"):
        raise ValueError("LLM reply had no plant_svg")
    return {"plant_svg": data["plant_svg"], "cat": data.get("cat") or "unknown"}


async def _generate_streaming(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=STREAM_TIMEOUT) as client:
        async with client.stream(
            "POST", LLM_CHAT_URL, headers=_headers(),
            json=_request_body(prompt, stream=True),
        ) as resp:
            if resp.status_code >= 400:
                # The body has to be pulled in before raise_for_status can
                # describe it — a streamed error response is otherwise unread.
                await resp.aread()
            resp.raise_for_status()
            lines = [line async for line in resp.aiter_lines()]
    return content_from_sse(lines)


async def _generate_blocking(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=NON_STREAM_TIMEOUT) as client:
        resp = await client.post(
            LLM_CHAT_URL, headers=_headers(),
            json=_request_body(prompt, stream=False),
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"].get("content") or ""


# Everything that means "streaming itself did not work", and is therefore worth
# one blocking retry: a gateway that rejects `stream: true` (HTTPStatusError), a
# response that is not SSE at all, a connection or protocol failure. `ValueError`
# covers a malformed Authorization header raised as httpx.LocalProtocolError's
# cousin plus our own empty-content signal.
#
# `httpx.TimeoutException` is deliberately *not* in here even though it is a
# RequestError. A timeout means the upstream is slow, not that streaming is
# broken — and while streaming, `read` is per-chunk, so timing out means no token
# arrived for 45 seconds. A blocking retry after that is strictly slower and just
# burns another 90 seconds before failing the same way. The caller's backoff loop
# is the right place to retry a slow endpoint.
_STREAM_FALLBACK_ERRORS = (
    httpx.HTTPStatusError,
    httpx.StreamError,
    httpx.RequestError,
    ValueError,
)


async def generate_icon_variants(*, name: str, sci: str = "") -> dict:
    """One plant drawing from the LLM, streamed.

    Falls back to a blocking request if streaming does not work at all. That
    path keeps its timeout under Cloudflare's window so it fails cleanly rather
    than as a 524, but it is the worse route and only exists so a provider
    change cannot take icon generation down entirely.
    """
    if not LLM_API_KEY:
        # Without this the request goes out with `Authorization: Bearer ` and
        # httpx rejects it as an illegal header value — an error that names
        # neither the key nor the config, repeated once per attempt.
        raise RuntimeError("NOUS_API_KEY is not configured; cannot generate icons")

    prompt = _build_prompt(name, sci)

    try:
        content = await _generate_streaming(prompt)
    except httpx.TimeoutException:
        raise
    except _STREAM_FALLBACK_ERRORS as exc:
        logger.warning("icon stream failed (%s), retrying without streaming", exc)
        content = await _generate_blocking(prompt)

    if not content.strip():
        raise ValueError("LLM returned empty content")
    return parse_icon_payload(content)

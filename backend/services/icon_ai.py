"""Ask the configured LLM (Nous Portal) for a distinctive plant icon.

Returns dict {potted_svg, bare_svg, cat}. Pure I/O — validation, fallback,
storage and DB writes are the caller's job (admin_panel.generate-icons).
"""
from __future__ import annotations

import json
import re

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

_PROMPT = """You design tiny flat-vector plant icons for a gardening app.

Style guide — follow EXACTLY:
- Output a single SVG per variant, root <svg> with viewBox="0 0 100 100" width="100" height="100".
- Only use these tags: g, path, ellipse, rect, circle, line, polyline, polygon, defs, linearGradient, stop, title.
- NO <script>, NO <image>, NO external href/url, NO event handlers.
- Terracotta pot palette: #B2664A pot, #C77B5D rim, #8E4A33 inner, #4A3429 soil.
- Foliage greens: #2F5D3A dark, #4A7C4E mid, #5C8A4E light, #3D5C3A stems.
- The plant should be recognisably "{name}"{sci_clause}. Keep it simple and centred.
- "potted" sits in a terracotta pot bottom ~y=75-100. "bare" has no pot, just a soft ground shadow.

Return ONLY minified JSON, no prose:
{{"potted_svg": "<svg.../>", "bare_svg": "<svg.../>", "cat": "<one of: houseplant,flower,succulent,herb,edible,tree,shrub,grass,fern,bulb,climber,cactus>"}}"""


def _build_prompt(name: str, sci: str) -> str:
    sci_clause = f" (scientific name {sci})" if sci else ""
    return _PROMPT.format(name=name, sci_clause=sci_clause)


async def generate_icon_variants(*, name: str, sci: str = "") -> dict:
    prompt = _build_prompt(name, sci)
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            LLM_CHAT_URL,
            headers={"Authorization": f"Bearer {LLM_API_KEY}", "content-type": "application/json"},
            # DeepSeek V4 Flash (Nous) is a reasoning model and this asks for TWO
            # full SVGs — a tight cap gets eaten by reasoning, returning null or
            # truncated content (then everything falls back to identical
            # procedural icons). Give it ample room.
            json={"model": LLM_MODEL, "max_tokens": 12000,
                  "messages": [{"role": "user", "content": prompt}]},
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"].get("content")
    if not content:
        raise ValueError("LLM returned empty content (reasoning likely consumed the token budget)")
    raw = content.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    data = json.loads(raw)
    return {"potted_svg": data["potted_svg"], "bare_svg": data["bare_svg"],
            "cat": data.get("cat", "unknown")}

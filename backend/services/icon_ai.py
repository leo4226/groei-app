"""Ask the configured LLM (Nous Portal) for a distinctive plant icon.

Returns dict {plant_svg, cat} — only the PLANT foliage, no pot. The caller
(admin_panel.generate-icons) composites it onto the standard terracotta pot
(make_pot) for the potted variant and a ground shadow for the bare variant, so
every icon shares the exact same pot as the curated icons. Pure I/O —
validation, fallback, storage and DB writes are the caller's job.
"""
from __future__ import annotations

import json
import re

import httpx

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL

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


async def generate_icon_variants(*, name: str, sci: str = "") -> dict:
    prompt = _build_prompt(name, sci)
    async with httpx.AsyncClient(timeout=180) as client:
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
    return {"plant_svg": data["plant_svg"], "cat": data.get("cat", "unknown")}

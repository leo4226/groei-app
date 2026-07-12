"""Public share pages — no auth.

GET /s/{token}  server-rendered specimen card for a shared field-journal find.

Mounted WITHOUT the /api prefix: Vercel rewrites floreren.app/s/* straight to
this route, so WhatsApp/iMessage link scrapers get real HTML with OpenGraph
tags (a rich preview with photo + fact) while the link stays on floreren.app.
Only finds whose owner pressed Share (which mints share_token) are reachable;
exact GPS coordinates and personal field notes are never exposed.
"""
import html
import json
import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from database import db_dep

logger = logging.getLogger(__name__)
router = APIRouter(tags=["share"])

# The page renders in the SHARER's account language (the viewer is anonymous,
# so the owner's language is the only sensible choice — it also matches the
# name/fact they saw when they hit Share).
_L10N = {
    "nl": {
        "months": [
            "januari", "februari", "maart", "april", "mei", "juni",
            "juli", "augustus", "september", "oktober", "november", "december",
        ],
        "found_on": "Gevonden op",
        "found_in": "in",
        "did_you_know": "Wist je dat &hellip;",
        "masthead": "Floreren &middot; Veldgids",
        "title_suffix": "Floreren veldgids",
        "cta_line": "Gedeeld uit een persoonlijke veldgids &mdash; wilde planten herkennen, loggen en verzamelen.",
        "cta_button": "Ontdek Floreren",
    },
    "en": {
        "months": [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ],
        "found_on": "Found on",
        "found_in": "in",
        "did_you_know": "Did you know &hellip;",
        "masthead": "Floreren &middot; Field Guide",
        "title_suffix": "Floreren field guide",
        "cta_line": "Shared from a personal field guide &mdash; identify, log and collect wild plants.",
        "cta_button": "Discover Floreren",
    },
}


def _norm_lang(value) -> str:
    return "en" if str(value or "").strip().lower().startswith("en") else "nl"


def _date_label(value, lang: str) -> str:
    dt = value
    if not isinstance(dt, datetime):
        try:
            dt = datetime.fromisoformat(str(value))
        except ValueError:
            return str(value)[:10]
    return f"{dt.day} {_L10N[lang]['months'][dt.month - 1]} {dt.year}"


def _mrz(common: str, latin: str | None) -> str:
    import re
    import unicodedata

    raw = f"V<FLO<<{common}<<{latin or ''}".upper()
    raw = unicodedata.normalize("NFD", raw)
    raw = re.sub(r"[^A-Z0-9<]", "<", raw)
    return raw.ljust(36, "<")[:36]


def _fact_from(row, lang: str) -> str | None:
    other = "en" if lang == "nl" else "nl"
    for key in (f"fun_fact_{lang}", f"fun_fact_{other}"):
        value = _get(row, key)
        if value and str(value).strip():
            return str(value).strip()
    raw = _get(row, "phenology_json")
    if raw:
        try:
            phenology = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            phenology = None
        if isinstance(phenology, dict):
            for key in (f"interesting_facts_{lang}", f"interesting_facts_{other}"):
                value = phenology.get(key)
                if value and str(value).strip():
                    return str(value).strip()
    return None


def _get(row, key, default=None):
    try:
        return row[key]
    except Exception:
        return default


# The 404 page has no owner to borrow a language from, so it is bilingual.
_NOT_FOUND_HTML = """<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Niet gevonden / Not found — Floreren</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#F5F0E3;
font-family:Fraunces,Georgia,'Times New Roman',serif;color:#2A3326;text-align:center;padding:24px}
a{color:#2F5D3A}</style></head>
<body><div><p style="font-size:44px;margin:0">&#127811;</p>
<h1 style="font-weight:500">Deze vondst bestaat niet (meer).</h1>
<p style="font-style:italic;color:#5C6B55">De link is misschien ingetrokken of verkeerd overgetypt.<br>
<span lang="en">This find doesn't exist (anymore) — the link may have been revoked or mistyped.</span></p>
<p><a href="https://floreren.app">floreren.app</a></p></div></body></html>"""


@router.get("/s/{token}", response_class=HTMLResponse)
async def shared_discovery_page(token: str, db=Depends(db_dep)):
    rows = await db.execute_fetchall(
        """SELECT d.common_name, d.latin_name, d.thumbnail_url, d.place_name,
                  d.country_code, d.discovered_at, d.species_id,
                  s.common_name_nl, s.common_name_en,
                  s.fun_fact_nl, s.fun_fact_en, s.phenology_json,
                  a.language AS owner_language
           FROM plant_discoveries d
           LEFT JOIN plant_species s ON s.id = d.species_id
           LEFT JOIN accounts a ON a.id = d.account_id
           WHERE d.share_token = ?""",
        (token,),
    )
    if not rows:
        return HTMLResponse(_NOT_FOUND_HTML, status_code=404)
    row = rows[0]

    lang = _norm_lang(_get(row, "owner_language"))
    l10n = _L10N[lang]
    other = "en" if lang == "nl" else "nl"
    # The name the owner logged (and saw when they pressed Share) wins; the
    # catalog name in their language is only a fallback for empty snapshots.
    name = (
        (_get(row, "common_name") or "").strip()
        or (_get(row, f"common_name_{lang}") or "").strip()
        or (_get(row, f"common_name_{other}") or "").strip()
        or (row["latin_name"] or "")
    )
    latin = row["latin_name"]
    photo = row["thumbnail_url"]
    date_label = _date_label(row["discovered_at"], lang)
    place = _get(row, "place_name")
    place_label = f"{place}, {_get(row, 'country_code')}" if place and _get(row, "country_code") else place
    fact = _fact_from(row, lang)

    base = os.environ.get("PUBLIC_APP_URL", "https://floreren.app").rstrip("/")
    page_url = f"{base}/s/{token}"
    found_line = f"{l10n['found_on']} {date_label}" + (
        f" {l10n['found_in']} {place_label}" if place_label else ""
    )
    description = f"{found_line}." + (f" {fact}" if fact else "")
    if len(description) > 240:
        description = description[:237].rstrip() + "…"

    e = html.escape
    title = f"{name} ({latin})" if latin else name
    og_image = f'\n<meta property="og:image" content="{e(photo, quote=True)}">' if photo else ""
    twitter_card = "summary_large_image" if photo else "summary"

    photo_html = (
        f'<img class="photo" src="{e(photo, quote=True)}" alt="{e(name, quote=True)}">'
        if photo else
        '<div class="photo photo-empty">&#127807;</div>'
    )
    latin_html = f' <em>{e(latin)}</em>' if latin else ""
    fact_html = (
        f'<p class="label">{l10n["did_you_know"]}</p>\n<p class="fact">{e(fact)}</p>'
        if fact else ""
    )

    page = f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} — {l10n["title_suffix"]}</title>
<meta name="description" content="{e(description, quote=True)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Floreren">
<meta property="og:title" content="{e(title, quote=True)}">
<meta property="og:description" content="{e(description, quote=True)}">
<meta property="og:url" content="{e(page_url, quote=True)}">{og_image}
<meta name="twitter:card" content="{twitter_card}">
<link rel="icon" href="https://floreren.app/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root {{
    --paper: #F5F0E3; --surface: #FBF7EE; --border: #D9CFB8;
    --ink: #2A3326; --ink-soft: #5C6B55; --ink-muted: #8A9482;
    --primary: #2F5D3A; --terra: #B2664A;
  }}
  * {{ box-sizing: border-box }}
  body {{
    margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink);
    font-family: Fraunces, Georgia, 'Times New Roman', serif;
    display: flex; flex-direction: column; align-items: center;
    padding: 28px 16px 40px;
  }}
  .mono {{ font-family: 'JetBrains Mono', ui-monospace, monospace }}
  .masthead {{
    display: flex; align-items: center; gap: 12px; width: min(100%, 560px);
    margin-bottom: 14px; color: var(--ink-muted);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase;
  }}
  .masthead::before, .masthead::after {{ content: ''; height: 1px; background: var(--border); flex: 1 }}
  .card {{
    width: min(100%, 560px); background: var(--surface);
    border: 1px solid var(--border); border-radius: 22px; overflow: hidden;
    box-shadow: 0 14px 40px rgba(42, 51, 38, .10);
  }}
  .photo {{ display: block; width: 100%; height: min(58vw, 330px); object-fit: cover; border-bottom: 1px solid var(--border) }}
  .photo-empty {{ display: grid; place-items: center; font-size: 52px; background: linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%) }}
  .body {{ padding: 22px 26px 24px }}
  h1 {{ margin: 0 0 6px; font-size: 30px; font-weight: 500; line-height: 1.08; letter-spacing: -.01em }}
  h1 em {{ color: var(--primary); font-weight: 400 }}
  .meta {{
    margin: 0 0 16px; color: var(--ink-muted);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
  }}
  .label {{
    margin: 0 0 5px; color: var(--primary);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
  }}
  .fact {{ margin: 0 0 18px; font-style: italic; font-size: 15.5px; line-height: 1.6; color: var(--ink-soft) }}
  .mrz {{
    margin: 0; padding-top: 14px; border-top: 1px dashed var(--border);
    color: rgba(138, 148, 130, .55); font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px; letter-spacing: .24em; white-space: nowrap; overflow: hidden;
  }}
  .cta {{
    width: min(100%, 560px); text-align: center; margin-top: 22px;
  }}
  .cta p {{ margin: 0 0 10px; font-style: italic; font-size: 13.5px; color: var(--ink-soft) }}
  .cta a {{
    display: inline-block; background: var(--primary); color: #fff; text-decoration: none;
    border-radius: 999px; padding: 11px 26px; font-size: 14.5px; font-weight: 500;
  }}
  .cta a:hover {{ background: #275031 }}
</style>
</head>
<body>
  <p class="masthead">{l10n["masthead"]}</p>
  <article class="card">
    {photo_html}
    <div class="body">
      <h1>{e(name)}{latin_html}.</h1>
      <p class="meta">{e(found_line)}</p>
      {fact_html}
      <p class="mrz" aria-hidden="true">{e(_mrz(name, latin))}</p>
    </div>
  </article>
  <div class="cta">
    <p>{l10n["cta_line"]}</p>
    <a href="https://floreren.app">{l10n["cta_button"]}</a>
  </div>
</body>
</html>"""
    return HTMLResponse(page)

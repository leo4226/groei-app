"""Shared visual shell for every email Floreren sends (#889).

Before this, each email built its own table markup with its own colours. None of
them matched the app: the shell used `#4a7c59` for green and `#f5f5f0` for the
page, while the app's tokens are `#2F5D3A` and `#F5F0E3`. Close enough to look
like a mistake rather than a choice.

The palette below mirrors `frontend/src/index.css`. Keep them in step — an email
is often the first thing a user sees in a week, and it should look like the app
they are about to open.

Email HTML is deliberately old-fashioned: nested tables, inline styles, no flex
or grid, no external stylesheets. Outlook renders with Word's engine and Gmail
strips `<style>` blocks in some clients, so anything structural must survive
without CSS. The one `<style>` block we do emit is a progressive enhancement
(dark mode) that costs nothing where it is ignored.
"""

# ── palette: mirrors frontend/src/index.css ───────────────────────────────
BG = "#F5F0E3"
SURFACE = "#FBF7EE"
PAPER = "#FFFEF9"
PRIMARY = "#2F5D3A"
PRIMARY_DARK = "#1E3F26"
PRIMARY_HIGHLIGHT = "#8FA882"
TEXT = "#1F2A1E"
TEXT_SOFT = "#4A5A44"
TEXT_MUTED = "#8A9482"
BORDER = "#D9CFB8"
BORDER_SOFT = "#E5DCC3"
OVERDUE = "#B2664A"
DUE = "#D9A418"

# Fraunces is the app's heading face. Almost no mail client will load a webfont,
# so this is really "Georgia, and Fraunces if the reader happens to have it".
HEADING_FONT = "'Fraunces',Georgia,'Times New Roman',serif"
BODY_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

_DARK_MODE_CSS = f"""
@media (prefers-color-scheme: dark) {{
  .fl-page {{ background:#1A1D1A !important; }}
  .fl-card {{ background:#232821 !important; border-color:#39402F !important; }}
  .fl-head {{ background:#1F2A1E !important; }}
  .fl-text {{ color:#ECE6D8 !important; }}
  .fl-soft {{ color:#C4CBBA !important; }}
  .fl-muted {{ color:#9AA391 !important; }}
  .fl-row {{ background:#1F241E !important; border-color:#39402F !important; }}
}}
"""


def button(label: str, url: str) -> str:
    """A tappable primary button. A table, not an <a> with padding — Outlook
    ignores padding on inline elements, which would collapse it to plain text."""
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:26px auto 0;"><tr>'
        f'<td align="center" style="background:{PRIMARY};border-radius:12px;">'
        f'<a href="{url}" style="display:inline-block;padding:14px 34px;color:#FFFEF9;'
        f'font-family:{BODY_FONT};font-size:16px;font-weight:700;text-decoration:none;'
        'letter-spacing:0.01em;">'
        f'{label}</a></td></tr></table>'
    )


def paragraph(text: str, *, muted: bool = False, size: int = 16) -> str:
    colour = TEXT_MUTED if muted else TEXT_SOFT
    cls = "fl-muted" if muted else "fl-soft"
    return (
        f'<p class="{cls}" style="margin:0 0 14px;color:{colour};'
        f'font-family:{BODY_FONT};font-size:{size}px;line-height:1.55;">{text}</p>'
    )


def render_email(
    *,
    lang: str,
    preheader: str,
    body_html: str,
    footer_html: str = "",
) -> str:
    """Wrap content in the Floreren shell.

    `preheader` is the grey line inboxes show next to the subject. Left empty it
    fills with whatever the first markup happens to be — usually "Floreren",
    which wastes the one line of persuasion an email gets.
    """
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>{_DARK_MODE_CSS}</style>
</head>
<body class="fl-page" style="margin:0;padding:0;background:{BG};font-family:{BODY_FONT};">
<div style="display:none;font-size:1px;color:{BG};max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{BG};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;max-width:520px;background:{PAPER};border:1px solid {BORDER};border-radius:20px;overflow:hidden;"
       class="fl-card">
<tr><td class="fl-head" style="padding:24px 32px 20px;text-align:center;background:{SURFACE};border-bottom:1px solid {BORDER_SOFT};">
<div style="font-size:20px;line-height:1;margin:0 0 6px;">🌿</div>
<div style="font-family:{HEADING_FONT};font-size:26px;font-weight:600;color:{PRIMARY};letter-spacing:-0.01em;line-height:1.1;">Floreren</div>
<div style="margin:8px auto 0;width:34px;height:2px;background:{PRIMARY_HIGHLIGHT};border-radius:2px;"></div>
</td></tr>
<tr><td style="padding:30px 32px 32px;">
{body_html}
</td></tr>
{footer_html}
</table>
</td></tr>
</table>
</body>
</html>"""


def footer(inner_html: str) -> str:
    return (
        f'<tr><td style="padding:16px 32px 22px;border-top:1px solid {BORDER_SOFT};text-align:center;">'
        f'{inner_html}</td></tr>'
    )


def footer_note(text: str) -> str:
    return footer(
        f'<p class="fl-muted" style="margin:0;color:{TEXT_MUTED};font-family:{BODY_FONT};'
        f'font-size:12px;line-height:1.5;">{text}</p>'
    )


def html_to_text(html: str) -> str:
    """A readable plain-text fallback, derived from the HTML we already built.

    Every email should carry one: some clients prefer it, screen readers handle
    it better, and a missing text/plain part is a documented spam signal. Doing
    it by derivation rather than by hand means the two can never drift.
    """
    import re

    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    # Keep the destination of links: "Open Floreren" alone is useless in text.
    text = re.sub(
        r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
        lambda m: f"{re.sub(r'<[^>]+>', '', m.group(2)).strip()}: {m.group(1)}",
        text,
        flags=re.S | re.I,
    )
    text = re.sub(r"<(br|/p|/h1|/h2|/li|/tr)[^>]*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = (
        text.replace("&nbsp;", " ").replace("&amp;", "&")
        .replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'")
    )
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()

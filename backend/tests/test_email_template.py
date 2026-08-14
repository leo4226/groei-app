"""The shared email shell and the digest it renders (#889).

Emails are the one surface with no dev loop — you cannot open devtools in
someone's inbox — so the things that used to go wrong silently are pinned here.
"""
import pytest

from models import CareTask
from services import email_template as tpl
from services.digest import build_digest_email
from services.email import _RESET_STRINGS, FROM_ADDRESS


def task(plant_name="Monstera", care_type="water", days_overdue=0, **kw):
    return CareTask(
        schedule_id=kw.get("schedule_id", 1),
        plant_id=kw.get("plant_id", 1),
        plant_name=plant_name,
        plant_photo=None,
        location=kw.get("location"),
        map_name=kw.get("map_name"),
        care_type=care_type,
        next_due=kw.get("next_due", "2026-08-14"),
        days_overdue=days_overdue,
        last_done_by=None,
        last_done_by_name=None,
        last_done_at=None,
    )


# ── the shell ──────────────────────────────────────────────────────────────

def test_shell_uses_the_app_palette_not_its_own():
    # The old templates used #4a7c59 and #f5f5f0 — close to the app's #2F5D3A
    # and #F5F0E3 without matching either, which reads as a mistake.
    html = tpl.render_email(lang="nl", preheader="x", body_html="<p>hi</p>")
    assert tpl.PRIMARY in html
    assert tpl.BG in html
    assert "#4a7c59" not in html.lower()


def test_shell_carries_a_preheader():
    # Without one, inboxes fill the preview line with whatever markup comes
    # first — usually the word "Floreren", wasting the only line of persuasion.
    html = tpl.render_email(lang="nl", preheader="Monstera — Water", body_html="")
    assert "Monstera — Water" in html


def test_shell_declares_dark_mode_support():
    html = tpl.render_email(lang="nl", preheader="", body_html="")
    assert 'name="color-scheme"' in html
    assert "prefers-color-scheme" in html


@pytest.mark.parametrize("lang", ["nl", "en"])
def test_shell_sets_the_language_it_was_written_in(lang):
    assert f'<html lang="{lang}"' in tpl.render_email(lang=lang, preheader="", body_html="")


def test_button_is_a_table_so_outlook_keeps_its_padding():
    # Outlook renders with Word: padding on an inline <a> collapses, and the
    # button degrades into a bare link.
    html = tpl.button("Open Floreren", "https://floreren.app/maps")
    assert "<table" in html and "https://floreren.app/maps" in html


# ── plain text ─────────────────────────────────────────────────────────────

def test_plain_text_keeps_link_destinations():
    # "Open Floreren" on its own is useless in a text-only client.
    text = tpl.html_to_text(tpl.button("Open Floreren", "https://floreren.app/maps"))
    assert "https://floreren.app/maps" in text


def test_plain_text_drops_markup_and_blank_lines():
    text = tpl.html_to_text("<style>p{color:red}</style><p>Hoi</p><p></p><p>Tot ziens</p>")
    assert "color:red" not in text
    assert text == "Hoi\nTot ziens"


def test_from_address_has_a_display_name():
    # Inboxes show the name, not the address.
    assert FROM_ADDRESS.startswith("Floreren <")


# ── the digest ─────────────────────────────────────────────────────────────

def test_subject_leads_with_the_count():
    subject, _ = build_digest_email("Leon", [task()], [], "https://u", lang="nl")
    assert subject == "1 plant heeft vandaag aandacht nodig"

    subject, _ = build_digest_email("Leon", [task()], [task("Ficus")], "https://u", lang="nl")
    assert subject == "2 planten hebben vandaag aandacht nodig"


def test_overdue_tasks_are_visually_distinct_from_todays():
    _, html = build_digest_email(
        "Leon", [task(days_overdue=3)], [task("Ficus")], "https://u", lang="nl",
    )
    # Every task looked identical before: a bullet and an emoji, whether it was
    # three days late or due this afternoon.
    assert tpl.OVERDUE in html
    assert tpl.DUE in html


def test_days_late_reads_naturally_in_both_numbers():
    # The old copy said "1 dag(en) te laat".
    _, html = build_digest_email("Leon", [task(days_overdue=1)], [], "https://u", lang="nl")
    assert "1 dag te laat" in html
    assert "dag(en)" not in html

    _, html = build_digest_email("Leon", [task(days_overdue=4)], [], "https://u", lang="nl")
    assert "4 dagen te laat" in html


@pytest.mark.parametrize("lang,expected", [("nl", "Water"), ("en", "Water")])
def test_care_labels_follow_the_language(lang, expected):
    _, html = build_digest_email("Leon", [task(care_type="water")], [], "https://u", lang=lang)
    assert expected in html


def test_digest_names_the_place_when_there_is_one():
    _, html = build_digest_email(
        "Leon", [], [task(map_name="Achtertuin")], "https://u", lang="nl",
    )
    assert "Achtertuin" in html


def test_unsubscribe_link_survives_into_the_footer():
    _, html = build_digest_email("Leon", [task()], [], "https://unsub.example", lang="nl")
    assert "https://unsub.example" in html


# ── password reset ─────────────────────────────────────────────────────────

def test_reset_email_exists_in_both_languages():
    # It was English-only and hardcoded — the one email a user cannot afford to
    # misread, sent in a language they may never have chosen.
    assert set(_RESET_STRINGS) == {"nl", "en"}
    for strings in _RESET_STRINGS.values():
        assert set(strings) == set(_RESET_STRINGS["nl"])

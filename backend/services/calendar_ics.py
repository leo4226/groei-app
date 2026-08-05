"""RFC 5545 serialization for Floreren's read-only personal calendar.

The serializer is deliberately pure: it accepts the existing Calendar event
projection and never reads or mutates schedules. An independent parser is used
in tests so escaping/folding bugs are caught outside this implementation.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
from typing import Any, Iterable, Literal

from care_types import CARE_TYPES

Language = Literal["nl", "en"]

_ACTION_LABELS: dict[str, dict[Language, str]] = {
    "water": {"nl": "Water geven", "en": "Water"},
    "fertilize": {"nl": "Bemesten", "en": "Fertilize"},
    "prune": {"nl": "Snoeien", "en": "Prune"},
    "repot": {"nl": "Verpotten", "en": "Repot"},
    "mist": {"nl": "Bevochtigen", "en": "Mist"},
    "rotate": {"nl": "Draaien", "en": "Rotate"},
    "pest_check": {"nl": "Controleer op plagen", "en": "Check for pests"},
    "dust": {"nl": "Bladeren afnemen", "en": "Wipe leaves"},
    "frost_protect": {"nl": "Bescherm tegen vorst", "en": "Protect from frost"},
    "heat_protect": {"nl": "Bescherm tegen hitte", "en": "Protect from heat"},
}


def _value(event: Any, key: str, default=None):
    if isinstance(event, dict):
        return event.get(key, default)
    return getattr(event, key, default)


def _as_date(value: date | str) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _basic_date(value: date) -> str:
    return value.isoformat().replace("-", "")


def _escape_text(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    return (
        value.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def _fold_line(line: str) -> list[str]:
    """Fold a content line at 75 UTF-8 octets without splitting code points."""
    chunks: list[str] = []
    current = ""
    limit = 75
    for char in line:
        candidate = current + char
        if current and len(candidate.encode("utf-8")) > limit:
            chunks.append(current)
            current = char
            limit = 74  # continuation line's leading space consumes one octet
        else:
            current = candidate
    chunks.append(current)
    return [chunks[0], *(" " + chunk for chunk in chunks[1:])]


def _stable_uid(event: Any) -> str:
    external_uid_key = _value(event, "external_uid_key")
    if external_uid_key:
        identity = f"external|{external_uid_key}"
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
        return f"{digest}@calendar.floreren.app"
    child_ids = sorted(str(value) for value in (
        _value(event, "group_member_event_ids", None)
        or _value(event, "child_ids", [])
        or []
    ))
    identity = "|".join(child_ids) if child_ids else str(_value(event, "id"))
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
    return f"{digest}@calendar.floreren.app"


def _care_label(care_type: str, language: Language) -> str:
    if care_type in _ACTION_LABELS:
        return _ACTION_LABELS[care_type][language]
    definition = CARE_TYPES.get(care_type) or {}
    return definition.get(f"label_{language}") or care_type.replace("_", " ").title()


def _summary(event: Any, label: str, language: Language, privacy: bool) -> str:
    plant_names = _value(event, "plant_names", []) or []
    plant_name = _value(event, "plant_name") or (plant_names[0] if plant_names else None)
    group_count = _value(event, "group_count", len(plant_names) or 1) or 1
    if privacy:
        if language == "nl":
            plant_label = "plant" if group_count == 1 else "planten"
        else:
            plant_label = "plant" if group_count == 1 else "plants"
        return f"{label} · {group_count} {plant_label}"
    if not privacy and group_count == 1 and plant_name:
        return f"{label} · {plant_name}"
    map_name = _value(event, "map_name")
    return label if not map_name else f"{label} · {map_name}"


def _description(event: Any, language: Language, privacy: bool) -> str:
    link_text = (
        "Open Floreren om deze verzorgingssessie te bekijken."
        if language == "nl"
        else "Open Floreren to view this care session."
    )
    plant_names = _value(event, "plant_names", []) or []
    if not plant_names:
        members = _value(event, "group_members", []) or []
        plant_names = [
            _value(member, "plant_name")
            for member in members
            if _value(member, "plant_name")
        ]
    if not plant_names and _value(event, "plant_name"):
        plant_names = [_value(event, "plant_name")]
    map_name = _value(event, "map_name")
    lines: list[str] = []
    group_count = _value(event, "group_count", len(plant_names) or 1) or 1
    if group_count > 1:
        noun = "planten" if language == "nl" else "plants"
        lines.append(f"{group_count} {noun}")
    if plant_names and not privacy:
        label = "Planten" if language == "nl" else "Plants"
        visible_names = plant_names[:8]
        hidden_count = max(group_count - len(visible_names), 0)
        if hidden_count:
            more = "meer" if language == "nl" else "more"
            visible_names.append(f"+{hidden_count} {more}")
        lines.append(f"{label}: {', '.join(visible_names)}")
    if map_name and not privacy:
        label = "Ruimte" if language == "nl" else "Space"
        lines.append(f"{label}: {map_name}")

    if not privacy or _value(event, "weather_triggered", False):
        reason = _value(event, f"reason_{language}")
        action = _value(event, f"action_{language}")
        if reason:
            lines.append(str(reason))
        if action:
            lines.append(str(action))
    lines.append(link_text)
    return "\n".join(lines)


def serialize_calendar(
    events: Iterable[Any],
    *,
    language: Language,
    privacy: bool = False,
    calendar_name: str | None = None,
    generated_at: date | datetime | None = None,
) -> bytes:
    """Serialize Calendar events as a parser-valid, read-only ICS payload."""
    name = calendar_name or ("Floreren verzorging" if language == "nl" else "Floreren care")
    if generated_at is None:
        generated = datetime.combine(date.today(), datetime.min.time(), timezone.utc)
    elif isinstance(generated_at, datetime):
        generated = generated_at.astimezone(timezone.utc)
    else:
        generated = datetime.combine(generated_at, datetime.min.time(), timezone.utc)
    stamp = generated.strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Floreren//Personal Care Calendar//NL",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_text(name)}",
        "X-PUBLISHED-TTL:PT1H",
    ]

    for event in events:
        event_date = _as_date(_value(event, "date"))
        care_type = str(_value(event, "type", _value(event, "care_type", "care")))
        label = _care_label(care_type, language)
        if care_type == "water" and _value(event, "weather_triggered"):
            # Heat-triggered extra watering moments stand out in the agenda.
            label = "Water geven (extra)" if language == "nl" else "Water (extra)"
        summary = _summary(event, label, language, privacy)
        description = _description(event, language, privacy)
        deep_link = f"https://floreren.app/calendar?date={event_date.isoformat()}"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{_stable_uid(event)}",
            f"DTSTAMP:{stamp}",
            f"LAST-MODIFIED:{stamp}",
            f"DTSTART;VALUE=DATE:{_basic_date(event_date)}",
            f"DTEND;VALUE=DATE:{_basic_date(event_date + timedelta(days=1))}",
            f"SUMMARY:{_escape_text(summary)}",
            f"DESCRIPTION:{_escape_text(description)}",
            f"URL:{deep_link}",
            "TRANSP:TRANSPARENT",
            "STATUS:CONFIRMED",
            "SEQUENCE:0",
            "END:VEVENT",
        ])

    lines.append("END:VCALENDAR")
    folded = [part for line in lines for part in _fold_line(line)]
    return ("\r\n".join(folded) + "\r\n").encode("utf-8")

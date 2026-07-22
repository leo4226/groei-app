import logging
import os
from datetime import date
logger = logging.getLogger(__name__)
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_account
from database import db_dep
from services.environment import get_rain_data, get_temp_data
from services.care_task_service import classify_care_tasks, fetch_household_schedule_rows
from services.garden_biodiversity import compute_for_map
from services.plant_suggestions import bucket_for, fit_grade, recommend_for_garden, recommend_for_spot
from services.warnings import compute_plant_warnings

router = APIRouter()

CHATBOT_URL = os.getenv("CHATBOT_URL", "https://chatbot.floreren.app/chat")
MAX_CONTEXT_PLANTS = int(os.getenv("STEKKIE_MAX_CONTEXT_PLANTS", "40"))


class ChatMessage(BaseModel):
    role: str
    content: str


class PageContext(BaseModel):
    route: str
    map_slug: str | None = None
    plant_id: int | None = None
    selected_plant_id: int | None = None
    selected_object_id: int | None = None
    clicked_map_x: float | None = None
    clicked_map_y: float | None = None
    ground_zone_id: str | None = None
    ground_zone_name: str | None = None
    ground_zone_type: str | None = None
    light_bucket: Literal["full", "part", "bright_shade", "deep_shade"] | None = None
    direct_sun_hours: float | None = None
    sky_view_factor: float | None = None


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    page_context: PageContext | None = None
    # Sent by the frontend when available; backend still falls back gracefully.
    active_user_id: int | None = None
    language: str | None = None


class BotRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    # Backward-compatible prose fields for the current/old worker rollout.
    plants_context: str = ""
    maps_context: str = ""
    biodiversity_context: str = ""
    page_context: dict | None = None
    # New structured packet for upgraded Stekkie.
    garden_context: dict[str, Any] | None = None
    language: str | None = None


class SuggestedAction(BaseModel):
    type: Literal["navigate", "mark_care_done"]
    label: str
    requires_confirmation: bool
    payload: dict[str, Any]


class ChatResponse(BaseModel):
    response: str
    suggested_action: SuggestedAction | None = None


async def _validate_suggested_action(
    raw: Any, db, household_id: int
) -> SuggestedAction | None:
    """Validate an untrusted suggested_action from the chat worker.

    The worker only ever *suggests* an action; this checks the type is one
    we support and that any referenced plant/schedule/map actually exists
    in the caller's household before letting the frontend render a button
    for it. Returns None (silently dropping the action, not the reply) for
    anything malformed, unsupported, or out of scope — the ids are never
    trusted enough to execute directly, only enough to offer a button that
    itself calls the normal authenticated REST endpoints.
    """
    if not isinstance(raw, dict):
        return None
    action_type = raw.get("type")
    label = raw.get("label")
    payload = raw.get("payload")
    if not isinstance(label, str) or not label.strip() or not isinstance(payload, dict):
        return None

    if action_type == "navigate":
        target = payload.get("target")
        map_id = payload.get("id")
        slug = payload.get("slug")
        if target not in ("plant", "map", "calendar", "add_plant"):
            return None

        if target == "plant":
            if not isinstance(map_id, int):
                return None
            rows = await db.execute_fetchall(
                "SELECT 1 FROM plants WHERE id = ? AND household_id = ? AND is_active = 1",
                (map_id, household_id),
            )
            if not rows:
                return None
            return SuggestedAction(
                type="navigate", label=label, requires_confirmation=False,
                payload={"target": "plant", "id": map_id},
            )

        if target == "map":
            if not isinstance(map_id, int) and not isinstance(slug, str):
                return None
            if isinstance(slug, str):
                rows = await db.execute_fetchall(
                    "SELECT 1 FROM maps WHERE slug = ? AND household_id = ?",
                    (slug, household_id),
                )
            else:
                rows = await db.execute_fetchall(
                    "SELECT 1 FROM maps WHERE id = ? AND household_id = ?",
                    (map_id, household_id),
                )
            if not rows:
                return None
            map_payload: dict[str, Any] = {"target": "map"}
            if isinstance(slug, str):
                map_payload["slug"] = slug
            if isinstance(map_id, int):
                map_payload["id"] = map_id
            return SuggestedAction(
                type="navigate", label=label, requires_confirmation=False, payload=map_payload,
            )

        # calendar / add_plant are static routes — no id to validate.
        return SuggestedAction(
            type="navigate", label=label, requires_confirmation=False, payload={"target": target},
        )

    if action_type == "mark_care_done":
        plant_id = payload.get("plant_id")
        schedule_id = payload.get("schedule_id")
        care_type = payload.get("care_type")
        if not isinstance(plant_id, int) or not isinstance(care_type, str):
            return None
        rows = await db.execute_fetchall(
            """SELECT cs.id FROM care_schedules cs
               JOIN plants p ON cs.plant_id = p.id
               WHERE cs.plant_id = ? AND cs.care_type = ? AND cs.is_active = 1
                 AND p.household_id = ? AND p.is_active = 1""",
            (plant_id, care_type, household_id),
        )
        if not rows:
            return None
        resolved_schedule_id = rows[0]["id"]
        if isinstance(schedule_id, int) and schedule_id != resolved_schedule_id:
            return None
        return SuggestedAction(
            type="mark_care_done", label=label, requires_confirmation=True,
            payload={"plant_id": plant_id, "schedule_id": resolved_schedule_id, "care_type": care_type},
        )

    return None


def _json_safe(value: Any) -> Any:
    if isinstance(value, (date,)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


def _without_none(values: dict[str, Any]) -> dict[str, Any]:
    """Keep structured context compact while preserving explicit false/zero values."""
    return {k: v for k, v in values.items() if v is not None}


def _care_warning_to_context(warning: Any) -> dict[str, Any]:
    return {
        "care_type": warning.care_type,
        "severity": warning.severity,
        "trigger": warning.trigger,
        "reason_nl": warning.reason_nl,
        "reason_en": warning.reason_en,
        "action_nl": warning.action_nl,
        "action_en": warning.action_en,
        "weather_metric": warning.weather_metric,
        "weather_value_c": warning.weather_value_c,
        "forecast_day_label_nl": warning.forecast_day_label_nl,
        "forecast_day_label_en": warning.forecast_day_label_en,
    }


def _care_status_to_context(status: Any) -> dict[str, Any]:
    return {
        "status": status.status,
        "days_until_due": status.days_until_due,
        "last_done": _json_safe(status.last_done),
    }


_CARE_TYPE_LABELS_NL = {
    "water": "Water",
    "fertilize": "Bemesten",
    "mist": "Sproeien",
    "rotate": "Draaien",
    "repot": "Verpot-check",
    "prune": "Snoeien",
    "frost_protect": "Beschermen tegen kou",
    "heat_protect": "Beschermen tegen hitte",
}

_CARE_TYPE_LABELS_EN = {
    "water": "Watering",
    "fertilize": "Fertilizing",
    "mist": "Misting",
    "rotate": "Rotating",
    "repot": "Repot check",
    "prune": "Pruning",
    "frost_protect": "Cold protection",
    "heat_protect": "Heat protection",
}


def _care_type_label(care_type: str, language: str) -> str:
    labels = _CARE_TYPE_LABELS_EN if language == "en" else _CARE_TYPE_LABELS_NL
    return labels.get(care_type, care_type.replace("_", " "))


def _care_task_reason(task: Any, bucket: str, language: str) -> str:
    label = _care_type_label(task.care_type, language)
    if bucket == "overdue":
        days = max(1, task.days_overdue)
        if language == "en":
            unit = "day" if days == 1 else "days"
            return f"{label} is {days} {unit} overdue"
        unit = "dag" if days == 1 else "dagen"
        return f"{label} is {days} {unit} te laat"
    if bucket == "due_today":
        return f"{label} is due today" if language == "en" else f"{label} is vandaag gepland"

    days_until_due = max(1, -task.days_overdue)
    if language == "en":
        unit = "day" if days_until_due == 1 else "days"
        return f"{label} is due in {days_until_due} {unit}"
    unit = "dag" if days_until_due == 1 else "dagen"
    return f"{label} staat over {days_until_due} {unit} gepland"


def _care_task_to_context(task: Any, bucket: str, language: str) -> dict[str, Any]:
    days_until_due = None
    days_overdue = None
    if bucket == "overdue":
        days_overdue = task.days_overdue
    elif bucket == "due_today":
        days_until_due = 0
    else:
        days_until_due = max(1, -task.days_overdue)

    return _without_none(
        {
            "plant_id": task.plant_id,
            "plant_name": task.plant_name,
            "map_name": getattr(task, "map_name", None),
            "map_type": task.map_type,
            "location": task.location,
            "care_type": task.care_type,
            "due_bucket": bucket,
            "days_overdue": days_overdue,
            "days_until_due": days_until_due,
            "next_due": getattr(task, "next_due", None),
            "last_done_at": task.last_done_at,
            "last_done_by": task.last_done_by,
            "schedule_id": task.schedule_id,
            "is_ephemeral": task.is_ephemeral,
            "reason": _care_task_reason(task, bucket, language),
        }
    )


async def _fetch_care_tasks_packet(db, household_id: int, language: str) -> dict[str, list[dict[str, Any]]]:
    rows = await fetch_household_schedule_rows(db, household_id)
    overdue, due_today, upcoming = classify_care_tasks(rows)
    return {
        "overdue": [_care_task_to_context(task, "overdue", language) for task in overdue],
        "due_today": [_care_task_to_context(task, "due_today", language) for task in due_today],
        "upcoming_7_days": [
            _care_task_to_context(task, "upcoming_7_days", language)
            for task in upcoming
        ],
    }


def _care_tasks_response_guidance(care_tasks: dict[str, list[dict[str, Any]]], language: str) -> str:
    has_tasks = any(care_tasks.get(bucket) for bucket in ("overdue", "due_today", "upcoming_7_days"))
    if language == "en":
        if has_tasks:
            return (
                "For daily-care questions, answer from garden_context.care_tasks. "
                "Prioritize urgent active_warnings before routine care tasks, then "
                "care_tasks.overdue before due_today before upcoming_7_days. "
                "You may summarize multiple tasks, but end with exactly one prioritized next action."
            )
        return (
            "For daily-care questions, garden_context.care_tasks is empty. Do not invent tasks; "
            "say nothing is due in Floreren and suggest a quick soil/leaves check if useful."
        )

    if has_tasks:
        return (
            "Gebruik bij dagelijkse verzorgingsvragen garden_context.care_tasks. "
            "Geef urgente active_warnings voorrang boven routine-taken, daarna "
            "care_tasks.overdue vóór due_today vóór upcoming_7_days. "
            "Je mag meerdere taken samenvatten, maar eindig met precies één geprioriteerde volgende actie."
        )
    return (
        "Bij dagelijkse verzorgingsvragen is garden_context.care_tasks leeg. Verzin geen verzorgingstaken; "
        "zeg dat er niets gepland staat in Floreren en stel eventueel een snelle check van potgrond/bladeren voor."
    )


async def _fetch_user_language(
    db,
    household_id: int,
    *,
    active_user_id: int | None = None,
    requested_language: str | None = None,
) -> str:
    """Resolve Stekkie's response language from explicit request or users.language."""
    if requested_language in ("nl", "en"):
        return requested_language

    if active_user_id is not None:
        rows = await db.execute_fetchall(
            "SELECT language FROM users WHERE id = ? AND household_id = ?",
            (active_user_id, household_id),
        )
        if rows and rows[0].get("language") in ("nl", "en"):
            return rows[0]["language"]

    rows = await db.execute_fetchall(
        "SELECT language FROM users WHERE household_id = ? ORDER BY id LIMIT 1",
        (household_id,),
    )
    if rows and rows[0].get("language") in ("nl", "en"):
        return rows[0]["language"]
    return "nl"


async def _fetch_maps_packet(db, household_id: int) -> tuple[list[dict[str, Any]], str]:
    """Fetch all maps for the household + plant counts per map."""
    rows = await db.execute_fetchall(
        """SELECT m.id, m.name, m.slug, m.map_type,
                  COUNT(p.id) as plant_count
           FROM maps m
           LEFT JOIN plants p ON p.map_id = m.id AND p.is_active = 1
           WHERE m.household_id = ?
           GROUP BY m.id
           ORDER BY m.sort_order""",
        (household_id,),
    )
    if not rows:
        return [], ""

    maps: list[dict[str, Any]] = []
    parts = []
    total_plants = 0
    for r in rows:
        plant_count = int(r["plant_count"] or 0)
        total_plants += plant_count
        map_type = "tuin" if r["map_type"] == "outdoor" else "binnen"
        parts.append(f"  - {r['name']} ({map_type}): {plant_count} planten")
        maps.append(
            {
                "id": r["id"],
                "name": r["name"],
                "slug": r.get("slug"),
                "type": r["map_type"],
                "plant_count": plant_count,
            }
        )

    parts.append(f"\n  Totaal: {total_plants} planten over {len(rows)} kaarten")
    return maps, "Jouw kaarten:\n" + "\n".join(parts)


async def _fetch_maps_context(db, household_id: int) -> str:
    _, prose = await _fetch_maps_packet(db, household_id)
    return prose


def _format_plant_row(p: dict, care_by_plant: dict) -> str:
    details = [p["name"]]
    species_parts = []
    if p.get("common_name_nl"):
        species_parts.append(p["common_name_nl"])
    if p.get("latin_name"):
        species_parts.append(p["latin_name"])
    if species_parts:
        details.append(f"({', '.join(species_parts)})")
    if p.get("location_name"):
        details.append(f"@ {p['location_name']}")
    if p.get("sun_requirement"):
        details.append(p["sun_requirement"].replace("_", " "))
    if p.get("plant_type"):
        details.append(p["plant_type"])
    if p.get("phase") and p["phase"] != "established":
        details.append(p["phase"])
    tasks = care_by_plant.get(p["id"], [])
    if tasks:
        upcoming = [f"{c['care_type']} due {c['next_due']}" for c in tasks[:2]]
        details.append(" | next: " + ", ".join(upcoming))
    return "  - " + ", ".join(details)


async def _fetch_plants_packet(
    db,
    household_id: int,
    *,
    map_slug: str | None = None,
    plant_id: int | None = None,
    selected_plant_id: int | None = None,
    weather: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], str, dict[str, Any]]:
    """Fetch active plants as bounded structured context plus legacy prose."""
    focused_plant_id = selected_plant_id if selected_plant_id is not None else plant_id
    rows = await db.execute_fetchall(
        """SELECT p.id, p.name, p.species, p.sun_requirement, p.plant_type, p.phase,
                  p.container_id, p.ground_zone_id, p.care_thresholds, p.care_profile,
                  l.name as location_name,
                  s.common_name_nl, s.common_name_en, s.latin_name,
                  m.slug as map_slug, m.name as map_name, m.map_type
           FROM plants p
           LEFT JOIN locations l ON p.location_id = l.id
           LEFT JOIN plant_species s ON p.species_id = s.id
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.is_active = 1 AND p.household_id = ?
           ORDER BY p.name""",
        (household_id,),
    )
    if not rows:
        return [], "", _without_none(
            {
                "total_plants": 0,
                "included_plants": 0,
                "truncated": False,
                "current_map_only": False,
                "focused_plant_id": focused_plant_id,
                "focused_map_slug": map_slug,
            }
        )

    plant_ids = [r["id"] for r in rows]
    care_rows = await db.execute_fetchall(
        f"""SELECT cs.plant_id, cs.care_type, cs.next_due, cs.last_done
            FROM care_schedules cs
            WHERE cs.plant_id IN ({','.join('?' for _ in plant_ids)})
              AND cs.is_active = 1
            ORDER BY cs.next_due ASC""",
        plant_ids,
    )
    care_by_plant: dict[int, list[dict]] = {}
    for c in care_rows:
        care_by_plant.setdefault(c["plant_id"], []).append(dict(c))

    all_plants = [dict(r) for r in rows]
    focused: list[dict] = []
    current_map_plants: list[dict] = []
    rest: list[dict] = []
    for plant in all_plants:
        if focused_plant_id is not None and plant["id"] == focused_plant_id:
            focused.append(plant)
        elif map_slug is not None and plant.get("map_slug") == map_slug:
            current_map_plants.append(plant)
        else:
            rest.append(plant)

    focus_group = focused + current_map_plants
    ordered = (focus_group + rest)[:MAX_CONTEXT_PLANTS]
    ordered_ids = {p["id"] for p in ordered}
    context_plants: list[dict[str, Any]] = []
    today = date.today()
    warning_weather = {"temp": (weather or {}).get("temp")}

    for p in ordered:
        schedules = care_by_plant.get(p["id"], [])
        warning_state = compute_plant_warnings(p, schedules, weather=warning_weather, today=today)
        context_plants.append(
            _json_safe(
                {
                    "id": p["id"],
                    "name": p["name"],
                    "species": p.get("species") or p.get("latin_name"),
                    "common_name_nl": p.get("common_name_nl"),
                    "common_name_en": p.get("common_name_en"),
                    "latin_name": p.get("latin_name"),
                    "environment": warning_state.environment,
                    "sun_requirement": p.get("sun_requirement"),
                    "plant_type": p.get("plant_type"),
                    "phase": p.get("phase"),
                    "location_name": p.get("location_name"),
                    "map_slug": p.get("map_slug"),
                    "map_name": p.get("map_name"),
                    "active_warnings": [_care_warning_to_context(w) for w in warning_state.warnings[:4]],
                    "care_overview": {
                        care_type: _care_status_to_context(status)
                        for care_type, status in warning_state.care_summary.items()
                    },
                }
            )
        )

    if not map_slug and focused_plant_id is None:
        parts = [_format_plant_row(dict(r), care_by_plant) for r in ordered]
        prose = "Your garden has these plants:\n" + "\n".join(parts)
    else:
        sections = []
        ordered_focus = [p for p in focus_group if p["id"] in ordered_ids]
        ordered_focus_ids = {p["id"] for p in ordered_focus}
        ordered_rest = [p for p in ordered if p["id"] not in ordered_focus_ids]
        if ordered_focus:
            label = ordered_focus[0].get("map_name") or map_slug or f"plant {focused_plant_id}"
            focal_lines = [_format_plant_row(p, care_by_plant) for p in ordered_focus]
            sections.append(f"Plants in focus ({label}):\n" + "\n".join(focal_lines))
        if ordered_rest:
            other_names = sorted({r.get("map_name") or r.get("map_slug") or "?" for r in rest})
            rest_lines = [_format_plant_row(p, care_by_plant) for p in ordered_rest]
            sections.append(
                f"Other plants (maps: {', '.join(other_names)}):\n" + "\n".join(rest_lines)
            )
        prose = "\n\n".join(sections)

    outside_current_map = [p for p in all_plants if map_slug is not None and p.get("map_slug") != map_slug]
    includes_outside_current_map = any(
        map_slug is not None and p.get("map_slug") != map_slug for p in ordered
    )
    context_summary = _without_none(
        {
            "total_plants": len(all_plants),
            "included_plants": len(ordered),
            "truncated": len(all_plants) > len(ordered),
            "current_map_only": bool(map_slug and outside_current_map and not includes_outside_current_map),
            "focused_plant_id": focused_plant_id,
            "focused_map_slug": map_slug,
        }
    )

    if context_summary["truncated"]:
        prose += f"\n\n(Context bounded to {len(ordered)} of {len(all_plants)} active plants.)"
    return context_plants, prose, context_summary


async def _fetch_plants_context(db, household_id: int, map_slug: str | None = None) -> str:
    _, prose, _ = await _fetch_plants_packet(db, household_id, map_slug=map_slug)
    return prose


_MONTH_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]


def _coverage_month_numbers(coverage: list[bool], *, covered: bool) -> list[int]:
    return [index + 1 for index, value in enumerate(coverage) if bool(value) is covered]


def _month_labels(months: list[int]) -> list[str]:
    return [_MONTH_NL[month - 1] for month in months if 1 <= month <= 12]


def _recommendation_to_context(recommendation: Any) -> dict[str, Any]:
    return _without_none(
        {
            "species_id": recommendation.species_id,
            "dutch_name": recommendation.dutch_name,
            "english_name": recommendation.english_name,
            "latin_name": recommendation.latin_name,
            "sun_preference": recommendation.sun_preference,
            "sun_fit": recommendation.sun_fit,
            "is_native": bool(recommendation.is_native)
            if recommendation.is_native is not None
            else None,
            "pollinator_value": recommendation.pollinator_value,
            "flowering_months": recommendation.flowering_months,
            "gap_months_covered": recommendation.gap_months_covered,
            "reason": recommendation.reason,
            "caveat": recommendation.caveat,
            "size_fit": getattr(recommendation, "size_fit", None),
            "alternatives": getattr(recommendation, "alternatives", None),
        }
    )



_SUN_LABELS_NL = {
    "full_sun": "volle zon",
    "partial_sun": "halfschaduw",
    "shade": "schaduw",
    "any": "zon of schaduw",
}

_LIGHT_BUCKET_LABELS_NL = {
    "full": "volle zon",
    "part": "halfschaduw",
    "bright_shade": "lichte schaduw",
    "deep_shade": "diepe schaduw",
}

_SUN_LABELS_EN = {
    "full_sun": "full sun",
    "partial_sun": "partial sun",
    "shade": "shade",
    "any": "sun or shade",
}

_LIGHT_BUCKET_LABELS_EN = {
    "full": "full sun",
    "part": "partial sun",
    "bright_shade": "bright shade",
    "deep_shade": "deep shade",
}


def _label_value(value: str | None, labels: dict[str, str]) -> str:
    if not value:
        return "unknown"
    return labels.get(value, value.replace("_", " "))


def _spot_response_guidance(
    spot_recommendations: dict[str, Any] | None,
    focused_plant_fit: dict[str, Any] | None,
    language: str,
) -> str:
    parts: list[str] = []
    if spot_recommendations and spot_recommendations.get("recommendations"):
        if language == "en":
            parts.append(
                "For selected-spot questions, use garden_context.spot_recommendations.recommendations. "
                "Pick one candidate from this deterministic list, explain the measured light_bucket/direct_sun_hours fit, "
                "mention any gap_months_covered, and end with one concrete next action. Do not invent species outside this list."
            )
        else:
            parts.append(
                "Gebruik bij vragen over de geselecteerde plek garden_context.spot_recommendations.recommendations. "
                "Kies één kandidaat uit deze deterministische lijst, leg de gemeten light_bucket/direct_sun_hours-fit uit, "
                "noem eventuele gap_months_covered, en eindig met één concrete volgende actie. Verzin geen soorten buiten deze lijst."
            )

    if focused_plant_fit:
        if language == "en":
            parts.append(
                "For questions about whether the focused plant suits this spot, use garden_context.focused_plant_fit "
                "and avoid claiming unmeasured spacing or soil facts."
            )
        else:
            parts.append(
                "Gebruik bij vragen of de gefocuste plant op deze plek past garden_context.focused_plant_fit "
                "en doe geen stellige uitspraken over niet-gemeten afstands- of bodemgegevens."
            )
    return " ".join(parts)


async def _fetch_map_for_spot(db, household_id: int, map_slug: str | None) -> dict[str, Any] | None:
    if not map_slug:
        return None
    rows = await db.execute_fetchall(
        """SELECT id, name, slug, map_type FROM maps
           WHERE household_id = ? AND slug = ?
           LIMIT 1""",
        (household_id, map_slug),
    )
    return dict(rows[0]) if rows else None


def _selected_spot_context(page_context: PageContext, map_row: dict[str, Any]) -> dict[str, Any]:
    light_bucket = page_context.light_bucket
    if not light_bucket and page_context.direct_sun_hours is not None and page_context.sky_view_factor is not None:
        light_bucket = bucket_for(page_context.direct_sun_hours, page_context.sky_view_factor)

    return _without_none(
        {
            "map_id": map_row["id"],
            "map_slug": map_row.get("slug"),
            "map_name": map_row.get("name"),
            "map_x": page_context.clicked_map_x,
            "map_y": page_context.clicked_map_y,
            "ground_zone_id": page_context.ground_zone_id,
            "ground_zone_name": page_context.ground_zone_name,
            "ground_zone_type": page_context.ground_zone_type,
            "direct_sun_hours": page_context.direct_sun_hours,
            "sky_view_factor": page_context.sky_view_factor,
            "light_bucket": light_bucket,
        }
    )


async def _fetch_spot_recommendations_packet(
    db,
    household_id: int,
    page_context: PageContext | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Selected spot + deterministic recommendations when measured light is available."""
    if page_context is None:
        return None, None

    map_row = await _fetch_map_for_spot(db, household_id, page_context.map_slug)
    if not map_row:
        return None, None

    selected_spot = _selected_spot_context(page_context, map_row)
    if map_row.get("map_type") != "outdoor":
        return selected_spot, {
            "applies_to_current_map": False,
            "reason": "current_map_is_indoor",
            "recommendations": [],
        }

    if page_context.direct_sun_hours is None or page_context.sky_view_factor is None:
        return selected_spot, None

    month = date.today().month
    base_packet = {
        "map_id": int(map_row["id"]),
        "map_slug": map_row.get("slug"),
        "map_name": map_row.get("name"),
        "month": month,
        "light_bucket": selected_spot.get("light_bucket"),
        "direct_sun_hours": page_context.direct_sun_hours,
        "sky_view_factor": page_context.sky_view_factor,
    }
    try:
        recs, gap_months = await recommend_for_spot(
            db,
            int(map_row["id"]),
            float(page_context.direct_sun_hours),
            month,
            float(page_context.sky_view_factor),
            limit=5,
        )
    except Exception:
        logger.warning("Spot recommendations unavailable for spot_id=%s", selected_spot.get("id") if isinstance(selected_spot, dict) else selected_spot)
        return selected_spot, {
            **base_packet,
            "reason": "spot_recommendations_unavailable",
            "gap_months": [],
            "recommendations": [],
        }

    return selected_spot, {
        **base_packet,
        "gap_months": gap_months,
        "recommendations": [_recommendation_to_context(r) for r in recs],
    }


async def _fetch_focused_plant_fit_packet(
    db,
    household_id: int,
    page_context: PageContext | None,
    selected_spot: dict[str, Any] | None,
    language: str,
) -> dict[str, Any] | None:
    if page_context is None or selected_spot is None:
        return None
    focused_plant_id = page_context.selected_plant_id if page_context.selected_plant_id is not None else page_context.plant_id
    if focused_plant_id is None:
        return None
    light_bucket = selected_spot.get("light_bucket")
    if not light_bucket:
        return None

    rows = await db.execute_fetchall(
        """SELECT id, name, sun_requirement
           FROM plants
           WHERE id = ? AND household_id = ? AND is_active = 1
           LIMIT 1""",
        (focused_plant_id, household_id),
    )
    if not rows:
        return None

    plant = dict(rows[0])
    sun_requirement = plant.get("sun_requirement")
    if not sun_requirement:
        return None

    grade = fit_grade(sun_requirement, light_bucket)
    fit = grade or "poor"
    if grade == "marginal":
        fit = "poor"

    if language == "en":
        sun_label = _label_value(sun_requirement, _SUN_LABELS_EN)
        bucket_label = _label_value(light_bucket, _LIGHT_BUCKET_LABELS_EN)
        reason = f"{plant['name']} needs {sun_label}, but this spot is {bucket_label}."
    else:
        sun_label = _label_value(sun_requirement, _SUN_LABELS_NL)
        bucket_label = _label_value(light_bucket, _LIGHT_BUCKET_LABELS_NL)
        reason = f"{plant['name']} heeft {sun_label} nodig, maar deze plek is {bucket_label}."

    return {
        "plant_id": int(plant["id"]),
        "plant_name": plant["name"],
        "sun_requirement": sun_requirement,
        "current_light_bucket": light_bucket,
        "fit": fit,
        "reason": reason,
    }


def _biodiversity_response_guidance(biodiversity: dict[str, Any], language: str) -> str:
    maps = biodiversity.get("maps") or []
    has_suggestions = any(m.get("suggestions") for m in maps)

    if biodiversity.get("reason") == "current_map_is_indoor":
        if language == "en":
            return (
                "The current map is indoor. Garden biodiversity scoring and plant-addition "
                "recommendations apply to outdoor garden/balcony maps, not this indoor map."
            )
        return (
            "De huidige kaart is binnen. Tuinbiodiversiteitsscores en plantaanbevelingen "
            "gelden voor buitenkaarten zoals tuin of balkon, niet voor deze binnenkaart."
        )

    if has_suggestions:
        if language == "en":
            return (
                "For biodiversity questions, use garden_context.biodiversity.maps[].suggestions. "
                "Pick one candidate from the deterministic list, mention which gap_months_covered "
                "or pollinator_gap_months it fills, mention one caveat such as sun_preference if "
                "relevant, and end with one concrete next action. Do not invent species outside this list."
            )
        return (
            "Gebruik bij biodiversiteitsvragen garden_context.biodiversity.maps[].suggestions. "
            "Kies één kandidaat uit de lijst, noem welke gap_months_covered of pollinator_gap_months "
            "hij vult, noem indien relevant één aandachtspunt zoals sun_preference, en eindig met "
            "één concrete volgende actie. Verzin geen soorten buiten deze lijst."
        )

    if maps:
        if language == "en":
            return (
                "For biodiversity questions, use garden_context.biodiversity for score and gap context. "
                "If suggestions is empty, do not invent a plant candidate; say Floreren has no deterministic "
                "recommendation for this map yet."
            )
        return (
            "Gebruik bij biodiversiteitsvragen garden_context.biodiversity voor score en bloeigaten. "
            "Als suggestions leeg is, verzin geen plantkandidaat; zeg dat Floreren nog geen deterministische "
            "aanbeveling voor deze kaart heeft."
        )

    return ""


async def _fetch_biodiversity_packet(
    db,
    household_id: int,
    map_slug: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Biodiversity score + top plant suggestions for each outdoor map."""
    if map_slug:
        current_maps = await db.execute_fetchall(
            """SELECT id, name, slug, map_type FROM maps
               WHERE household_id = ? AND slug = ?
               LIMIT 1""",
            (household_id, map_slug),
        )
        if current_maps and current_maps[0]["map_type"] != "outdoor":
            return {
                "maps": [],
                "applies_to_current_map": False,
                "reason": "current_map_is_indoor",
            }, ""

    outdoor_maps = await db.execute_fetchall(
        """SELECT id, name, slug FROM maps
           WHERE household_id = ? AND map_type = 'outdoor'
           ORDER BY sort_order""",
        (household_id,),
    )
    if not outdoor_maps:
        return {"maps": []}, ""

    if map_slug:
        outdoor_maps = [m for m in outdoor_maps if m["slug"] == map_slug]

    sections = []
    context_maps: list[dict[str, Any]] = []
    for m in outdoor_maps:
        map_id, map_name = int(m["id"]), m["name"]

        bio = await compute_for_map(db, map_id)
        covered_months = _coverage_month_numbers(bio.pollinator_coverage_months, covered=True)
        gap_months = _coverage_month_numbers(bio.pollinator_coverage_months, covered=False)
        covered_labels = _month_labels(covered_months)
        gap_labels = _month_labels(gap_months)

        suggestions_context = []
        lines = [
            f"{map_name}: score {bio.score}/100 | {bio.species_count} soorten "
            f"({bio.native_count} inheems, {bio.invasive_count} invasief)"
        ]
        if covered_labels:
            lines.append(f"  Bestuiversbloom: {', '.join(covered_labels)}")
        if gap_labels:
            lines.append(f"  Bloeigat (geen bestuivers): {', '.join(gap_labels)}")

        # Soil-pH advice (advice-only). Gives Stekkie the facts to suggest a
        # zuurmeting / lime; the worker phrases it in the user's language.
        soil = bio.soil_ph or {}
        soil_code = soil.get("advice_code")
        if soil_code == "prefers_acid":
            lines.append(
                "  Bodem-pH: veel planten zijn kalkmijdend (o.a. "
                f"{', '.join(soil.get('acid_examples') or [])}) — vermijd kalk, een zuurmeting bevestigt de pH."
            )
        elif soil_code == "prefers_alkaline":
            lines.append(
                "  Bodem-pH: veel planten zijn kalkminnend (o.a. "
                f"{', '.join(soil.get('alkaline_examples') or [])}) — een zuurmeting laat zien of bijmesten met kalk nodig is."
            )
        elif soil_code == "mixed":
            lines.append(
                "  Bodem-pH: zowel kalkmijdende als kalkminnende planten — doe een zuurmeting en groepeer per voorkeur."
            )

        # Growth-form advice (advice-only): carbon proxy + ground cover.
        gf = bio.growth_form or {}
        carbon = gf.get("carbon_level")
        if carbon == "strong":
            lines.append(f"  Koolstof: veel houtige, meerjarige beplanting ({gf.get('woody_count', 0)} soorten) — legt relatief veel koolstof vast.")
        elif carbon == "low":
            lines.append("  Koolstof: nog geen houtige beplanting — bomen/heesters leggen meer koolstof vast dan eenjarigen.")
        if gf.get("ground_cover_advice") == "add":
            lines.append("  Bodembedekking: nog geen bodembedekkers — kale grond profiteert van kruipende beplanting (minder onkruid, meer bodemleven).")

        # Circularity (kringloop) self-report — advice-only.
        circ = bio.circularity or {}
        _circ_nl = {"compost": "composteren", "mulch": "mulchen", "rainwater": "regenwater opvangen", "peat_free": "turfvrij tuinieren"}
        circ_done = [_circ_nl[k] for k in ("compost", "mulch", "rainwater", "peat_free") if circ.get(k)]
        circ_todo = [_circ_nl[k] for k in ("compost", "mulch", "rainwater", "peat_free") if not circ.get(k)]
        if circ_done or circ_todo:
            done_str = ", ".join(circ_done) if circ_done else "nog niets aangegeven"
            lines.append(f"  Kringloop ({len(circ_done)}/4): doet {done_str}." + (f" Kansen: {', '.join(circ_todo)}." if circ_todo else ""))

        try:
            suggestions, _ = await recommend_for_garden(db, map_id, limit=5)
            if suggestions:
                sugg_parts = []
                for s in suggestions:
                    label = s.dutch_name
                    if s.latin_name and s.latin_name != s.dutch_name:
                        label += f" ({s.latin_name})"
                    if s.reason:
                        label += f": {s.reason}"
                    sugg_parts.append(label)
                    suggestions_context.append(_recommendation_to_context(s))
                lines.append(f"  Plantaanbevelingen: {'; '.join(sugg_parts)}")
        except Exception:
            pass

        sections.append("\n".join(lines))
        context_maps.append(
            {
                "id": map_id,
                "name": map_name,
                "slug": m.get("slug"),
                "score": bio.score,
                "species_count": bio.species_count,
                "native_count": bio.native_count,
                "invasive_count": bio.invasive_count,
                "score_components": bio.components,
                "pollinator_covered_months": covered_months,
                "pollinator_gap_months": gap_months,
                "pollinator_covered_month_labels": covered_labels,
                "pollinator_gap_month_labels": gap_labels,
                # Backward-compatible legacy key used by the old prose worker rollout.
                "pollinator_gaps": gap_labels,
                "suggestions": suggestions_context,
                "soil_ph": bio.soil_ph,
                "growth_form": bio.growth_form,
                "circularity": bio.circularity,
            }
        )

    if not sections:
        return {"maps": []}, ""
    return {"maps": context_maps}, "Tuinbiodiversiteit:\n" + "\n\n".join(sections)


async def _fetch_biodiversity_context(db, household_id: int, map_slug: str | None = None) -> str:
    _, prose = await _fetch_biodiversity_packet(db, household_id, map_slug)
    return prose


async def _fetch_weather_packet(db) -> dict[str, Any]:
    """Fetch weather context defensively; Stekkie should still work if weather fails."""
    try:
        temp = await get_temp_data(db)
    except Exception:
        logger.warning("Weather temp data fetch failed for Stekkie context")
        temp = {"days": [], "avg_max_7day": 0.0, "assessment": "unknown"}
    try:
        rain = await get_rain_data(db)
    except Exception:
        logger.warning("Weather rain data fetch failed for Stekkie context")
        rain = {"days": [], "total_7day_mm": 0.0, "total_14day_mm": 0.0, "assessment": "unknown"}
    return {"temp": temp, "rain": rain}


def _context_scope_guidance(summary: dict[str, Any], language: str) -> str:
    """Tell Stekkie how complete the supplied context is without changing old fields."""
    included = int(summary.get("included_plants") or 0)
    total = summary.get("total_plants")
    truncated = bool(summary.get("truncated"))
    current_map_only = bool(summary.get("current_map_only"))

    if not truncated and not current_map_only:
        return ""

    if language == "en":
        parts = []
        if truncated and total is not None:
            parts.append(
                f"The supplied garden context contains {included} of {total} active plants. "
                f"For whole-garden questions, say 'I can see {included} of your {total} plants' "
                "before drawing conclusions, and avoid certainty about plants outside the packet."
            )
        if current_map_only:
            parts.append(
                "The supplied plant packet is limited to the current map; do not describe it as the complete garden."
            )
        return " ".join(parts)

    parts = []
    if truncated and total is not None:
        parts.append(
            f"De meegegeven tuincontext bevat {included} van de {total} actieve planten. "
            f"Zeg bij vragen over de hele tuin bijvoorbeeld: 'Ik zie nu {included} van je {total} planten' "
            "voordat je conclusies trekt, en doe geen stellige uitspraken over planten buiten dit pakket."
        )
    if current_map_only:
        parts.append(
            "Het plantenpakket is beperkt tot de huidige kaart; beschrijf dit niet als de volledige tuin."
        )
    return " ".join(parts)

async def _build_garden_context(
    db,
    household_id: int,
    *,
    page_context: PageContext | None,
    active_user_id: int | None,
    requested_language: str | None,
) -> tuple[dict[str, Any], str, str, str]:
    map_slug = page_context.map_slug if page_context else None
    plant_id = page_context.plant_id if page_context else None
    selected_plant_id = page_context.selected_plant_id if page_context else None
    focused_plant_id = selected_plant_id if selected_plant_id is not None else plant_id
    language = await _fetch_user_language(
        db,
        household_id,
        active_user_id=active_user_id,
        requested_language=requested_language,
    )
    weather = await _fetch_weather_packet(db)
    maps, maps_ctx = await _fetch_maps_packet(db, household_id)
    plants, plants_ctx, context_summary = await _fetch_plants_packet(
        db,
        household_id,
        map_slug=map_slug,
        plant_id=plant_id,
        selected_plant_id=selected_plant_id,
        weather=weather,
    )
    care_tasks = await _fetch_care_tasks_packet(db, household_id, language)
    biodiversity, bio_ctx = await _fetch_biodiversity_packet(db, household_id, map_slug)
    selected_spot, spot_recommendations = await _fetch_spot_recommendations_packet(
        db,
        household_id,
        page_context,
    )
    focused_plant_fit = await _fetch_focused_plant_fit_packet(
        db,
        household_id,
        page_context,
        selected_spot,
        language,
    )
    response_guidance = " ".join(
        guidance
        for guidance in (
            _context_scope_guidance(context_summary, language),
            _care_tasks_response_guidance(care_tasks, language),
            _biodiversity_response_guidance(biodiversity, language),
            _spot_response_guidance(spot_recommendations, focused_plant_fit, language),
        )
        if guidance
    )
    if response_guidance:
        plants_ctx = (
            "Context scope guidance:\n"
            f"{response_guidance}\n\n"
            f"{plants_ctx}"
        ).strip()

    garden_context = _json_safe(
        {
            "schema_version": "garden-context-v1",
            "language": language,
            "current_page": page_context.model_dump(exclude_none=True) if page_context else None,
            "context_summary": context_summary,
            "response_guidance": response_guidance or None,
            "bounds": {
                "max_plants": MAX_CONTEXT_PLANTS,
                "included_plants": len(plants),
                "total_plants": context_summary.get("total_plants"),
                "truncated": context_summary.get("truncated", False),
                "focused_plant_id": focused_plant_id,
                "focused_map_slug": map_slug,
            },
            "maps": maps,
            "plants": plants,
            "weather": weather,
            "care_tasks": care_tasks,
            "biodiversity": biodiversity,
            "selected_spot": selected_spot,
            "spot_recommendations": spot_recommendations,
            "focused_plant_fit": focused_plant_fit,
        }
    )
    return garden_context, plants_ctx, maps_ctx, bio_ctx


@router.post("/chat", response_model=ChatResponse)
async def proxy_chat(req: ChatRequest, db=Depends(db_dep), account=Depends(get_current_account)):
    """Forward chat message to Stekkie with structured bounded garden context."""
    try:
        garden_context, plants_ctx, maps_ctx, bio_ctx = await _build_garden_context(
            db,
            account["household_id"],
            page_context=req.page_context,
            active_user_id=req.active_user_id,
            requested_language=req.language,
        )

        async with httpx.AsyncClient(timeout=70.0) as client:
            bot_req = BotRequest(
                message=req.message,
                history=req.history,
                plants_context=plants_ctx,
                maps_context=maps_ctx,
                biodiversity_context=bio_ctx,
                page_context=req.page_context.model_dump() if req.page_context else None,
                garden_context=garden_context,
                language=garden_context["language"],
            )
            resp = await client.post(
                CHATBOT_URL,
                json=bot_req.model_dump(),
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            if "response" not in data:
                raise HTTPException(status_code=502, detail="Chatbot antwoord miste 'response' veld")
            suggested_action = await _validate_suggested_action(
                data.get("suggested_action"), db, account["household_id"]
            )
            return ChatResponse(response=data["response"], suggested_action=suggested_action)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Chatbot reageert niet (timeout)")
    except httpx.HTTPStatusError as e:
        # The worker responded, but with an error status. Map upstream failures
        # to gateway statuses so the frontend shows "Chatbot is offline" instead
        # of leaking raw worker errors.
        upstream = e.response.status_code
        status = 503 if upstream >= 500 else 502
        raise HTTPException(status_code=status, detail=f"Chatbot niet beschikbaar (upstream {upstream})")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Chatbot onbereikbaar: {e}")

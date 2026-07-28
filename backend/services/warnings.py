"""Unified care warning pipeline.

Single source of truth for what warnings a plant has *right now*, given its
care profile, schedules, and current weather. All UI surfaces consume the
output of `compute_plant_warnings()` — no consumer re-derives priority.
"""
from dataclasses import dataclass, field
from datetime import date
import hashlib
from typing import Literal

def _as_date(val):
    """Handle both date objects (asyncpg) and ISO strings (SQLite)."""
    if isinstance(val, date):
        return val
    return date.fromisoformat(val)


from services.care_profile import (
    environment_for_plant as _environment_for_plant,
    load_care_profile as _load_care_profile,
)

from care_types import (
    CARE_TYPES,
    Environment,
    HEATING_SEASON_END_MONTH,
    HEATING_SEASON_START_MONTH,
    SEVERITY_COLORS,
    WEATHER_COLDHEAT_COLORS,
    Severity,
    Trigger,
    priority_bucket,
    normalize_care_type,
)


CareStatus = Literal["good", "due_today", "overdue"]


@dataclass
class CareWarning:
    care_type: str
    severity: Severity
    trigger: Trigger
    days_overdue: int | None
    message_nl: str
    message_en: str
    icon: str
    color: str
    reason_nl: str | None = None
    reason_en: str | None = None
    action_nl: str | None = None
    action_en: str | None = None
    weather_metric: str | None = None
    weather_value_c: float | None = None
    forecast_date: date | None = None
    forecast_day_label_nl: str | None = None
    forecast_day_label_en: str | None = None


@dataclass
class CareTypeStatus:
    care_type: str
    status: CareStatus
    days_until_due: int | None
    last_done: date | None


@dataclass
class PlantWarningState:
    plant_id: int
    environment: Environment
    active_care_types: list[str]
    warnings: list[CareWarning] = field(default_factory=list)
    top_warning: CareWarning | None = None
    care_summary: dict[str, CareTypeStatus] = field(default_factory=dict)


def _schedule_warning_for_type(
    care_type: str, *, next_due: date, today: date
) -> CareWarning | None:
    """Build a schedule-based warning for one care type, or None if not due yet."""
    if next_due > today:
        return None

    days_overdue = (today - next_due).days
    ct_def = CARE_TYPES[care_type]
    icon = ct_def["icon"]
    label_nl = ct_def["label_nl"]
    label_en = ct_def["label_en"]

    if days_overdue >= 3:
        severity: Severity = "urgent"
        trigger: Trigger = "schedule_overdue"
        message_nl = f"{label_nl} — {days_overdue} dagen te laat"
        message_en = f"{label_en} — {days_overdue} days overdue"
    elif days_overdue >= 1:
        severity = "warning"
        trigger = "schedule_overdue"
        message_nl = f"{label_nl} — {days_overdue} dag(en) te laat"
        message_en = f"{label_en} — {days_overdue} day(s) overdue"
    else:
        severity = "warning"
        trigger = "schedule_due_today"
        message_nl = f"{label_nl} vandaag"
        message_en = f"{label_en} due today"

    return CareWarning(
        care_type=care_type,
        severity=severity,
        trigger=trigger,
        days_overdue=days_overdue,
        message_nl=message_nl,
        message_en=message_en,
        icon=icon,
        color=SEVERITY_COLORS[severity],
    )


def _format_temp(value: float | int | None) -> str:
    if value is None:
        return "?"
    return f"{value:.0f}"


def _forecast_day_label(days_until: int, *, metric: str) -> tuple[str, str]:
    """Return NL/EN rough timing labels for weather warning copy."""
    if days_until == 0:
        return ("vannacht", "tonight") if metric == "min_temp_c" else ("vandaag", "today")
    if days_until == 1:
        return "morgen", "tomorrow"
    return f"over {days_until} dagen", f"in {days_until} days"


def _temperature_reason_copy(
    *,
    metric: str,
    value: float | int,
    threshold: float | int | None,
    day_label_nl: str,
    day_label_en: str,
) -> tuple[str, str]:
    value_s = _format_temp(value)
    threshold_s = _format_temp(threshold)
    if metric == "min_temp_c":
        return (
            f"Minimum {value_s}°C verwacht {day_label_nl} (grens {threshold_s}°C).",
            f"Minimum {value_s}°C expected {day_label_en} (threshold {threshold_s}°C).",
        )
    return (
        f"Maximum {value_s}°C verwacht {day_label_nl} (grens {threshold_s}°C).",
        f"Maximum {value_s}°C expected {day_label_en} (threshold {threshold_s}°C).",
    )


FROST_ACTION_NL = "Dek gevoelige planten af of zet potten binnen of beschut."
FROST_ACTION_EN = "Cover sensitive plants or move pots inside/sheltered."
HEAT_ACTION_NL = "Geef vroeg of laat water; zet potten in de schaduw en controleer bakken eerst."
HEAT_ACTION_EN = "Water early or late; move pots to shade and check containers first."
DROUGHT_ACTION_NL = "Controleer de grond; geef extra water als de bovenlaag droog is."
DROUGHT_ACTION_EN = "Check the soil; water extra if the top layer is dry."
WATERLOG_ACTION_NL = "Controleer drainage en geef nu geen extra water."
WATERLOG_ACTION_EN = "Check drainage and do not add extra water right now."
_MANUAL_WATER_DAYS = 3


def _weather_warning(
    *,
    care_type: str,
    severity: Severity,
    message_nl: str,
    message_en: str,
    color: str,
    metric: str,
    value: float | int,
    threshold: float | int | None,
    forecast_date: date,
    days_until: int,
    action_nl: str,
    action_en: str,
) -> CareWarning:
    day_label_nl, day_label_en = _forecast_day_label(days_until, metric=metric)
    reason_nl, reason_en = _temperature_reason_copy(
        metric=metric,
        value=value,
        threshold=threshold,
        day_label_nl=day_label_nl,
        day_label_en=day_label_en,
    )
    return CareWarning(
        care_type=care_type,
        severity=severity,
        trigger="weather_event",
        days_overdue=None,
        message_nl=message_nl,
        message_en=message_en,
        icon=CARE_TYPES[care_type]["icon"],
        color=color,
        reason_nl=reason_nl,
        reason_en=reason_en,
        action_nl=action_nl,
        action_en=action_en,
        weather_metric=metric,
        weather_value_c=value,
        forecast_date=forecast_date,
        forecast_day_label_nl=day_label_nl,
        forecast_day_label_en=day_label_en,
    )


def canonical_weather_warning_id_for_fields(
    household_id: int,
    care_type: str,
    forecast_date: date,
    severity: str,
) -> str:
    """Return a stable identity for one household forecast severity tier."""
    if care_type not in {"frost_protect", "heat_protect"}:
        raise ValueError("unsupported_weather_warning_type")
    if severity not in {"warning", "urgent"}:
        raise ValueError("unsupported_weather_warning_severity")
    raw = ":".join((
        str(household_id),
        care_type,
        forecast_date.isoformat(),
        severity,
    ))
    return f"weather:{hashlib.sha256(raw.encode()).hexdigest()[:24]}"


def canonical_weather_warning_id(household_id: int, warning: CareWarning) -> str:
    if warning.forecast_date is None:
        raise ValueError("weather_warning_forecast_date_required")
    return canonical_weather_warning_id_for_fields(
        household_id,
        warning.care_type,
        warning.forecast_date,
        warning.severity,
    )


def _rain_thresholds(profile: dict) -> dict:
    """Return drought/waterlog thresholds from care_profile or legacy threshold shims."""
    water = profile.get("water") or {}
    candidates = [
        water.get("thresholds") or {},
        (profile.get("frost_protect") or {}).get("thresholds") or {},
        (profile.get("heat_protect") or {}).get("thresholds") or {},
    ]
    for thresholds in candidates:
        if thresholds.get("drought_mm_per_week") is not None or thresholds.get("waterlog_mm_per_week") is not None:
            return thresholds
    return {}


def _as_optional_date(value):
    if value is None:
        return None
    return _as_date(value)


def _rain_warnings_for_plant(
    profile: dict,
    *,
    rain_data: dict | None,
    today: date,
    last_watered: date | str | None,
    environment: str,
) -> list[CareWarning]:
    """Build outdoor water warnings from recent rainfall.

    Container plants react to the tighter 7-day total. In-ground plants use an
    effective weekly value from the 14-day total, matching the legacy alert
    behaviour: established roots can use deeper soil moisture and should not
    scream drought because one calendar week was dry after a wet fortnight.
    """
    warnings: list[CareWarning] = []
    if environment == "indoor" or not rain_data:
        return warnings

    water = profile.get("water") or {}
    if not water.get("active"):
        return warnings

    thresholds = _rain_thresholds(profile)
    drought_thresh = thresholds.get("drought_mm_per_week")
    waterlog_thresh = thresholds.get("waterlog_mm_per_week")
    if drought_thresh is None and waterlog_thresh is None:
        return warnings

    is_ground = environment == "outdoor_ground"
    if is_ground:
        raw_total = rain_data.get("total_14day_mm", rain_data.get("total_7day_mm", 0.0))
        total_mm = round((raw_total or 0.0) / 2, 1)
        metric = "rain_14day_effective_weekly_mm"
    else:
        total_mm = round(rain_data.get("total_7day_mm", 0.0) or 0.0, 1)
        metric = "rain_7day_mm"

    watered = _as_optional_date(last_watered)
    recently_watered = watered is not None and (today - watered).days < _MANUAL_WATER_DAYS

    if drought_thresh is not None and total_mm < drought_thresh and not recently_watered:
        urgent = total_mm < drought_thresh * 0.5
        severity: Severity = "urgent" if urgent else "warning"
        message_nl = (
            f"Zeer weinig regen ({total_mm}mm). Controleer of extra water nodig is."
            if urgent else
            f"Weinig regen ({total_mm}mm). Let extra op uitdroging."
        )
        message_en = (
            f"Very little rain ({total_mm}mm). Check whether extra watering is needed."
            if urgent else
            f"Low rainfall ({total_mm}mm). Watch for drying soil."
        )
        warnings.append(CareWarning(
            care_type="water",
            severity=severity,
            trigger="weather_event",
            days_overdue=None,
            message_nl=message_nl,
            message_en=message_en,
            icon=CARE_TYPES["water"]["icon"],
            color=SEVERITY_COLORS[severity],
            reason_nl=f"Regenval {total_mm}mm ligt onder de grens van {drought_thresh}mm per week.",
            reason_en=f"Rainfall {total_mm}mm is below the {drought_thresh}mm/week threshold.",
            action_nl=DROUGHT_ACTION_NL,
            action_en=DROUGHT_ACTION_EN,
            weather_metric=metric,
            weather_value_c=total_mm,
        ))

    if waterlog_thresh is not None and total_mm > waterlog_thresh:
        severity = "urgent" if total_mm > waterlog_thresh * 2 else "warning"
        message_nl = (
            f"Extreem veel regen ({total_mm}mm). Controleer drainage."
            if severity == "urgent" else
            f"Veel regen ({total_mm}mm). Let op wateroverlast."
        )
        message_en = (
            f"Extreme rainfall ({total_mm}mm). Check drainage."
            if severity == "urgent" else
            f"Heavy rainfall ({total_mm}mm). Watch for waterlogging."
        )
        warnings.append(CareWarning(
            care_type="water",
            severity=severity,
            trigger="weather_event",
            days_overdue=None,
            message_nl=message_nl,
            message_en=message_en,
            icon=CARE_TYPES["water"]["icon"],
            color=SEVERITY_COLORS[severity],
            reason_nl=f"Regenval {total_mm}mm ligt boven de grens van {waterlog_thresh}mm per week.",
            reason_en=f"Rainfall {total_mm}mm is above the {waterlog_thresh}mm/week threshold.",
            action_nl=WATERLOG_ACTION_NL,
            action_en=WATERLOG_ACTION_EN,
            weather_metric=metric,
            weather_value_c=total_mm,
        ))

    return warnings


def _weather_warnings_for_plant(
    profile: dict, *, temp_data: dict | None, today: date, environment: str = "outdoor_container"
) -> list[CareWarning]:
    """Build weather-triggered warnings given profile + temp forecast data.

    Uses forecast-aware timing: finds the closest future day triggering a

    "Morgen vorst — min -2°C", "Over 3 dagen vorst — min -2°C".
    If all triggering days are in the past, no warning is generated.
    """
    warnings: list[CareWarning] = []
    if not temp_data:
        return warnings

    days = temp_data.get("days") or []
    if not days:
        return warnings

    def _days_until(d: dict) -> int:
        """Return days from today. 0 = today, negative = past, positive = future."""
        return (_as_date(d["date"]) - today).days

    # ── Frost ──────────────────────────────────────────────────────────
    frost = profile.get("frost_protect") or {}
    # Only potted/container plants can be moved inside — skip for ground & indoor
    if frost.get("active") and environment == "outdoor_container":
        t = frost.get("thresholds") or {}
        min_temp = t.get("min_temp_c")
        bring_in = t.get("bring_inside_below_c")

        # Urgent frost: below dangerous threshold
        if min_temp is not None:
            bad_days = [d for d in days if d["min"] <= min_temp]
            future_bad = [d for d in bad_days if _days_until(d) >= 0]
            if future_bad:
                closest = min(future_bad, key=_days_until)
                du = _days_until(closest)
                val = closest["min"]
                if du == 0:
                    msg_nl = f"Vorst vannacht — min {val:.0f}°C"
                    msg_en = f"Frost tonight — min {val:.0f}°C"
                elif du == 1:
                    msg_nl = f"Morgen vorst — min {val:.0f}°C"
                    msg_en = f"Frost tomorrow — min {val:.0f}°C"
                else:
                    msg_nl = f"Over {du} dagen vorst — min {val:.0f}°C"
                    msg_en = f"Frost in {du} days — min {val:.0f}°C"
                warnings.append(_weather_warning(
                    care_type="frost_protect",
                    severity="urgent",
                    message_nl=msg_nl,
                    message_en=msg_en,
                    color=WEATHER_COLDHEAT_COLORS["frost_protect_urgent"],
                    metric="min_temp_c",
                    value=val,
                    threshold=min_temp,
                    forecast_date=_as_date(closest["date"]),
                    days_until=du,
                    action_nl=FROST_ACTION_NL,
                    action_en=FROST_ACTION_EN,
                ))

        # Warning frost: cold approaching bring_inside threshold (only if not already urgent)
        if bring_in is not None:
            filtered = [d for d in days if d["min"] <= bring_in]
            if min_temp is not None:
                filtered = [d for d in filtered if d["min"] > min_temp]
            future_bad = [d for d in filtered if _days_until(d) >= 0]
            if future_bad:
                closest = min(future_bad, key=_days_until)
                du = _days_until(closest)
                val = closest["min"]
                if du == 0:
                    msg_nl = f"Koud vannacht — min {val:.0f}°C"
                    msg_en = f"Cold tonight — min {val:.0f}°C"
                elif du == 1:
                    msg_nl = f"Morgen koud — min {val:.0f}°C"
                    msg_en = f"Cold tomorrow — min {val:.0f}°C"
                else:
                    msg_nl = f"Over {du} dagen koud — min {val:.0f}°C"
                    msg_en = f"Cold in {du} days — min {val:.0f}°C"
                warnings.append(_weather_warning(
                    care_type="frost_protect",
                    severity="warning",
                    message_nl=msg_nl,
                    message_en=msg_en,
                    color=WEATHER_COLDHEAT_COLORS["frost_protect_warning"],
                    metric="min_temp_c",
                    value=val,
                    threshold=bring_in,
                    forecast_date=_as_date(closest["date"]),
                    days_until=du,
                    action_nl=FROST_ACTION_NL,
                    action_en=FROST_ACTION_EN,
                ))

    # ── Heat ───────────────────────────────────────────────────────────
    heat = profile.get("heat_protect") or {}
    if heat.get("active"):
        t = heat.get("thresholds") or {}
        max_temp = t.get("max_temp_c")

        if max_temp is not None:
            # Urgent: >= max_temp
            bad_days = [d for d in days if d["max"] >= max_temp]
            future_bad = [d for d in bad_days if _days_until(d) >= 0]
            if future_bad:
                closest = min(future_bad, key=_days_until)
                du = _days_until(closest)
                val = closest["max"]
                if du == 0:
                    msg_nl = f"Hitte vandaag — max {val:.0f}°C"
                    msg_en = f"Heat today — max {val:.0f}°C"
                elif du == 1:
                    msg_nl = f"Morgen hitte — max {val:.0f}°C"
                    msg_en = f"Heat tomorrow — max {val:.0f}°C"
                else:
                    msg_nl = f"Over {du} dagen hitte — max {val:.0f}°C"
                    msg_en = f"Heat in {du} days — max {val:.0f}°C"
                warnings.append(_weather_warning(
                    care_type="heat_protect",
                    severity="urgent",
                    message_nl=msg_nl,
                    message_en=msg_en,
                    color=WEATHER_COLDHEAT_COLORS["heat_protect_urgent"],
                    metric="max_temp_c",
                    value=val,
                    threshold=max_temp,
                    forecast_date=_as_date(closest["date"]),
                    days_until=du,
                    action_nl=HEAT_ACTION_NL,
                    action_en=HEAT_ACTION_EN,
                ))
            else:
                # Warning: >= max_temp - 3 (approaching)
                near_days = [d for d in days if d["max"] >= max_temp - 3]
                future_near = [d for d in near_days if _days_until(d) >= 0]
                if future_near:
                    closest = min(future_near, key=_days_until)
                    du = _days_until(closest)
                    val = closest["max"]
                    if du == 0:
                        msg_nl = f"Hitte op komst vandaag — max {val:.0f}°C"
                        msg_en = f"Heat building today — max {val:.0f}°C"
                    elif du == 1:
                        msg_nl = f"Morgen hitte op komst — max {val:.0f}°C"
                        msg_en = f"Heat building tomorrow — max {val:.0f}°C"
                    else:
                        msg_nl = f"Over {du} dagen hitte op komst — max {val:.0f}°C"
                        msg_en = f"Heat building in {du} days — max {val:.0f}°C"
                    warnings.append(_weather_warning(
                        care_type="heat_protect",
                        severity="warning",
                        message_nl=msg_nl,
                        message_en=msg_en,
                        color=WEATHER_COLDHEAT_COLORS["heat_protect_warning"],
                        metric="max_temp_c",
                        value=val,
                        threshold=max_temp,
                        forecast_date=_as_date(closest["date"]),
                        days_until=du,
                        action_nl=HEAT_ACTION_NL,
                        action_en=HEAT_ACTION_EN,
                    ))

    return warnings


def _is_heating_season(today: date) -> bool:
    """True if `today` is in the NL heating season (Nov 1 – Mar 31 inclusive)."""
    m = today.month
    return m >= HEATING_SEASON_START_MONTH or m <= HEATING_SEASON_END_MONTH


# NOTE: _apply_heating_boost is exported for use by the Phase B scheduler
# that writes next_due on care_schedules. compute_plant_warnings trusts the
# stored next_due and does not re-apply the boost.
def _apply_heating_boost(profile_entry: dict, *, today: date) -> int:
    """Return the effective interval_days, accounting for heating-season boost."""
    base = profile_entry.get("interval_days")
    if base is None:
        return base
    boost = profile_entry.get("heating_season_boost", 1.0)
    if boost <= 1.0 or not _is_heating_season(today):
        return base
    return max(1, round(base / boost))


def _sort_warnings(warnings: list[CareWarning]) -> list[CareWarning]:
    """Sort by canonical priority bucket; tiebreaker = more days_overdue first, then alphabetical."""
    def key(w: CareWarning):
        bucket = priority_bucket(w.trigger, w.severity)
        # Negate days_overdue so larger overdue sorts first; None days → 0.
        days_key = -(w.days_overdue or 0)
        return (bucket, days_key, w.care_type)
    return sorted(warnings, key=key)


def compute_plant_warnings(
    plant: dict,
    schedules: list[dict],
    *,
    weather: dict | None,
    today: date,
) -> PlantWarningState:
    """Single entry point: derive a plant's canonical warning state.

    Pure function — no DB writes, no side effects.

    Args:
        plant: dict-like row from `plants` table; expected keys include
            id, map_type, container_id, ground_zone_id, care_thresholds.
        schedules: list of dict-like care_schedules rows; expected keys include
            care_type, next_due (ISO date string), last_done (optional).
        weather: dict shaped like {"temp": {"days": [{"min": x, "max": y}, ...]}, ...},
            or None if weather data is not available.
        today: the date to evaluate against (caller passes for testability).

    Returns:
        Fully-populated PlantWarningState. top_warning is None if no warnings fire.
    """
    environment = _environment_for_plant(plant)
    profile = _load_care_profile(
        plant.get("care_profile"),
        plant.get("care_thresholds"),
        environment,
    )

    active_care_types = [ct for ct, entry in profile.items() if entry.get("active")]

    # Schedule warnings
    schedule_warnings: list[CareWarning] = []
    by_type: dict[str, dict] = {
        normalize_care_type(s["care_type"]): dict(s) for s in schedules
    }
    for care_type in active_care_types:
        if care_type not in CARE_TYPES:
            continue
        # care_schedules owns next_due/interval data. care_profile only decides
        # whether this care type is active for the plant/environment; missing
        # profile interval_days must not hide a due schedule from the map.
        if CARE_TYPES[care_type].get("is_weather_triggered"):
            continue
        sched = by_type.get(care_type)
        if sched and sched.get("next_due"):
            next_due = _as_date(sched["next_due"])
            # NB: heating-season boost is honoured by the scheduler that writes next_due,
            # so we don't recompute next_due here — we trust the stored value.
            w = _schedule_warning_for_type(care_type, next_due=next_due, today=today)
            if w is not None:
                schedule_warnings.append(w)

    # Weather warnings
    weather_payload = weather or {}
    temp_data = weather_payload.get("temp")
    rain_data = weather_payload.get("rain")
    last_watered = weather_payload.get("last_watered")
    weather_warnings = _weather_warnings_for_plant(profile, temp_data=temp_data, today=today, environment=environment)
    weather_warnings.extend(_rain_warnings_for_plant(
        profile,
        rain_data=rain_data,
        today=today,
        last_watered=last_watered,
        environment=environment,
    ))

    all_warnings = _sort_warnings(schedule_warnings + weather_warnings)
    top = all_warnings[0] if all_warnings else None

    # Care summary rollup (one row per active care type)
    care_summary: dict[str, CareTypeStatus] = {}
    for care_type in active_care_types:
        sched = by_type.get(care_type)
        last_done_iso = sched.get("last_done") if sched else None
        last_done = _as_date(last_done_iso) if last_done_iso else None
        next_due_iso = sched.get("next_due") if sched else None
        if next_due_iso:
            next_due = _as_date(next_due_iso)
            days_until = (next_due - today).days
            if days_until < 0:
                status: CareStatus = "overdue"
            elif days_until == 0:
                status = "due_today"
            else:
                status = "good"
        else:
            days_until = None
            status = "good"
        # Weather-only types have no schedule, so the schedule-driven status above
        # is always "good". Reflect any live weather warning in the summary instead.
        if CARE_TYPES[care_type].get("is_weather_triggered"):
            last_done = None
            days_until = None
            weather_warning = next(
                (w for w in all_warnings if w.care_type == care_type), None
            )
            if weather_warning is not None:
                if weather_warning.severity == "urgent":
                    status = "overdue"
                elif weather_warning.severity == "warning":
                    status = "due_today"
                else:
                    status = "good"
            else:
                status = "good"

        care_summary[care_type] = CareTypeStatus(
            care_type=care_type,
            status=status,
            days_until_due=days_until,
            last_done=last_done,
        )

    return PlantWarningState(
        plant_id=plant["id"],
        environment=environment,
        active_care_types=active_care_types,
        warnings=all_warnings,
        top_warning=top,
        care_summary=care_summary,
    )

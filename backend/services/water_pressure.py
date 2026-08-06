"""Pure, explainable weather pressure for canonical Water schedules.

This module never reads or writes schedules. It can only recommend a moisture
check on or before the saved Water deadline.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal, Sequence

Environment = Literal["outdoor_container", "outdoor_ground", "indoor"]
PressureLevel = Literal["unknown", "normal", "elevated", "high"]
Exposure = Literal["sun", "partial", "shade"]

# Short horizon keeps forecast uncertainty bounded and prevents one distant wet
# day from masking soil that is dry now.
_LOOKBACK_DAYS = 2
_LOOKAHEAD_DAYS = 2

# Per-plant exposure (#800) scales outdoor drying demand. A plant in shade or
# partial shade receives less direct sun and dries more slowly than an
# identical plant in full sun. Unknown exposure is neutral (1.0) — it never
# changes the recommendation.
_EXPOSURE_MULTIPLIERS: dict[Exposure, float] = {
    "sun":     1.00,
    "partial": 0.85,
    "shade":   0.65,
}

# Containers intercept less rainfall and expose more root-zone surface. Open
# ground captures more rain while established roots buffer evaporation.
_OUTDOOR_COEFFICIENTS = {
    "outdoor_container": {
        "rain_capture": 0.55,
        "demand": 1.15,
        "high_deficit_mm": 8.0,
        # Relative humidity below this threshold counts as dry air and adds
        # flat drying demand per 10 percentage points below it.
        "humidity_threshold_pct": 50.0,
        "humidity_boost_per_10pct_mm": 0.3,
        # Soil-moisture terms exist for a uniform shape; only outdoor_ground
        # applies them (potting mix has no open-ground 0-7cm sensor reading).
        "soil_moisture_threshold_pct": 25.0,
        "soil_moisture_suppression_fraction": 0.35,
    },
    "outdoor_ground": {
        "rain_capture": 0.85,
        "demand": 0.85,
        "high_deficit_mm": 12.0,
        "humidity_threshold_pct": 50.0,
        "humidity_boost_per_10pct_mm": 0.3,
        "soil_moisture_threshold_pct": 25.0,
        "soil_moisture_suppression_fraction": 0.35,
    },
}

# Mulch keeps moisture near the roots and cuts evaporation-driven demand
# (the #441 audit flagged it as the strongest evaporation reducer for outdoor
# plants). Containers benefit a little too: a top layer still shields the
# potting mix from direct sun and wind. Unknown/bare stays neutral (1.0).
_MULCH_DEMAND_FACTORS = {
    "outdoor_ground": 0.90,
    "outdoor_container": 0.95,
}


@dataclass(frozen=True)
class WeatherDay:
    date: date
    max_temp_c: float
    precipitation_mm: float
    et0_mm: float
    # None means "no reading" and is treated as neutral by the pressure engine.
    humidity_pct: float | None = None
    soil_moisture_pct: float | None = None


@dataclass(frozen=True)
class WaterPressureResult:
    level: PressureLevel
    score: float
    recommended_check_date: date
    reason_nl: str
    reason_en: str
    factors: dict[str, float | str]


def _recommendation(level: PressureLevel, *, today: date, next_due: date) -> date:
    """Return an advisory date that can never exceed the canonical deadline."""
    if next_due <= today:
        return next_due
    if level == "high":
        return today
    if level == "elevated":
        return min(next_due, today + timedelta(days=1))
    return next_due


def _level(score: float) -> PressureLevel:
    if score >= 1.0:
        return "high"
    if score >= 0.5:
        return "elevated"
    return "normal"


def _window(
    weather_days: Sequence[WeatherDay], *, today: date, next_due: date,
) -> list[WeatherDay]:
    start = today - timedelta(days=_LOOKBACK_DAYS)
    end = min(max(next_due, today), today + timedelta(days=_LOOKAHEAD_DAYS))
    return [day for day in weather_days if start <= day.date <= end]


def calculate_water_pressure(
    *,
    environment: Environment,
    today: date,
    next_due: date,
    weather_days: Sequence[WeatherDay],
    mulch: bool | None = None,
    exposure: Exposure | None = None,
) -> WaterPressureResult:
    """Calculate a bounded, read-only moisture-check recommendation.

    `mulch` is only meaningful for outdoor environments: a mulched surface
    lowers evaporation-driven demand. Unknown (None) or bare (False) is
    neutral — identical behaviour to before this factor existed.

    `exposure` is a coarse per-plant shade value ('sun' | 'partial' | 'shade')
    that scales outdoor drying demand (#800). Unknown (None) is neutral.
    """
    if next_due <= today:
        return WaterPressureResult(
            level="normal",
            score=0.0,
            recommended_check_date=next_due,
            reason_nl="Het persoonlijke Waterschema is al aan de beurt; het weer verandert die deadline niet.",
            reason_en="The personalized Water schedule is already due; weather does not change that deadline.",
            factors={"schedule_status": "due_or_overdue"},
        )

    days = _window(weather_days, today=today, next_due=next_due)
    if not days:
        return WaterPressureResult(
            level="unknown",
            score=0.0,
            recommended_check_date=next_due,
            reason_nl="Geen recente weerdata; het persoonlijke waterschema blijft ongewijzigd.",
            reason_en="No recent weather data; the personalized Water schedule stays unchanged.",
            factors={"weather_status": "missing"},
        )

    upcoming = [day for day in days if day.date >= today] or days
    average_max = sum(day.max_temp_c for day in upcoming) / len(upcoming)

    if environment == "indoor":
        # Outdoor forecast is only a proxy for indoor warmth. Its lower weight
        # deliberately avoids pretending we have an indoor temperature sensor.
        score = max(0.0, average_max - 22.0) / 6.0
        level = _level(score)
        if level == "high":
            tone_nl = "Aanhoudende warmte kan potgrond binnen sneller laten uitdrogen."
            tone_en = "Sustained warmth can dry indoor potting mix faster."
        elif level == "elevated":
            tone_nl = "Warm weer kan de uitdroging binnen iets versnellen."
            tone_en = "Warm weather may slightly accelerate indoor drying."
        else:
            tone_nl = "De temperatuur geeft geen reden voor een extra vroege vochtcontrole."
            tone_en = "Temperature does not suggest an extra early moisture check."
        return WaterPressureResult(
            level=level,
            score=round(score, 2),
            recommended_check_date=_recommendation(level, today=today, next_due=next_due),
            reason_nl=f"{tone_nl} De buitentemperatuur is hierbij een ruwe indicatie.",
            reason_en=f"{tone_en} Outdoor temperature is only a rough guide here.",
            factors={
                "average_max_c": round(average_max, 1),
                "effective_rain_mm": 0.0,
                "temperature_source": "outdoor_proxy",
            },
        )

    coefficients = _OUTDOOR_COEFFICIENTS[environment]
    raw_rain = sum(max(0.0, day.precipitation_mm) for day in days)
    effective_rain = raw_rain * float(coefficients["rain_capture"])
    et0 = sum(max(0.0, day.et0_mm) for day in days)
    heat_boost = max(0.0, average_max - 25.0) * 0.8
    mulch_demand_factor = 1.0
    if mulch and environment in _MULCH_DEMAND_FACTORS:
        mulch_demand_factor = float(_MULCH_DEMAND_FACTORS[environment])
    exposure_multiplier = float(_EXPOSURE_MULTIPLIERS.get(exposure, 1.0)) \
        if environment != "indoor" else 1.0

    # Dry air accelerates drying: average the upcoming humidity and add flat
    # demand per 10 pct below the threshold. Missing readings stay neutral.
    humidity_values = [
        day.humidity_pct for day in upcoming if day.humidity_pct is not None
    ]
    avg_humidity = (
        sum(humidity_values) / len(humidity_values) if humidity_values else None
    )
    humidity_boost = 0.0
    if avg_humidity is not None:
        humidity_threshold = float(coefficients["humidity_threshold_pct"])
        if avg_humidity < humidity_threshold:
            humidity_boost = (
                (humidity_threshold - avg_humidity) / 10.0
                * float(coefficients["humidity_boost_per_10pct_mm"])
            )

    # Wet open ground buffers drying for outdoor_ground plants only; the 0-7cm
    # reading is ground truth there, not for containers or indoor potting mix.
    soil_values = [
        day.soil_moisture_pct for day in upcoming if day.soil_moisture_pct is not None
    ]
    avg_soil_moisture = (
        sum(soil_values) / len(soil_values) if soil_values else None
    )
    soil_suppression = 0.0
    if environment == "outdoor_ground" and avg_soil_moisture is not None:
        soil_threshold = float(coefficients["soil_moisture_threshold_pct"])
        if avg_soil_moisture > soil_threshold:
            wetness = min(
                1.0, (avg_soil_moisture - soil_threshold) / 20.0
            )
            soil_suppression = wetness * float(
                coefficients["soil_moisture_suppression_fraction"]
            )

    drying_demand = (
        et0 * float(coefficients["demand"]) * mulch_demand_factor * exposure_multiplier
        + heat_boost
        + humidity_boost
    )
    deficit = max(0.0, drying_demand - effective_rain) * (1.0 - soil_suppression)
    score = deficit / float(coefficients["high_deficit_mm"])
    level = _level(score)

    if level == "high":
        if environment == "outdoor_container":
            reason_nl = "Warm en droog weer laat deze buitenpot sneller uitdrogen."
            reason_en = "Warm, dry weather is making this outdoor container dry out faster."
        else:
            reason_nl = "Warm en droog weer laat de grond rond deze plant sneller uitdrogen."
            reason_en = "Warm, dry weather is making the soil around this plant dry out faster."
    elif level == "elevated":
        reason_nl = "De grond kan iets sneller uitdrogen dan normaal."
        reason_en = "The soil may dry out a little faster than normal."
    else:
        reason_nl = "De regen compenseert de verwachte uitdroging."
        reason_en = "Rain is covering the expected drying."

    if mulch and environment in _MULCH_DEMAND_FACTORS:
        if environment == "outdoor_ground":
            reason_nl += " De mulch houdt vocht vast in de grond."
            reason_en += " The mulch keeps moisture in the soil."
        else:
            reason_nl += " De mulch in de pot houdt vocht iets langer vast."
            reason_en += " The mulch in the container holds moisture a little longer."

    if exposure == "shade":
        reason_nl += " De plant staat in de schaduw en droogt minder snel."
        reason_en += " This plant is in shade and dries more slowly."
    elif exposure == "partial":
        reason_nl += " De plant staat in halfschaduw en droogt iets minder snel."
        reason_en += " This plant is in partial shade and dries a little more slowly."

    if humidity_boost > 0.0:
        reason_nl += " Droge lucht versnelt de uitdroging."
        reason_en += " Dry air speeds up drying."
    if soil_suppression > 0.0:
        reason_nl += " Vochtige grond remt de uitdroging."
        reason_en += " Moist soil slows drying."

    return WaterPressureResult(
        level=level,
        score=round(score, 2),
        recommended_check_date=_recommendation(level, today=today, next_due=next_due),
        reason_nl=reason_nl,
        reason_en=reason_en,
        factors={
            "average_max_c": round(average_max, 1),
            "raw_rain_mm": round(raw_rain, 1),
            "rain_capture_factor": float(coefficients["rain_capture"]),
            "effective_rain_mm": round(effective_rain, 1),
            "et0_mm": round(et0, 1),
            "heat_boost_mm": round(heat_boost, 1),
            "avg_humidity_pct": round(avg_humidity, 1) if avg_humidity is not None else 0.0,
            "humidity_boost_mm": round(humidity_boost, 2),
            "avg_soil_moisture_pct": round(avg_soil_moisture, 1) if avg_soil_moisture is not None else 0.0,
            "soil_suppression_factor": round(soil_suppression, 2),
            "drying_demand_mm": round(drying_demand, 1),
            "deficit_mm": round(deficit, 1),
            "mulch": bool(mulch or False),
            "mulch_demand_factor": mulch_demand_factor,
            "exposure": exposure if exposure else "unknown",
            "exposure_multiplier": exposure_multiplier,
        },
    )

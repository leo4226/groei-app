"""Pure, explainable weather pressure for canonical Water schedules.

This module never reads or writes schedules. It can only recommend a moisture
check on or before the saved Water deadline, or report that the root zone is
probably still wet.

Two functions, deliberately asymmetric in what they may conclude:

- `calculate_water_pressure` pulls a moisture check EARLIER than the saved
  deadline when the weather is drying the soil out faster than usual.
- `assess_moisture` answers the opposite question — "is it still wet?" — for a
  plant whose deadline has arrived. It is the only thing allowed to say a due
  watering can wait.
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


# ── Still-moist assessment ───────────────────────────────────────────────────
# How far back the root-zone balance is reconstructed. Open-Meteo gives seven
# past days, and a watering older than that has long since been spent, so a
# longer window would only add days we have no readings for.
_MOISTURE_WINDOW_DAYS = 6

# Plant-available water the root zone can hold, in millimetres of rainfall
# equivalent. Read off the default watering intervals: a container is watered
# every 4 days and a summer day takes roughly 6mm out of it, open ground every
# 7 days at a slower 5mm. These are not the pressure engine's deficit
# thresholds — that number is "enough dryness to be worth a look", which is a
# far smaller quantity than a full pot.
_ROOT_ZONE_CAPACITY_MM = {
    "outdoor_container": 24.0,
    "outdoor_ground": 35.0,
}

# A due watering waits only while the root zone still holds at least one more
# day's worth of drying. Stated in days rather than as a share of capacity
# because that is the actual question — "does this need water today?" — and
# because it stays right whether the pot is small or the week is cold.
_MIN_DAYS_OF_WATER_LEFT = 1.0

# Open-Meteo's 0-7cm volumetric reading, in percent. Above this the top layer of
# open ground is wet by measurement rather than by model. Deliberately well
# above the 25% the pressure engine treats as "not dry": this one suppresses a
# warning, so it has to be the stronger claim.
_SOIL_MOISTURE_WET_PCT = 30.0

MoistureVerdict = Literal["unknown", "moist", "drying"]


@dataclass(frozen=True)
class WeatherDay:
    date: date
    max_temp_c: float
    precipitation_mm: float
    et0_mm: float
    # None means "no reading" and is treated as neutral by the pressure engine.
    humidity_pct: float | None = None
    soil_moisture_pct: float | None = None


# Unified light thresholds shared with the sun model: >= 4h full sun, 2-4h
# partial shade, < 2h shade (#811). `measured_sun_hours` is per-plant measured
# direct sun hours; missing measurement means exposure is unknown and both
# moisture functions stay neutral (#800).
def exposure_from_sun_hours(measured_sun_hours) -> Exposure | None:
    if measured_sun_hours is None:
        return None
    try:
        hours = float(measured_sun_hours)
    except (TypeError, ValueError):
        return None
    if hours >= 4.0:
        return "sun"
    if hours >= 2.0:
        return "partial"
    return "shade"


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


@dataclass(frozen=True)
class MoistureAssessment:
    """Whether a plant whose Water deadline has arrived is still wet enough.

    `verdict` is three-valued on purpose. "unknown" is not "drying": it means
    there is no evidence either way, and a warning is never suppressed on no
    evidence.
    """
    verdict: MoistureVerdict
    # Share of the modelled root-zone store still holding water, 0.0-1.0.
    store_fraction: float
    reason_nl: str
    reason_en: str
    factors: dict[str, float | str]


def _unknown_moisture(reason_nl: str, reason_en: str, **factors) -> MoistureAssessment:
    return MoistureAssessment(
        verdict="unknown",
        store_fraction=0.0,
        reason_nl=reason_nl,
        reason_en=reason_en,
        factors=factors,
    )


def _daily_demand(
    day: WeatherDay,
    *,
    coefficients: dict,
    mulch_factor: float,
    exposure_multiplier: float,
) -> float:
    """Millimetres of water this one day takes out of the root zone.

    Same terms as `calculate_water_pressure`, applied per day rather than to a
    window average, because a reservoir has to be drawn down in the order the
    weather happened: one hot day followed by rain leaves wetter soil than the
    same two days in the other order.
    """
    demand = max(0.0, day.et0_mm) * float(coefficients["demand"])
    demand *= mulch_factor * exposure_multiplier
    demand += max(0.0, day.max_temp_c - 25.0) * 0.8
    if day.humidity_pct is not None:
        threshold = float(coefficients["humidity_threshold_pct"])
        if day.humidity_pct < threshold:
            demand += (
                (threshold - day.humidity_pct) / 10.0
                * float(coefficients["humidity_boost_per_10pct_mm"])
            )
    return demand


def assess_moisture(
    *,
    environment: Environment,
    today: date,
    last_watered: date | None,
    weather_days: Sequence[WeatherDay],
    mulch: bool | None = None,
    exposure: Exposure | None = None,
) -> MoistureAssessment:
    """Decide whether the root zone is probably still wet, today.

    The model is a bounded reservoir. Watering fills it; rain tops it up at the
    environment's capture rate; each day's evapotranspiration, heat and dry air
    draw it down; it can neither go below empty nor above full, because soil
    that cannot hold more water sheds the rest.

    Everything it needs already exists: the watering date from the plant's own
    care log, and measured rainfall, evapotranspiration, humidity and — for open
    ground — a real 0-7cm soil-moisture reading from Open-Meteo. No sensor in
    the pot is involved, and the result says so: it is an estimate good enough
    to stop nagging, never good enough to promise the soil is wet.

    Returns "unknown" rather than guessing when the evidence is missing:
    indoors, where outdoor weather says nothing about a pot next to a radiator;
    and whenever the readings do not reach today.
    """
    if environment == "indoor":
        # An indoor pot's drying rate depends on the room, the radiator and the
        # pot, none of which we measure. Reading it off the outdoor forecast
        # would suppress every indoor watering warning for the whole winter.
        return _unknown_moisture(
            "Voor kamerplanten meten we de vochtigheid van de potgrond niet.",
            "For indoor plants we do not measure how wet the potting mix is.",
            environment=environment,
        )

    coefficients = _OUTDOOR_COEFFICIENTS[environment]
    window_start = today - timedelta(days=_MOISTURE_WINDOW_DAYS)
    window = sorted(
        (day for day in weather_days if window_start <= day.date <= today),
        key=lambda day: day.date,
    )
    if not window or window[-1].date != today:
        return _unknown_moisture(
            "Geen actuele weerdata; het waterschema blijft leidend.",
            "No current weather data; the watering schedule stays in charge.",
            weather_status="missing",
        )

    # Open ground has a real measurement, and a measurement outranks a model.
    soil_today = window[-1].soil_moisture_pct
    if environment == "outdoor_ground" and soil_today is not None:
        if soil_today >= _SOIL_MOISTURE_WET_PCT:
            return MoistureAssessment(
                verdict="moist",
                store_fraction=1.0,
                reason_nl=(
                    f"De bovenste grondlaag meet {soil_today:.0f}% vocht — "
                    "nat genoeg om nog niet te gieten."
                ),
                reason_en=(
                    f"The top soil layer measures {soil_today:.0f}% moisture — "
                    "wet enough to hold off watering."
                ),
                factors={
                    "source": "soil_measurement",
                    "soil_moisture_pct": round(soil_today, 1),
                    "soil_moisture_wet_pct": _SOIL_MOISTURE_WET_PCT,
                },
            )

    capacity = _ROOT_ZONE_CAPACITY_MM[environment]
    capture = float(coefficients["rain_capture"])
    mulch_factor = float(_MULCH_DEMAND_FACTORS[environment]) if mulch else 1.0
    exposure_multiplier = float(_EXPOSURE_MULTIPLIERS.get(exposure, 1.0))

    store = 0.0
    rain_mm = 0.0
    demand_mm = 0.0
    for day in window:
        # A watering on this day fills the root zone before that day's weather
        # acts on it. A watering older than the window is already spent, which
        # is why the store starts empty rather than full.
        if last_watered is not None and day.date == last_watered:
            store = capacity
        captured = max(0.0, day.precipitation_mm) * capture
        demand = _daily_demand(
            day,
            coefficients=coefficients,
            mulch_factor=mulch_factor,
            exposure_multiplier=exposure_multiplier,
        )
        rain_mm += captured
        demand_mm += demand
        store = min(capacity, max(0.0, store + captured - demand))

    fraction = store / capacity if capacity else 0.0
    # How long the remaining store lasts at the rate this week has been drying
    # the plant out. Averaged over the window rather than taken from today,
    # because one cool rainy morning is not a forecast.
    average_demand = demand_mm / len(window)
    if store <= 0.0:
        days_left = 0.0
    elif average_demand <= 0.0:
        # Nothing is pulling water out — frozen, or a week of saturated air.
        days_left = float(_MIN_DAYS_OF_WATER_LEFT)
    else:
        days_left = store / average_demand

    factors: dict[str, float | str] = {
        "source": "water_balance",
        "window_days": len(window),
        "capacity_mm": capacity,
        "store_mm": round(store, 1),
        "days_of_water_left": round(days_left, 1),
        "effective_rain_mm": round(rain_mm, 1),
        "drying_demand_mm": round(demand_mm, 1),
        "watered_in_window": "yes" if (
            last_watered is not None and last_watered >= window_start
        ) else "no",
        "mulch_demand_factor": mulch_factor,
        "exposure": exposure if exposure else "unknown",
    }
    if days_left < _MIN_DAYS_OF_WATER_LEFT:
        return MoistureAssessment(
            verdict="drying",
            store_fraction=round(fraction, 2),
            reason_nl=(
                f"Sinds de laatste beurt is er {rain_mm:.0f}mm bijgekomen en "
                f"{demand_mm:.0f}mm verdampt."
            ),
            reason_en=(
                f"Since the last watering {rain_mm:.0f}mm came in and "
                f"{demand_mm:.0f}mm evaporated."
            ),
            factors=factors,
        )

    if environment == "outdoor_container":
        reason_nl = (
            f"Er is {rain_mm:.0f}mm opgevangen tegen {demand_mm:.0f}mm verdamping — "
            "de pot is waarschijnlijk nog vochtig."
        )
        reason_en = (
            f"{rain_mm:.0f}mm came in against {demand_mm:.0f}mm of evaporation — "
            "the container is probably still moist."
        )
    else:
        reason_nl = (
            f"Er is {rain_mm:.0f}mm gevallen tegen {demand_mm:.0f}mm verdamping — "
            "de grond is waarschijnlijk nog vochtig."
        )
        reason_en = (
            f"{rain_mm:.0f}mm of rain against {demand_mm:.0f}mm of evaporation — "
            "the soil is probably still moist."
        )
    return MoistureAssessment(
        verdict="moist",
        store_fraction=round(fraction, 2),
        reason_nl=reason_nl,
        reason_en=reason_en,
        factors=factors,
    )

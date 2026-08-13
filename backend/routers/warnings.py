"""HTTP endpoint exposing the unified warning pipeline."""
import logging
logger = logging.getLogger(__name__)
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import db_dep
from auth import get_current_account
from services.warnings import (
    canonical_weather_warning_id,
    canonical_weather_warning_id_for_fields,
    compute_plant_warnings,
)
from services.weather_warning_state import (
    acknowledge_weather_warning,
    restore_weather_warning,
    weather_warning_states_for_account,
)
from services.care_profile import canonicalize_care_profile
from care_types import CARE_TYPES, normalize_care_type


class CareProfileEntryIn(BaseModel):
    active: bool | None = None
    interval_days: int | None = None
    thresholds: dict | None = None


class PatchCareProfileIn(BaseModel):
    care_types: dict[str, CareProfileEntryIn]

router = APIRouter(tags=["warnings"])


class WeatherWarningAcknowledgmentIn(BaseModel):
    care_type: str
    forecast_date: date
    severity: str


class WeatherWarningAcknowledgmentOut(BaseModel):
    warning_id: str
    care_type: str
    forecast_date: date
    severity: str
    acknowledged_at: datetime


@router.post(
    "/weather-warnings/{warning_id}/acknowledgment",
    response_model=WeatherWarningAcknowledgmentOut,
)
async def acknowledge_warning(
    warning_id: str,
    payload: WeatherWarningAcknowledgmentIn,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    try:
        expected_id = canonical_weather_warning_id_for_fields(
            account["household_id"],
            payload.care_type,
            payload.forecast_date,
            payload.severity,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if warning_id != expected_id:
        raise HTTPException(status_code=422, detail="invalid_weather_warning_id")
    return await acknowledge_weather_warning(
        db,
        account_id=account["account_id"],
        warning_id=warning_id,
        care_type=payload.care_type,
        forecast_date=payload.forecast_date,
        severity=payload.severity,
    )


@router.delete(
    "/weather-warnings/{warning_id}/acknowledgment",
    status_code=204,
)
async def restore_warning(
    warning_id: str,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    await restore_weather_warning(
        db,
        account_id=account["account_id"],
        warning_id=warning_id,
    )


class CareWarningOut(BaseModel):
    care_type: str
    severity: str
    trigger: str
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


class CareTypeStatusOut(BaseModel):
    care_type: str
    status: str
    days_until_due: int | None
    last_done: date | None


class PlantWarningStateOut(BaseModel):
    plant_id: int
    environment: str
    active_care_types: list[str]
    warnings: list[CareWarningOut]
    top_warning: CareWarningOut | None
    care_summary: dict[str, CareTypeStatusOut]


# ── Dashboard summary types ──


class CareTypeKPIOut(BaseModel):
    care_type: str
    icon: str
    label_nl: str
    label_en: str
    count: int
    urgent_count: int
    warning_count: int
    info_count: int


class BucketPlantOut(BaseModel):
    plant_id: int
    plant_name: str
    plant_icon_variant: str | None
    environment: str
    map_name: str | None
    care_type: str | None
    top_warning: CareWarningOut | None
    days_overdue: int | None
    schedule_id: int | None


class WarningBucketsOut(BaseModel):
    nu: list[BucketPlantOut]
    vandaag: list[BucketPlantOut]
    komende_week: list[BucketPlantOut]


class WeatherWarningGroupOut(CareWarningOut):
    warning_id: str
    acknowledged_at: datetime | None = None
    affected_plant_ids: list[int]
    map_names: list[str]


class WarningSummaryOut(BaseModel):
    total_plants: int
    on_schedule: int
    kpis: list[CareTypeKPIOut]
    buckets: WarningBucketsOut
    weather_warnings: list[WeatherWarningGroupOut] = Field(default_factory=list)


async def _fetch_weather_safely(db=None, household_id: int | None = None) -> dict | None:
    """Fetch cached weather data, returning a weather dict shaped for
    `compute_plant_warnings`. Degrades to None on any error so the endpoint
    keeps working when the weather cache is unavailable (e.g. tests, offline).
    """
    try:
        from services.environment import get_rain_data, get_temp_data
        from services.garden_log import get_last_garden_watered

        temp_data = await get_temp_data(db)
        rain_data = await get_rain_data(db)
        last_watered = await get_last_garden_watered(household_id) if household_id is not None else None
        if not temp_data and not rain_data and not last_watered:
            return None
        return {"temp": temp_data, "rain": rain_data, "last_watered": last_watered}
    except Exception:
        logger.warning("Weather context fetch failed for household %s", household_id)
        return None


@router.get("/plants/{plant_id}/warnings", response_model=PlantWarningStateOut)
async def get_plant_warnings(
    plant_id: int,
    today: date | None = Query(None),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    today = today or date.today()

    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.map_id, p.container_id, p.ground_zone_id, p.care_thresholds,
                  p.care_profile,
                  m.map_type
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.id = ? AND p.household_id = ? AND p.is_active = 1""",
        (plant_id, account["household_id"]),
    )
    if not plant_rows:
        raise HTTPException(status_code=404, detail="Plant not found")
    plant = dict(plant_rows[0])

    schedules_rows = await db.execute_fetchall(
        """SELECT care_type, next_due, last_done
           FROM care_schedules
           WHERE plant_id = ? AND is_active = 1""",
        (plant_id,),
    )
    schedules = [dict(r) for r in schedules_rows]

    weather = await _fetch_weather_safely(db, account["household_id"])
    state = compute_plant_warnings(plant, schedules, weather=weather, today=today)

    return PlantWarningStateOut(
        plant_id=state.plant_id,
        environment=state.environment,
        active_care_types=state.active_care_types,
        warnings=[CareWarningOut(**w.__dict__) for w in state.warnings],
        top_warning=CareWarningOut(**state.top_warning.__dict__) if state.top_warning else None,
        care_summary={k: CareTypeStatusOut(**v.__dict__) for k, v in state.care_summary.items()},
    )


@router.get("/warnings/summary", response_model=WarningSummaryOut)
async def get_warning_summary(
    env: str = Query("all", pattern="^(all|tuin|huis)$"),
    today: date | None = Query(None),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    """Aggregated dashboard summary: KPI counts per care type + bucket lists."""
    today = today or date.today()
    household_id = account["household_id"]

    try:
        return await _compute_warning_summary(
            db,
            household_id,
            account["account_id"],
            env,
            today,
        )
    except Exception as exc:
        import logging
        logger.exception(
            "warnings/summary failed for household %s", household_id
        )
        return WarningSummaryOut(
            total_plants=0, on_schedule=0, kpis=[],
            buckets=WarningBucketsOut(nu=[], vandaag=[], komende_week=[]),
        )


async def _compute_warning_summary(
    db, household_id: int, account_id: int, env: str, today: date
) -> WarningSummaryOut:
    """Inner implementation — never throws, returns empty summary on error."""
    # 1. Fetch all active plants with map info
    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.map_id, p.container_id, p.ground_zone_id,
                  p.care_thresholds, p.care_profile, p.name, p.icon_key AS icon_variant,
                  m.map_type, m.name as map_name
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.household_id = ? AND p.is_active = 1
           ORDER BY p.id""",
        (household_id,),
    )
    all_plants = [dict(r) for r in plant_rows]

    # 2. Optionally filter by environment
    if env == "tuin":
        plants = [p for p in all_plants if p.get("map_type") != "indoor"]
    elif env == "huis":
        plants = [p for p in all_plants if p.get("map_type") == "indoor"]
    else:
        plants = all_plants

    if not plants:
        return WarningSummaryOut(
            total_plants=0, on_schedule=0, kpis=[],
            buckets=WarningBucketsOut(nu=[], vandaag=[], komende_week=[]),
        )

    plant_ids = [p["id"] for p in plants]

    # 3. Fetch care schedules for all filtered plants
    placeholders = ",".join("?" * len(plant_ids))
    schedule_rows = await db.execute_fetchall(
        f"""SELECT cs.id as schedule_id, cs.plant_id, cs.care_type, cs.next_due, cs.last_done
            FROM care_schedules cs
            WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1""",
        plant_ids,
    )

    # Group schedules by plant_id
    schedules_by_plant: dict[int, list[dict]] = {}
    for r in schedule_rows:
        d = dict(r)
        schedules_by_plant.setdefault(d["plant_id"], []).append(d)

    # 4. Fetch weather once (shared across all plants)
    weather = await _fetch_weather_safely(db, household_id)
    account_weather_states = await weather_warning_states_for_account(db, account_id)

    # 5. Run compute_plant_warnings for each plant
    kpi_acc: dict[str, dict] = {}
    bucket_nu: list[BucketPlantOut] = []
    bucket_vandaag: list[BucketPlantOut] = []
    bucket_komende_week: list[BucketPlantOut] = []
    weather_groups: dict[str, dict] = {}
    total_plants = len(plants)
    on_schedule = 0

    for plant in plants:
        pid = plant["id"]
        schedules = schedules_by_plant.get(pid, [])
        state = compute_plant_warnings(plant, schedules, weather=weather, today=today)

        care_warnings = []
        for warning in state.warnings:
            is_grouped_weather = (
                warning.care_type in {"frost_protect", "heat_protect"}
                and warning.forecast_date is not None
            )
            if not is_grouped_weather:
                care_warnings.append(warning)
                continue

            warning_id = canonical_weather_warning_id(household_id, warning)
            if warning_id not in weather_groups:
                projected = CareWarningOut(**warning.__dict__).model_dump()
                account_state = account_weather_states.get(warning_id, {})
                weather_groups[warning_id] = {
                    **projected,
                    "warning_id": warning_id,
                    "acknowledged_at": account_state.get("acknowledged_at"),
                    "affected_plant_ids": set(),
                    "map_names": set(),
                }
            weather_groups[warning_id]["affected_plant_ids"].add(pid)
            if plant.get("map_name"):
                weather_groups[warning_id]["map_names"].add(plant["map_name"])

        has_overdue = any(w.severity in ("urgent", "warning") for w in care_warnings)
        if not has_overdue:
            on_schedule += 1

        for w in care_warnings:
            ct = w.care_type
            if ct not in kpi_acc:
                ct_def = CARE_TYPES.get(ct, {})
                kpi_acc[ct] = {
                    "care_type": ct,
                    "icon": ct_def.get("icon", "?"),
                    "label_nl": ct_def.get("label_nl", ct),
                    "label_en": ct_def.get("label_en", ct),
                    "count": 0,
                    "urgent_count": 0,
                    "warning_count": 0,
                    "info_count": 0,
                }
            kpi_acc[ct]["count"] += 1
            if w.severity == "urgent":
                kpi_acc[ct]["urgent_count"] += 1
            elif w.severity == "warning":
                kpi_acc[ct]["warning_count"] += 1
            else:
                kpi_acc[ct]["info_count"] += 1

        top_care_warning = care_warnings[0] if care_warnings else None
        if top_care_warning is not None:
            matching_sched = next(
                (s for s in schedules if s["care_type"] == top_care_warning.care_type), None
            )
            bp = BucketPlantOut(
                plant_id=pid,
                plant_name=plant.get("name", ""),
                plant_icon_variant=plant.get("icon_variant"),
                environment=state.environment,
                map_name=plant.get("map_name"),
                care_type=top_care_warning.care_type,
                top_warning=CareWarningOut(**top_care_warning.__dict__),
                days_overdue=top_care_warning.days_overdue,
                schedule_id=matching_sched["schedule_id"] if matching_sched else None,
            )
            trigger = top_care_warning.trigger
            if trigger == "schedule_overdue":
                bucket_nu.append(bp)
            elif trigger == "schedule_due_today":
                bucket_vandaag.append(bp)
            elif trigger in ("weather_event", "seasonal"):
                bucket_nu.append(bp) if top_care_warning.severity != "info" else bucket_komende_week.append(bp)
            else:
                bucket_komende_week.append(bp)

        ids_in_buckets = {bp.plant_id for bp in bucket_nu} | {bp.plant_id for bp in bucket_vandaag} | {bp.plant_id for bp in bucket_komende_week}
        if pid not in ids_in_buckets:
            for ct_name, cs in state.care_summary.items():
                if cs.days_until_due is not None and 1 <= cs.days_until_due <= 7:
                    matching_sched = next((s for s in schedules if s["care_type"] == ct_name), None)
                    bucket_komende_week.append(BucketPlantOut(
                        plant_id=pid,
                        plant_name=plant.get("name", ""),
                        plant_icon_variant=plant.get("icon_variant"),
                        environment=state.environment,
                        map_name=plant.get("map_name"),
                        care_type=ct_name,
                        top_warning=None,
                        days_overdue=None,
                        schedule_id=matching_sched["schedule_id"] if matching_sched else None,
                    ))
                    break

    # Sort buckets
    def _sort_key(bp: BucketPlantOut):
        sev_order = {"urgent": 0, "warning": 1, "info": 2}
        sev = sev_order.get(bp.top_warning.severity, 3) if bp.top_warning else 3
        return (sev, -(bp.days_overdue or 0), bp.plant_name or "")

    bucket_nu.sort(key=_sort_key)
    bucket_vandaag.sort(key=_sort_key)
    bucket_komende_week.sort(key=_sort_key)

    kpi_list = sorted(
        [CareTypeKPIOut(**d) for d in kpi_acc.values()],
        key=lambda k: (-k.urgent_count, -k.count, k.care_type),
    )

    weather_warnings = []
    for group in weather_groups.values():
        group["affected_plant_ids"] = sorted(group["affected_plant_ids"])
        group["map_names"] = sorted(group["map_names"])
        weather_warnings.append(WeatherWarningGroupOut(**group))
    weather_warnings.sort(
        key=lambda warning: (
            warning.forecast_date or date.max,
            0 if warning.severity == "urgent" else 1,
            warning.care_type,
        )
    )

    return WarningSummaryOut(
        total_plants=total_plants,
        on_schedule=on_schedule,
        kpis=kpi_list,
        buckets=WarningBucketsOut(nu=bucket_nu, vandaag=bucket_vandaag, komende_week=bucket_komende_week),
        weather_warnings=weather_warnings,
    )


@router.patch("/plants/{plant_id}/care-profile")
async def patch_care_profile(
    plant_id: int,
    body: PatchCareProfileIn,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    """Partially update a plant's care_profile. Only specified care_types are merged.

    **No UI calls this.** It is the only writer of `plants.care_profile` in the
    codebase, and its frontend caller (`CareProfileSection` + `patchCareProfile`)
    was deleted in #886 as a second, competing source of truth for "is this care
    type on": `care_schedules.is_active` is what the edit form and the passport
    write, and what every care surface reads through `_schedule_warning_for_type`.

    Left in place only because removing it means removing
    `test_legacy_care_profile_patch_persists_only_canonical_keys`, which needs a
    human's `tests-intentionally-removed` label. Do not wire a UI back onto this
    without first making `sync_care_schedules` the single writer of both — today
    the column is NULL for every plant, so `load_legacy_care_profile` derives the
    active set from the environment and the schedules decide the outcome. Write
    to it and the two models can disagree: disabling a type here would not
    remove its schedule, and toggling a schedule off would not clear the profile.
    """
    plant_rows = await db.execute_fetchall(
        "SELECT care_profile FROM plants WHERE id = ? AND household_id = ? AND is_active = 1",
        (plant_id, account["household_id"]),
    )
    if not plant_rows:
        raise HTTPException(status_code=404, detail="Plant not found")

    import json
    raw = plant_rows[0]["care_profile"]
    profile = canonicalize_care_profile(json.loads(raw)) if raw else {}

    for raw_care_type, entry in body.care_types.items():
        care_type = normalize_care_type(raw_care_type)
        if care_type not in CARE_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown care_type '{raw_care_type}'. Valid: {', '.join(CARE_TYPES.keys())}",
            )
        if care_type not in profile:
            profile[care_type] = {}
        patch_dict = entry.model_dump(exclude_none=True)
        for key, val in patch_dict.items():
            if val is not None:
                profile[care_type][key] = val

    await db.execute(
        "UPDATE plants SET care_profile = ? WHERE id = ?",
        (json.dumps(profile, ensure_ascii=False), plant_id),
    )

    return {"care_profile": profile}

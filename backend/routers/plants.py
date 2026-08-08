import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import date as _date, datetime as _datetime, timedelta as _timedelta

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException, Depends

from database import db_dep
from auth import get_current_account
from models import PlantOut, PlantCreate, PlantUpdate, CareScheduleOut, CareScheduleSyncInput, PlantPositionUpdate, PlantContainerUpdate, PlantGroundZoneUpdate, BulkArchiveInput, PlacementCreate, PlacementUpdate, SecondaryMarkerOut
from routers.icons import resolve_placement_icon, match_icon_key
from routers.icon_generator import guess_category
from care_types import CARE_TYPES, is_care_type_valid_for_env, normalize_care_type
from services.care_profile import environment_for_plant
from services.scheduling import calculate_next_due
from services.plant_reader import enrich_plant_full, _compute_care_status, _coerce_dates
from services.phenology import parse_phenology
from species_service import get_or_create_species, regenerate_species_phenology
from threshold_service import generate_thresholds
from services.deferred import fire_and_forget

router = APIRouter(tags=["plants"])
logger = logging.getLogger(__name__)


async def _generate_thresholds_deferred(
    plant_id: int, species_id: int | None, name: str, species: str | None
) -> None:
    """Generate care thresholds after the create response has been sent.

    Opens its own DB connection (the request's is gone) and re-uses the same
    persistence + schedule-seeding logic the inline path used to run.
    """
    from database import get_db

    thresholds = await generate_thresholds(name, species)
    thresholds_json = json.dumps(thresholds)
    async with get_db() as db:
        await db.execute(
            "UPDATE plants SET care_thresholds = ? WHERE id = ?",
            (thresholds_json, plant_id),
        )
        if species_id:
            # Cache thresholds on species for future plants
            await db.execute(
                "UPDATE plant_species SET care_thresholds = ? WHERE id = ?",
                (thresholds_json, species_id),
            )
        await db.commit()
        await _seed_care_schedules(db, plant_id, thresholds_json)
        await db.commit()


def _species_text_changed(old: str | None, new: str | None) -> bool:
    """True when the species text names a different plant.

    Case and surrounding whitespace are noise — "rosa canina " is not a
    re-identification and must not throw away the plant's anchors.
    """
    return str(old or "").strip().casefold() != str(new or "").strip().casefold()


async def _find_species_by_name(db, name: str) -> int | None:
    """Existing species row for `name`, or None. Lookup only — never creates.

    Mirrors the lookup inside `get_or_create_species` so the rename path can
    relink instantly for a species we already know, and pay the LLM round trip
    only when the species is genuinely new.
    """
    if not str(name or "").strip():
        return None
    rows = await db.execute_fetchall(
        """SELECT id FROM plant_species
           WHERE LOWER(common_name_nl) = LOWER(?)
              OR LOWER(COALESCE(common_name_en, '')) = LOWER(?)
              OR LOWER(COALESCE(latin_name, '')) = LOWER(?)
           LIMIT 1""",
        (name, name, name),
    )
    return rows[0]["id"] if rows else None


async def _apply_species_relink(
    db, plant_id: int, old_species_id: int | None, new_species_id: int,
    photo_path: str | None = None, plant_name: str = "", species_name: str | None = None,
) -> None:
    """Point a plant at a different species and bring its derived data along.

    Renaming a plant's species used to change one text column and nothing else:
    `species_id` kept pointing at the old species, so care thresholds, the
    phenology calendar, ecology and biodiversity all still described the plant
    the user had just said it wasn't.

    Three things follow the link:
      - the cached `care_thresholds` (regenerated in the background when the
        new species has none yet, exactly as plant creation does),
      - the water routine, but only when it is still `provisional` —
        `_seed_care_schedules` never touches an interval the user set,
      - the identification anchors this plant contributed, which are labelled
        with the species the user just moved away from (#866 phase 2).
    """
    if not new_species_id or new_species_id == old_species_id:
        return

    from services.user_refs import retract_plant_anchors

    await db.execute(
        "UPDATE plants SET species_id = ? WHERE id = ?", (new_species_id, plant_id)
    )
    await db.commit()
    await retract_plant_anchors(db, plant_id, photo_path)

    cached = None
    try:
        rows = await db.execute_fetchall(
            "SELECT care_thresholds FROM plant_species WHERE id = ?", (new_species_id,)
        )
        if rows and rows[0]["care_thresholds"]:
            cached = rows[0]["care_thresholds"]
    except Exception:
        logger.warning("Threshold lookup failed for species_id=%s", new_species_id)

    if cached:
        await db.execute(
            "UPDATE plants SET care_thresholds = ? WHERE id = ?", (cached, plant_id)
        )
        await db.commit()
        await _seed_care_schedules(db, plant_id, cached)
        await db.commit()
    else:
        fire_and_forget(
            lambda: _generate_thresholds_deferred(
                plant_id, new_species_id, plant_name, species_name,
            ),
            f"care-thresholds plant={plant_id}",
        )


async def _relink_species_deferred(
    plant_id: int, old_species_id: int | None, lookup_name: str,
    photo_path: str | None, plant_name: str,
) -> None:
    """Rename to a species we don't have yet: create it, then relink.

    Deferred because `get_or_create_species` calls the LLM, and an edit-plant
    save must not wait on that (or fail when the LLM is down). The plant keeps
    its previous link for the second or two this takes.
    """
    from database import get_db
    from species_service import get_or_create_species

    async with get_db() as db:
        try:
            species_id = await get_or_create_species(db, lookup_name)
        except Exception:
            logger.warning(
                "Species relink failed for plant_id=%s name=%r", plant_id, lookup_name
            )
            return
        await _apply_species_relink(
            db, plant_id, old_species_id, species_id,
            photo_path=photo_path, plant_name=plant_name, species_name=lookup_name,
        )


async def _assert_owned_plant(db, plant_id: int, household_id: int) -> None:
    """Raise 404 unless the plant belongs to the caller's household.

    Every by-id plant endpoint must gate on this — the JWT carries the
    household_id, so a plant is only reachable when it is in the caller's
    household. Without this a user could read/modify/delete another
    household's plants by guessing integer ids (IDOR).
    """
    rows = await db.execute_fetchall(
        "SELECT id FROM plants WHERE id = ? AND household_id = ?",
        (plant_id, household_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Plant not found")


async def _seed_care_schedules(db, plant_id: int, thresholds_json: str) -> None:
    """Create or refine the initial Water schedule from species thresholds.

    Optional care advice remains available in threshold data, but never becomes
    a recurring commitment without an explicit post-create user action.
    """
    try:
        thresholds = json.loads(thresholds_json)
    except (json.JSONDecodeError, TypeError):
        return

    water_interval = thresholds.get("water_interval_days")
    if isinstance(water_interval, bool) or not isinstance(water_interval, (int, float)):
        return
    water_interval = int(water_interval)
    if water_interval < 1:
        return

    existing = await db.execute_fetchall(
        """SELECT id, next_due, last_done, season_adjust, is_active, interval_source
           FROM care_schedules
           WHERE plant_id = ? AND care_type = 'water'
           ORDER BY is_active DESC, id LIMIT 1""",
        (plant_id,),
    )
    if not existing:
        # Use ? placeholders (qm_to_pg translates these); the $1/$2 form is
        # not translated and breaks under dev SQLite.
        await db.execute(
            """INSERT INTO care_schedules
               (plant_id, care_type, interval_days, next_due, interval_source)
               VALUES (?, 'water', ?, CURRENT_DATE, 'species')""",
            (plant_id, water_interval),
        )
    else:
        row = dict(existing[0])
    if (
        existing
        and bool(row.get("is_active"))
        and row.get("interval_source") == "provisional"
    ):
        anchor = _care_schedule_anchor(row.get("last_done"))
        next_due = (
            calculate_next_due(anchor, water_interval, row.get("season_adjust"))
            if anchor is not None
            else row["next_due"]
        )
        await db.execute(
            """UPDATE care_schedules
               SET interval_days = ?, next_due = ?, interval_source = 'species'
               WHERE id = ? AND interval_source = 'provisional'""",
            (water_interval, next_due, row["id"]),
        )

    await db.commit()


@router.get("/plants", response_model=list[PlantOut])
async def list_plants(db = Depends(db_dep), account = Depends(get_current_account)):
    rows = await db.execute_fetchall("""
        SELECT p.*, l.name as location_name, l.icon as location_icon,
               s.phenology_json,
               s.common_name_nl AS species_common_name_nl,
               s.common_name_en AS species_common_name_en
        FROM plants p
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN plant_species s ON p.species_id = s.id
        WHERE p.is_active = 1 AND p.household_id = ?
        ORDER BY p.name
    """, (account["household_id"],))
    today = _date.today().isoformat()
    plants = [dict(r) for r in rows]

    plant_ids = [p["id"] for p in plants]
    if plant_ids:
        placeholders = ",".join("?" for _ in plant_ids)
        sched_rows = await db.execute_fetchall(
            f"""SELECT cs.*, u.name as last_done_by_name
                FROM care_schedules cs
                LEFT JOIN users u ON cs.last_done_by = u.id
                WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1
                ORDER BY cs.plant_id, cs.next_due ASC""",
            plant_ids,
        )
        by_plant: dict[int, list] = {}
        for row in sched_rows:
            r = dict(row)
            pid = r["plant_id"]
            by_plant.setdefault(pid, []).append(r)
    else:
        by_plant = {}

    for plant in plants:
        pid = plant["id"]
        schedules = by_plant.get(pid, [])
        plant["care_status"], _ = _compute_care_status(schedules, today)
        # Convert dates to strings for Pydantic model
        _coerce_dates(plant)
        for s in schedules:
            _coerce_dates(s)
        plant["care_schedules"] = schedules
        plant["phenology"] = parse_phenology(plant)

    return plants


@router.get("/plants/{plant_id}", response_model=PlantOut)
async def get_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute("""
        SELECT p.*, l.name as location_name, l.icon as location_icon,
               s.phenology_json,
               s.common_name_nl AS species_common_name_nl,
               s.common_name_en AS species_common_name_en
        FROM plants p
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN plant_species s ON p.species_id = s.id
        WHERE p.id = ? AND p.household_id = ? AND p.is_active = 1
    """, (plant_id, account["household_id"]))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    today = _date.today().isoformat()
    return await enrich_plant_full(db, dict(row), today)


@router.post("/plants", response_model=PlantOut)
async def create_plant(data: PlantCreate, db = Depends(db_dep), account = Depends(get_current_account)):
    quantity = max(1, int(data.quantity or 1))
    # pot_size_cm stays the canonical container size (it drives the potted/bare
    # icon variant); the form asks for a diameter, so fall back to that.
    pot_size_cm = data.pot_size_cm if data.pot_size_cm is not None else data.pot_diameter_cm
    substrate = json.dumps(data.substrate) if data.substrate else None
    cursor = await db.execute(
        """INSERT INTO plants (name, species, location_id, acquired_date, pot_size_cm, notes, map_id, map_x, map_y, sun_requirement, plant_type, icon_key, phase, sown_date, quantity, household_id,
                               form_type, pot_material, pot_diameter_cm, pot_height_cm, has_drainage, substrate, acquired_from, mulch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.name, data.species, data.location_id,
         data.acquired_date,
         pot_size_cm, data.notes,
         data.map_id, data.map_x, data.map_y, data.sun_requirement, data.plant_type, data.icon_key,
         data.phase, data.sown_date, quantity, account["household_id"],
         data.form_type, data.pot_material, data.pot_diameter_cm, data.pot_height_cm,
         data.has_drainage, substrate, data.acquired_from, data.mulch),
    )
    plant_id = cursor.lastrowid

    # Resolve the plant's environment so we can refuse care types that don't
    # apply to it (e.g. rotate/mist for outdoor plants). Newly created plants
    # are never containers, so a non-indoor map → outdoor_ground.
    env_map_type = None
    if data.map_id is not None:
        map_rows = await db.execute_fetchall(
            "SELECT map_type FROM maps WHERE id = ? AND household_id = ?",
            (data.map_id, account["household_id"]),
        )
        if map_rows:
            env_map_type = map_rows[0]["map_type"]
    environment = "indoor" if env_map_type == "indoor" else "outdoor_ground"

    # Create only an explicitly submitted Water schedule. Optional recurring
    # care is configured after creation from the Plant Passport, never silently.
    # Water defaults to today so the first interaction remains a check rather
    # than assuming the newly logged plant was already watered.
    # A separately confirmed onboarding rhythm proposal may provide next_due.
    # Skip care types that are invalid for this environment so outdoor plants
    # never auto-acquire rotate/mist (etc.) schedules.
    for sched in data.care_schedules:
        if sched.care_type != "water":
            continue
        if not is_care_type_valid_for_env(sched.care_type, environment):
            continue
        from datetime import date as _date_today
        next_due = sched.next_due or _date_today.today()
        await db.execute(
            """INSERT INTO care_schedules
               (plant_id, care_type, interval_days, season_adjust, next_due, notes,
                rhythm_opt_out, interval_source)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')""",
            (plant_id, sched.care_type, sched.interval_days,
             sched.season_adjust, next_due, sched.notes, sched.rhythm_opt_out),
        )

    await db.commit()

    # Ensure every plant gets an icon. If the client did not pick one, try a
    # server-side match; otherwise assign a category placeholder and flag the
    # plant so the admin can generate a distinctive icon later. Never fatal.
    if not data.icon_key:
        try:
            matched = await match_icon_key(db, data.name, data.species)
            if matched:
                await db.execute("UPDATE plants SET icon_key = ? WHERE id = ?", (matched, plant_id))
            else:
                cat = guess_category(data.species or "") or guess_category(data.name) or "unknown"
                await db.execute(
                    "UPDATE plants SET icon_key = ?, icon_requested = TRUE WHERE id = ?",
                    (f"placeholder_{cat}", plant_id))
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Icon assignment failed for %s: %s", data.name, exc)

    # Link or create species (non-fatal if Claude is unavailable). Prefer the
    # scientific species field when present; identify/database prefills set that
    # to the Latin name, which lets us reuse existing species rows even when the
    # user-facing name is localized or missing from the catalog.
    species_id = None
    try:
        species_lookup_name = data.species or data.name
        species_id = await get_or_create_species(db, species_lookup_name)
        await db.execute(
            "UPDATE plants SET species_id = ? WHERE id = ?",
            (species_id, plant_id),
        )
        await db.commit()
    except Exception as exc:
        logger.warning("Could not generate species data for %s: %s", data.name, exc)

    # Use cached care thresholds from species if available. If not, first make
    # a safe provisional Water routine and only then start deferred generation;
    # this ordering prevents the request/background connections racing to insert.
    defer_threshold_generation = False
    try:
        cached = None
        if species_id:
            sp_rows = await db.execute_fetchall(
                "SELECT care_thresholds FROM plant_species WHERE id = ?",
                (species_id,),
            )
            if sp_rows and sp_rows[0]["care_thresholds"]:
                cached = sp_rows[0]["care_thresholds"]

        if cached:
            await db.execute(
                "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                (cached, plant_id),
            )
            await db.commit()
            # Seeding is idempotent over all Water rows, including a routine the
            # user already disabled. Optional threshold advice is never seeded.
            await _seed_care_schedules(db, plant_id, cached)
        else:
            defer_threshold_generation = True
    except Exception as exc:
        logger.warning("Could not generate thresholds for %s: %s", data.name, exc)

    # Guarantee every plant is at least waterable. Seven days is explicitly a
    # provisional fallback, not species knowledge, and may be refined later.
    existing_water = await db.execute_fetchall(
        "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'water' AND is_active = 1",
        (plant_id,),
    )
    if not existing_water:
        await db.execute(
            """INSERT INTO care_schedules
               (plant_id, care_type, interval_days, next_due, interval_source)
               VALUES (?, 'water', ?, ?, 'provisional')""",
            (plant_id, 7, _date.today()),
        )
        await db.commit()

    if defer_threshold_generation:
        fire_and_forget(
            lambda: _generate_thresholds_deferred(
                plant_id, species_id, data.name, data.species,
            ),
            f"care-thresholds plant={plant_id}",
        )

    # Return the created plant
    return await get_plant(plant_id, db=db, account=account)


@router.post("/plants/{plant_id}/retry-species", response_model=PlantOut)
async def retry_plant_species(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    """Retry generating species data for a plant with missing/incomplete data.

    Links a species (LLM via get_or_create_species) when one isn't linked, and
    force-regenerates the species' phenology when it has no usable month
    calendar — so a plant stuck on "No species data available" can recover even
    when it already points at an incomplete species row. Also retries thresholds
    if still missing.
    """
    cursor = await db.execute(
        "SELECT id, name, species, species_id, care_thresholds, photo_path "
        "FROM plants WHERE id = ? AND household_id = ? AND is_active = 1",
        (plant_id, account["household_id"]),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")

    plant = dict(row)
    species_lookup_name = plant.get("species") or plant["name"]
    try:
        species_id = await get_or_create_species(db, species_lookup_name)
    except Exception:
        logger.exception(
            "Species lookup retry failed for plant_id=%s",
            plant_id,
        )
        raise HTTPException(status_code=503, detail="species_generation_unavailable")
    # Re-identified as a different species: the anchors this plant contributed
    # are labelled with the species the user just moved away from, so they must
    # not keep pulling future photos towards it (#866 phase 2).
    if species_id is not None and plant.get("species_id") not in (None, species_id):
        from services.user_refs import retract_plant_anchors

        await retract_plant_anchors(db, plant_id, plant.get("photo_path"))

    await db.execute(
        "UPDATE plants SET species_id = ? WHERE id = ?",
        (species_id, plant_id),
    )
    await db.commit()

    # get_or_create_species reuses an existing species row as-is, so a plant
    # linked to a species with incomplete phenology (no month calendar) would
    # otherwise stay broken. An explicit retry must surface a failed generation
    # instead of returning a misleading 200 with the same incomplete data.
    if species_id is not None:
        try:
            await regenerate_species_phenology(db, species_id, species_lookup_name)
        except Exception:
            logger.exception(
                "Species calendar retry failed for plant_id=%s species_id=%s",
                plant_id,
                species_id,
            )
            raise HTTPException(status_code=503, detail="species_generation_unavailable")

    # If thresholds are still missing, retry those too
    if not plant.get("care_thresholds"):
        try:
            thresholds = await generate_thresholds(plant["name"], plant.get("species"))
            thresholds_json = json.dumps(thresholds)
            await db.execute(
                "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                (thresholds_json, plant_id),
            )
            await db.commit()
            await _seed_care_schedules(db, plant_id, thresholds_json)
        except Exception as exc:
            logger.warning("Could not regenerate thresholds for %s: %s", plant["name"], exc)

    result = await get_plant(plant_id, db=db, account=account)
    phenology = result.get("phenology")
    if not isinstance(phenology, dict) or not phenology.get("months"):
        logger.warning(
            "Species calendar retry produced no usable months for plant_id=%s species_id=%s",
            plant_id,
            species_id,
        )
        raise HTTPException(status_code=503, detail="species_generation_unavailable")
    return result


@router.put("/plants/{plant_id}", response_model=PlantOut)
async def update_plant(plant_id: int, data: PlantUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    # Only touch fields the client actually sent. Pass values through as-is —
    # date objects MUST stay date objects: asyncpg binds them to DATE columns
    # directly and raises DataError on ISO strings (#142). create_plant binds
    # dates the same way, and the sqlite test adapter converts date objects too,
    # so this is correct on both Postgres and the test DB.
    await _assert_owned_plant(db, plant_id, account["household_id"])

    updates = dict(data.model_dump(exclude_unset=True))

    # A species rename is a re-identification, not a text edit: the plant is now
    # a different species and everything derived from species_id must follow.
    # Read the pre-update row before the write so we can compare.
    before = None
    if "species" in updates and str(updates["species"] or "").strip():
        rows = await db.execute_fetchall(
            "SELECT name, species, species_id, photo_path FROM plants WHERE id = ?",
            (plant_id,),
        )
        before = dict(rows[0]) if rows else None

    if "quantity" in updates and updates["quantity"] is not None:
        updates["quantity"] = max(1, int(updates["quantity"]))

    # substrate is a JSON array in a TEXT column — a bare list would not bind.
    if "substrate" in updates:
        updates["substrate"] = json.dumps(updates["substrate"]) if updates["substrate"] else None

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [plant_id]

    await db.execute(
        f"UPDATE plants SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        values,
    )
    await db.commit()

    if before is not None and _species_text_changed(before.get("species"), updates["species"]):
        lookup_name = str(updates["species"]).strip()
        # Known species: relink now, so the edit screen closes on correct data.
        # Unknown: defer, because creating it calls the LLM and the save must
        # neither wait for that nor fail with it.
        existing_id = await _find_species_by_name(db, lookup_name)
        if existing_id is not None:
            await _apply_species_relink(
                db, plant_id, before.get("species_id"), existing_id,
                photo_path=before.get("photo_path"),
                plant_name=before.get("name") or "",
                species_name=lookup_name,
            )
        else:
            fire_and_forget(
                lambda: _relink_species_deferred(
                    plant_id, before.get("species_id"), lookup_name,
                    before.get("photo_path"), before.get("name") or "",
                ),
                f"species-relink plant={plant_id}",
            )

    return await get_plant(plant_id, db=db, account=account)


def _care_schedule_anchor(last_done) -> _date | None:
    """Normalize Postgres/SQLite schedule history to a date for due calculation."""
    if last_done is None:
        return None
    if isinstance(last_done, _datetime):
        return last_done.date()
    if isinstance(last_done, _date):
        return last_done
    if isinstance(last_done, str):
        try:
            return _datetime.fromisoformat(last_done).date()
        except ValueError:
            try:
                return _date.fromisoformat(last_done)
            except ValueError:
                return None
    return None


def _care_schedule_lock_clause(db) -> str:
    """Lock only the plant row; the optional map side of the join may be null."""
    return " FOR UPDATE OF p" if hasattr(db, "transaction") else ""


async def _sync_care_schedules_in_transaction(
    plant_id: int,
    data: CareScheduleSyncInput,
    db,
    household_id: int,
) -> None:
    """Reconcile recurring schedules inside the caller's open transaction."""
    lock_clause = _care_schedule_lock_clause(db)
    cursor = await db.execute(
        """SELECT p.id, p.container_id, m.map_type
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.id = ? AND p.household_id = ? AND p.is_active = 1""" + lock_clause,
        (plant_id, household_id),
    )
    plant = await cursor.fetchone()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    environment = environment_for_plant(dict(plant))
    submitted: dict[str, object] = {}
    for schedule in data.schedules:
        care_type = normalize_care_type(schedule.care_type)
        care_def = CARE_TYPES.get(care_type)
        if care_type in submitted:
            raise HTTPException(status_code=422, detail=f"Duplicate care type: {care_type}")
        if schedule.interval_days < 1:
            raise HTTPException(status_code=422, detail="interval_days must be a positive integer")
        if care_def is None:
            raise HTTPException(status_code=422, detail=f"Unknown care type: {care_type}")
        if care_def.get("is_weather_triggered"):
            raise HTTPException(status_code=422, detail=f"Weather care type is automatic: {care_type}")
        if not is_care_type_valid_for_env(care_type, environment):
            raise HTTPException(
                status_code=422,
                detail=f"Care type {care_type} is not valid for {environment}",
            )
        submitted[care_type] = schedule

    rows = await db.execute_fetchall(
        """SELECT id, care_type, interval_days, season_adjust, notes,
                  next_due, last_done, is_active, is_ephemeral,
                  rhythm_opt_out, rhythm_operation_id, interval_source
           FROM care_schedules
           WHERE plant_id = ?
           ORDER BY is_active DESC, id DESC""",
        (plant_id,),
    )
    existing_by_type: dict[str, list[dict]] = {}
    for raw_row in rows:
        row = dict(raw_row)
        care_type = normalize_care_type(row["care_type"])
        if row.get("is_ephemeral") or care_type not in CARE_TYPES:
            continue
        if CARE_TYPES[care_type].get("is_weather_triggered"):
            continue
        existing_by_type.setdefault(care_type, []).append(row)

    for care_type, schedule in submitted.items():
        candidates = existing_by_type.get(care_type, [])
        row = candidates[0] if candidates else None
        if row is None:
            next_due = schedule.next_due or calculate_next_due(
                None, schedule.interval_days, schedule.season_adjust,
            )
            await db.execute(
                """INSERT INTO care_schedules
                   (plant_id, care_type, interval_days, season_adjust, next_due, notes,
                    rhythm_opt_out, is_active, interval_source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, 'manual')""",
                (plant_id, care_type, schedule.interval_days, schedule.season_adjust,
                 next_due, schedule.notes, schedule.rhythm_opt_out),
            )
            continue

        season_adjust = (
            schedule.season_adjust
            if "season_adjust" in schedule.model_fields_set
            else row.get("season_adjust")
        )
        notes = (
            schedule.notes
            if "notes" in schedule.model_fields_set
            else row.get("notes")
        )
        interval_changed = row["interval_days"] != schedule.interval_days
        reactivated = not bool(row["is_active"])
        schedule_adjust_changed = row.get("season_adjust") != season_adjust
        rhythm_opt_out = (
            schedule.rhythm_opt_out
            if "rhythm_opt_out" in schedule.model_fields_set
            else bool(row.get("rhythm_opt_out"))
        )
        rhythm_changed = bool(row.get("rhythm_opt_out")) != rhythm_opt_out
        explicit_due_changed = (
            "next_due" in schedule.model_fields_set
            and schedule.next_due is not None
            and _date.fromisoformat(str(row["next_due"])) != schedule.next_due
        )
        authority_changed = (
            interval_changed or reactivated or schedule_adjust_changed
            or rhythm_changed or explicit_due_changed
        )
        if schedule.next_due is not None and "next_due" in schedule.model_fields_set:
            next_due = schedule.next_due
        elif interval_changed or reactivated or schedule_adjust_changed:
            next_due = calculate_next_due(
                _care_schedule_anchor(row.get("last_done")),
                schedule.interval_days,
                season_adjust,
            )
        else:
            next_due = row["next_due"]
        await db.execute(
            """UPDATE care_schedules
               SET care_type = ?, interval_days = ?, season_adjust = ?, notes = ?,
                   next_due = ?, rhythm_opt_out = ?, rhythm_operation_id = ?,
                   is_active = TRUE,
                   interval_source = CASE WHEN ? THEN 'manual' ELSE interval_source END
               WHERE id = ?""",
            (care_type, schedule.interval_days, season_adjust, notes,
             next_due, rhythm_opt_out,
             None if authority_changed else row.get("rhythm_operation_id"),
             authority_changed, row["id"]),
        )
        for duplicate in candidates[1:]:
            if bool(duplicate["is_active"]):
                await db.execute(
                    """UPDATE care_schedules
                       SET is_active = FALSE, rhythm_operation_id = NULL
                       WHERE id = ?""",
                    (duplicate["id"],),
                )

    enabled_types = set(submitted)
    for care_type, existing_rows in existing_by_type.items():
        if care_type in enabled_types:
            continue
        for row in existing_rows:
            if bool(row["is_active"]):
                await db.execute(
                    """UPDATE care_schedules
                       SET is_active = FALSE, rhythm_operation_id = NULL
                       WHERE id = ?""",
                    (row["id"],),
                )


@asynccontextmanager
async def _care_schedule_transaction(db):
    """Use asyncpg transactions in production and a real SQLite transaction in tests."""
    if hasattr(db, "transaction"):
        async with db.transaction():
            yield
        return
    await db.execute("BEGIN")
    try:
        yield
    except Exception:
        logger.exception("Care schedule transaction rolled back")
        await db.rollback()
        raise
    else:
        await db.commit()


@router.put("/plants/{plant_id}/care-schedules", response_model=PlantOut)
async def sync_care_schedules(
    plant_id: int,
    data: CareScheduleSyncInput,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    """Atomically reconcile a plant's user-managed recurring care schedules."""
    async with _care_schedule_transaction(db):
        await _sync_care_schedules_in_transaction(
            plant_id, data, db, account["household_id"],
        )

    return await get_plant(plant_id, db=db, account=account)


# ── Secondary placements: one plant can sit in several spots on a map ──

async def _fetch_marker(db, placement_id: int) -> dict | None:
    cur = await db.execute(
        """SELECT pp.id, pp.plant_id, pp.map_x, pp.map_y, pp.ground_zone_id, pp.phase,
                  p.name, p.icon_key
           FROM plant_placements pp
           JOIN plants p ON p.id = pp.plant_id
           WHERE pp.id = ?""",
        (placement_id,),
    )
    row = await cur.fetchone()
    return dict(row) if row else None


async def _owned_placement(db, plant_id: int, placement_id: int, household_id: int) -> bool:
    cur = await db.execute(
        """SELECT pp.id FROM plant_placements pp
           JOIN plants p ON p.id = pp.plant_id
           WHERE pp.id = ? AND pp.plant_id = ? AND p.household_id = ?""",
        (placement_id, plant_id, household_id),
    )
    return (await cur.fetchone()) is not None


@router.post("/plants/{plant_id}/placements", response_model=SecondaryMarkerOut)
async def add_placement(plant_id: int, data: PlacementCreate, db = Depends(db_dep), account = Depends(get_current_account)):
    cur = await db.execute(
        "SELECT id, name, icon_key FROM plants WHERE id = ? AND is_active = 1 AND household_id = ?",
        (plant_id, account["household_id"]),
    )
    plant = await cur.fetchone()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    map_rows = await db.execute_fetchall(
        "SELECT id FROM maps WHERE id = ? AND household_id = ?",
        (data.map_id, account["household_id"]),
    )
    if not map_rows:
        raise HTTPException(status_code=404, detail="Map not found")

    plant = dict(plant)
    cursor = await db.execute(
        """INSERT INTO plant_placements (plant_id, map_id, map_x, map_y, ground_zone_id, phase)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (plant_id, data.map_id, data.map_x, data.map_y, data.ground_zone_id, data.phase),
    )
    await db.commit()
    return {
        "id": cursor.lastrowid, "plant_id": plant_id,
        "map_x": data.map_x, "map_y": data.map_y,
        "ground_zone_id": data.ground_zone_id, "phase": data.phase,
        "name": plant["name"], "icon_key": plant["icon_key"],
    }


@router.patch("/plants/{plant_id}/placements/{placement_id}", response_model=SecondaryMarkerOut)
async def update_placement(plant_id: int, placement_id: int, data: PlacementUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    if not await _owned_placement(db, plant_id, placement_id, account["household_id"]):
        raise HTTPException(status_code=404, detail="Placement not found")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE plant_placements SET {set_clause} WHERE id = ?",
            list(updates.values()) + [placement_id],
        )
        await db.commit()
    marker = await _fetch_marker(db, placement_id)
    if not marker:
        raise HTTPException(status_code=404, detail="Placement not found")
    return marker


@router.delete("/plants/{plant_id}/placements/{placement_id}")
async def delete_placement(plant_id: int, placement_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    if not await _owned_placement(db, plant_id, placement_id, account["household_id"]):
        raise HTTPException(status_code=404, detail="Placement not found")
    await db.execute("DELETE FROM plant_placements WHERE id = ?", (placement_id,))
    await db.commit()
    return {"ok": True}


@router.put("/plants/{plant_id}/position", response_model=PlantOut)
async def update_position(plant_id: int, data: PlantPositionUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    map_rows = await db.execute_fetchall(
        "SELECT id FROM maps WHERE id = ? AND household_id = ?",
        (data.map_id, account["household_id"]),
    )
    if not map_rows:
        raise HTTPException(status_code=404, detail="Map not found")
    cursor = await db.execute("SELECT id, icon_key, container_id, pot_size_cm FROM plants WHERE id = ? AND household_id = ? AND is_active = 1", (plant_id, account["household_id"]))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    new_icon = await resolve_placement_icon(
        db,
        row["icon_key"],
        container_id=None,
        ground_zone_id=data.ground_zone_id,
        pot_size_cm=row["pot_size_cm"],
    )
    try:
        await db.execute(
            """UPDATE plants
               SET map_id = ?, map_x = ?, map_y = ?, ground_zone_id = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.map_id, data.map_x, data.map_y, data.ground_zone_id, new_icon, plant_id),
        )
        await db.commit()
    except Exception:
        # Fallback: update position without ground_zone_id (e.g., FK constraint)
        logger.warning("ground_zone_id FK constraint failed for plant %s, falling back to position-only update", plant_id)
        await db.execute(
            """UPDATE plants
               SET map_id = ?, map_x = ?, map_y = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.map_id, data.map_x, data.map_y, new_icon, plant_id),
        )
        await db.commit()
    return await get_plant(plant_id, db=db, account=account)


@router.put("/plants/{plant_id}/container", response_model=PlantOut)
async def update_container(plant_id: int, data: PlantContainerUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    if data.container_id is not None:
        container_rows = await db.execute_fetchall(
            """SELECT o.id FROM objects o JOIN maps m ON m.id = o.map_id
               WHERE o.id = ? AND o.is_active = 1 AND m.household_id = ?""",
            (data.container_id, account["household_id"]),
        )
        if not container_rows:
            raise HTTPException(status_code=404, detail="Container not found")
    cursor = await db.execute("SELECT id, icon_key, pot_size_cm FROM plants WHERE id = ? AND household_id = ? AND is_active = 1", (plant_id, account["household_id"]))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    new_icon = await resolve_placement_icon(
        db,
        row["icon_key"],
        container_id=data.container_id,
        pot_size_cm=row["pot_size_cm"],
    )
    await db.execute(
        """UPDATE plants
           SET container_id = ?, ground_zone_id = NULL,
               icon_key = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?""",
        (data.container_id, new_icon, plant_id),
    )
    await db.commit()
    return await get_plant(plant_id, db=db, account=account)


@router.put("/plants/{plant_id}/ground-zone", response_model=PlantOut)
async def update_ground_zone(plant_id: int, data: PlantGroundZoneUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    if data.ground_zone_id is not None:
        zone_rows = await db.execute_fetchall(
            """SELECT gz.id FROM ground_zones gz JOIN maps m ON m.id = gz.map_id
               WHERE gz.id = ? AND m.household_id = ?""",
            (data.ground_zone_id, account["household_id"]),
        )
        if not zone_rows:
            raise HTTPException(status_code=404, detail="Ground zone not found")
    cursor = await db.execute("SELECT id, icon_key, pot_size_cm FROM plants WHERE id = ? AND household_id = ? AND is_active = 1", (plant_id, account["household_id"]))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    new_icon = await resolve_placement_icon(
        db,
        row["icon_key"],
        container_id=None,
        ground_zone_id=data.ground_zone_id,
        pot_size_cm=row["pot_size_cm"],
    )
    try:
        await db.execute(
            """UPDATE plants
               SET ground_zone_id = ?, map_x = ?, map_y = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.ground_zone_id, data.map_x, data.map_y, new_icon, plant_id),
        )
        await db.commit()
    except Exception:
        # Fallback: update position without ground_zone_id (e.g., FK constraint)
        logger.warning("ground_zone_id FK constraint failed for plant %s, falling back to position-only update", plant_id)
        await db.execute(
            """UPDATE plants
               SET map_x = ?, map_y = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.map_x, data.map_y, new_icon, plant_id),
        )
        await db.commit()
    return await get_plant(plant_id, db=db, account=account)


@router.post("/plants/{plant_id}/duplicate", response_model=PlantOut)
async def duplicate_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    """Duplicate a plant: copies name, species, type, watering schedules, notes, photo ref, display_radius_cm.
    Does NOT copy: position, container, care log."""
    cursor = await db.execute("""
        SELECT p.*, l.name as location_name, l.icon as location_icon
        FROM plants p
        LEFT JOIN locations l ON p.location_id = l.id
        WHERE p.id = ? AND p.household_id = ? AND p.is_active = 1
    """, (plant_id, account["household_id"]))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    src = dict(row)

    new_cursor = await db.execute(
        """INSERT INTO plants (name, species, species_id, location_id, photo_path, pot_size_cm, notes,
           map_id, display_radius_cm, sun_requirement, phase, sown_date, is_active, household_id, icon_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)""",
        (src["name"], src["species"], src.get("species_id"), src["location_id"], src["photo_path"],
         src["pot_size_cm"], src["notes"], src["map_id"], src.get("display_radius_cm"),
         src.get("sun_requirement"), src.get("phase"), src.get("sown_date"), account["household_id"],
         src.get("icon_key")),
    )
    new_id = new_cursor.lastrowid

    # Copy care schedules
    sched_rows = await db.execute_fetchall(
        "SELECT care_type, interval_days, season_adjust, notes FROM care_schedules WHERE plant_id = ? AND is_active = TRUE",
        (plant_id,),
    )
    for s in sched_rows:
        s = dict(s)
        next_due = calculate_next_due(None, s["interval_days"], s["season_adjust"])
        await db.execute(
            """INSERT INTO care_schedules (plant_id, care_type, interval_days, season_adjust, next_due, notes, is_active)
               VALUES (?, ?, ?, ?, ?, ?, TRUE)""",
            (new_id, s["care_type"], s["interval_days"], s["season_adjust"], next_due, s["notes"]),
        )

    await db.commit()
    return await get_plant(new_id, db=db, account=account)


@router.patch("/plants/{plant_id}/lock")
async def toggle_lock(plant_id: int, locked: bool, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute("SELECT id FROM plants WHERE id = ? AND household_id = ? AND is_active = 1", (plant_id, account["household_id"]))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Plant not found")
    await db.execute(
        "UPDATE plants SET is_locked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (1 if locked else 0, plant_id),
    )
    await db.commit()
    return {"ok": True, "is_locked": locked}


@router.delete("/plants/bulk-archive")
@router.post("/plants/bulk-archive")
async def bulk_archive_plants(
    body: BulkArchiveInput,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    if not body.plant_ids:
        return {"ok": True, "count": 0}
    placeholders = ",".join(["?"] * len(body.plant_ids))
    # Scope to the caller's household so a user cannot archive another
    # household's plants by passing arbitrary ids.
    cursor = await db.execute(
        f"UPDATE plants SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP "
        f"WHERE id IN ({placeholders}) AND household_id = ?",
        list(body.plant_ids) + [account["household_id"]],
    )
    await db.commit()
    count = cursor.rowcount if cursor.rowcount is not None and cursor.rowcount >= 0 else len(body.plant_ids)
    return {"ok": True, "count": count}


@router.delete("/plants/{plant_id}")
async def archive_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    await _assert_owned_plant(db, plant_id, account["household_id"])
    await db.execute(
        "UPDATE plants SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (plant_id,),
    )
    await db.commit()
    return {"ok": True}


@router.patch("/plants/{plant_id}/restore")
async def restore_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    await _assert_owned_plant(db, plant_id, account["household_id"])
    await db.execute(
        "UPDATE plants SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (plant_id,),
    )
    await db.commit()
    return {"ok": True}


@router.post("/plants/{plant_id}/photo", response_model=PlantOut)
async def upload_photo(plant_id: int, background: BackgroundTasks, file: UploadFile = File(...),
                       db = Depends(db_dep), account = Depends(get_current_account)):
    """Legacy single-photo endpoint — now creates a photo-journal entry
    (which also gains the household ownership check and thumbnail sync)."""
    from routers.plant_photos import upload_plant_photo
    # Direct call bypasses FastAPI's dependency resolution, so the Form(None)
    # defaults must be passed explicitly or Form objects leak into SQL params.
    await upload_plant_photo(plant_id, background, file=file, note=None,
                             taken_at=None, care_log_id=None, db=db, account=account)
    return await get_plant(plant_id, db=db, account=account)

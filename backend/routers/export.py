"""Household-scoped data export endpoints."""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from auth import get_current_account
from database import db_dep
from services.local_time import local_today

router = APIRouter(tags=["export"])


def _value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _row(row: Any) -> dict[str, Any]:
    return {key: _value(value) for key, value in dict(row).items()}


async def _fetch_rows(db: Any, query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    rows = await db.execute_fetchall(query, params)
    return [_row(row) for row in rows]


async def _care_log_rows(db: Any, household_id: int) -> list[dict[str, Any]]:
    return await _fetch_rows(
        db,
        """
        SELECT cl.id, cl.plant_id, p.name AS plant_name, p.species AS plant_species,
               cl.care_type, cl.done_by, u.name AS done_by_name,
               cl.done_at, cl.notes, cl.skipped
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        LEFT JOIN users u ON cl.done_by = u.id
        WHERE p.household_id = ?
        ORDER BY cl.done_at DESC, cl.id DESC
        """,
        (household_id,),
    )


@router.get("/export")
async def export_household_data(
    account=Depends(get_current_account),
    db=Depends(db_dep),
) -> dict[str, Any]:
    """Return a JSON bundle with only the caller's household data."""
    household_id = account["household_id"]
    generated_at = datetime.now(timezone.utc).isoformat()

    household_rows = await _fetch_rows(
        db,
        "SELECT id, name, created_at FROM households WHERE id = ?",
        (household_id,),
    )

    plants = await _fetch_rows(
        db,
        """
        SELECT p.id, p.name, p.species, p.location_id, l.name AS location_name,
               l.icon AS location_icon, p.photo_path, p.acquired_date,
               p.pot_size_cm, p.last_repotted, p.notes, p.phase, p.sown_date,
               p.is_active, p.is_locked, p.created_at, p.updated_at,
               p.map_id, m.name AS map_name, m.slug AS map_slug,
               p.map_x, p.map_y, p.container_id, o.name AS container_name,
               o.object_type AS container_type, o.category AS container_category,
               p.display_radius_cm, p.ground_zone_id, gz.name AS ground_zone_name,
               p.sun_requirement, p.plant_type, p.icon_key, p.species_id,
               ps.common_name_nl AS species_common_name_nl,
               ps.common_name_en AS species_common_name_en,
               ps.latin_name AS species_latin_name,
               ps.phenology_json AS species_phenology_json,
               ps.climate_zone AS species_climate_zone,
               ps.care_thresholds AS species_care_thresholds,
               ps.water_interval_days AS species_water_interval_days,
               p.care_thresholds, p.care_profile, p.household_id
        FROM plants p
        LEFT JOIN locations l ON p.location_id = l.id AND l.household_id = p.household_id
        LEFT JOIN maps m ON p.map_id = m.id AND m.household_id = p.household_id
        LEFT JOIN objects o ON p.container_id = o.id
        LEFT JOIN ground_zones gz ON p.ground_zone_id = gz.id
        LEFT JOIN plant_species ps ON p.species_id = ps.id
        WHERE p.household_id = ?
        ORDER BY p.name COLLATE NOCASE, p.id
        """,
        (household_id,),
    )

    care_schedules = await _fetch_rows(
        db,
        """
        SELECT cs.id, cs.plant_id, p.name AS plant_name, cs.care_type,
               cs.interval_days, cs.season_adjust, cs.next_due, cs.last_done,
               cs.last_done_by, u.name AS last_done_by_name, cs.notes,
               cs.is_active, cs.created_at, cs.is_ephemeral
        FROM care_schedules cs
        JOIN plants p ON cs.plant_id = p.id
        LEFT JOIN users u ON cs.last_done_by = u.id
        WHERE p.household_id = ?
        ORDER BY cs.next_due ASC, cs.id ASC
        """,
        (household_id,),
    )

    bundle = {
        "exported_at": generated_at,
        "household": household_rows[0] if household_rows else {"id": household_id},
        "account": {
            "id": account["account_id"],
            "household_id": household_id,
        },
        "accounts": await _fetch_rows(
            db,
            """
            SELECT id, household_id, email, name, avatar, created_at
            FROM accounts
            WHERE household_id = ?
            ORDER BY created_at ASC, id ASC
            """,
            (household_id,),
        ),
        "users": await _fetch_rows(
            db,
            """
            SELECT id, name, avatar, household_id, language
            FROM users
            WHERE household_id = ?
            ORDER BY name COLLATE NOCASE, id
            """,
            (household_id,),
        ),
        "locations": await _fetch_rows(
            db,
            """
            SELECT id, name, icon, sort_order, household_id
            FROM locations
            WHERE household_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (household_id,),
        ),
        "maps": await _fetch_rows(
            db,
            """
            SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order,
                   created_at, map_type, lat, lon, bearing, thumbnail_file,
                   household_id
            FROM maps
            WHERE household_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (household_id,),
        ),
        "objects": await _fetch_rows(
            db,
            """
            SELECT o.id, o.name, o.object_type, o.shape, o.diameter_cm,
                   o.width_cm, o.depth_cm, o.material, o.color, o.map_id,
                   o.map_x, o.map_y, o.rotation, o.notes, o.is_active,
                   o.created_at, o.updated_at, o.category, o.label, o.preset
            FROM objects o
            JOIN maps m ON o.map_id = m.id
            WHERE m.household_id = ?
            ORDER BY o.name COLLATE NOCASE, o.id
            """,
            (household_id,),
        ),
        "ground_zones": await _fetch_rows(
            db,
            """
            SELECT gz.id, gz.map_id, gz.name, gz.zone_type, gz.polygon,
                   gz.soil_note, gz.created_at
            FROM ground_zones gz
            JOIN maps m ON gz.map_id = m.id
            WHERE m.household_id = ?
            ORDER BY gz.name COLLATE NOCASE, gz.id
            """,
            (household_id,),
        ),
        "plants": plants,
        "care_schedules": care_schedules,
        "care_log": await _care_log_rows(db, household_id),
        "garden_water_log": await _fetch_rows(
            db,
            """
            SELECT gwl.id, gwl.watered_at, gwl.watered_by,
                   u.name AS watered_by_name, gwl.water_amount, gwl.created_at
            FROM garden_water_log gwl
            JOIN users u ON gwl.watered_by = u.id
            WHERE u.household_id = ?
            ORDER BY gwl.watered_at DESC, gwl.id DESC
            """,
            (household_id,),
        ),
        "garden_fertilize_log": await _fetch_rows(
            db,
            """
            SELECT gfl.id, gfl.fertilized_at, gfl.fertilized_by,
                   u.name AS fertilized_by_name, gfl.created_at
            FROM garden_fertilize_log gfl
            JOIN users u ON gfl.fertilized_by = u.id
            WHERE u.household_id = ?
            ORDER BY gfl.fertilized_at DESC, gfl.id DESC
            """,
            (household_id,),
        ),
        "plant_photos": await _fetch_rows(
            db,
            """
            SELECT pp.id, pp.plant_id, p.name AS plant_name, pp.household_id,
                   pp.r2_key, pp.url, pp.note, pp.taken_at, pp.care_log_id,
                   pp.bioclip_species_id, pp.bioclip_confidence,
                   pp.species_mismatch, pp.created_at
            FROM plant_photos pp
            JOIN plants p ON pp.plant_id = p.id
            WHERE pp.household_id = ? AND p.household_id = ?
            ORDER BY pp.taken_at DESC, pp.id DESC
            """,
            (household_id, household_id),
        ),
    }
    return bundle


@router.get("/export/care-log.csv")
async def export_care_log_csv(
    account=Depends(get_current_account),
    db=Depends(db_dep),
) -> Response:
    """Return care history as CSV, scoped to the caller's household."""
    rows = await _care_log_rows(db, account["household_id"])
    columns = [
        "id",
        "plant_id",
        "plant_name",
        "plant_species",
        "care_type",
        "done_by",
        "done_by_name",
        "done_at",
        "notes",
        "skipped",
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key) for key in columns})

    filename = f"floreren-care-log-{local_today().isoformat()}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

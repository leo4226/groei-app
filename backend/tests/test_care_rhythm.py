import json
from datetime import date, timedelta

import pytest
import pytest_asyncio

from services.care_rhythm import (
    align_due_date,
    apply_care_rhythm,
    build_rhythm_preview,
    propose_preferred_weekdays,
    undo_care_rhythm,
)


def _row(schedule_id: int, due: date, *, map_type: str = "outdoor") -> dict:
    return {
        "schedule_id": schedule_id,
        "next_due": due,
        "map_type": map_type,
    }


def test_water_alignment_moves_at_most_one_day_earlier_and_never_later():
    monday = date(2026, 7, 20)
    tuesday = date(2026, 7, 21)
    wednesday = date(2026, 7, 22)

    assert align_due_date(monday, [1]) == (monday, 0, "aligned")
    assert align_due_date(tuesday, [1]) == (monday, -1, "moved_earlier")
    assert align_due_date(wednesday, [1]) == (wednesday, 0, "outside_window")


def test_proposal_uses_one_day_when_adjacent_due_weekdays_can_be_combined():
    schedules = [
        _row(1, date(2026, 7, 20)),  # Monday
        _row(2, date(2026, 7, 21)),  # Tuesday -> Monday
        _row(3, date(2026, 7, 27)),  # Monday
    ]

    assert propose_preferred_weekdays(schedules) == [1]


def test_proposal_uses_two_days_when_that_reduces_actual_care_weekdays():
    schedules = [
        _row(1, date(2026, 7, 21)),  # Tuesday
        _row(2, date(2026, 7, 22)),  # Wednesday -> Tuesday
        _row(3, date(2026, 7, 24)),  # Friday
    ]

    assert propose_preferred_weekdays(schedules) == [2, 5]


def test_proposal_is_deterministic_and_empty_without_schedules():
    tied = [
        _row(1, date(2026, 7, 20)),  # Monday
        _row(2, date(2026, 7, 23)),  # Thursday
    ]

    assert propose_preferred_weekdays(tied) == [1, 4]
    assert propose_preferred_weekdays(list(reversed(tied))) == [1, 4]
    assert propose_preferred_weekdays([]) == []


def _preview_row(
    schedule_id: int,
    due: date,
    *,
    map_id: int,
    map_type: str,
    opted_out: bool = False,
) -> dict:
    return {
        "schedule_id": schedule_id,
        "plant_id": schedule_id + 100,
        "plant_name": f"Plant {schedule_id}",
        "species_common_name_nl": None,
        "species_common_name_en": None,
        "plant_icon_variant": None,
        "map_id": map_id,
        "map_name": f"Map {map_id}",
        "map_type": map_type,
        "next_due": due,
        "interval_days": 7,
        "rhythm_opt_out": opted_out,
    }


def test_preview_separates_environments_and_keeps_visible_exceptions():
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [{"map_id": 3, "weekdays": [5]}],
    }
    rows = [
        _preview_row(1, date(2026, 7, 21), map_id=1, map_type="outdoor"),
        _preview_row(2, date(2026, 7, 22), map_id=1, map_type="outdoor"),
        _preview_row(3, date(2026, 7, 23), map_id=2, map_type="indoor"),
        _preview_row(4, date(2026, 7, 24), map_id=3, map_type="outdoor"),
        _preview_row(
            5,
            date(2026, 7, 27),
            map_id=1,
            map_type="outdoor",
            opted_out=True,
        ),
        _preview_row(6, date(2026, 7, 15), map_id=1, map_type="outdoor"),
    ]

    preview = build_rhythm_preview(
        rows,
        config,
        today=date(2026, 7, 15),
        household_id=10,
    )

    by_id = {item["schedule_id"]: item for item in preview["items"]}
    assert by_id[1]["old_date"] == "2026-07-21"
    assert by_id[1]["new_date"] == "2026-07-20"
    assert by_id[1]["movement_days"] == -1
    assert by_id[1]["status"] == "moved"
    assert by_id[2]["status"] == "exception"
    assert by_id[2]["reason"] == "outside_window"
    assert by_id[3]["status"] == "unchanged"
    assert by_id[4]["status"] == "unchanged"
    assert by_id[5]["reason"] == "opted_out"
    assert by_id[6]["reason"] == "not_future"
    assert preview["summary"] == {
        "total": 6,
        "moved": 1,
        "unchanged": 2,
        "exceptions": 3,
        "group_count": 3,
    }
    assert [group["count"] for group in preview["groups"]] == [1, 1, 1]


def test_preview_hash_is_stable_and_changes_with_schedule_or_configuration():
    row = _preview_row(1, date(2026, 7, 21), map_id=1, map_type="outdoor")
    config = {
        "indoor_weekdays": [],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }

    first = build_rhythm_preview(
        [row], config, today=date(2026, 7, 15), household_id=10,
    )
    same = build_rhythm_preview(
        [dict(row)], dict(config), today=date(2026, 7, 15), household_id=10,
    )
    changed_config = build_rhythm_preview(
        [row],
        {**config, "outdoor_weekdays": [2]},
        today=date(2026, 7, 15),
        household_id=10,
    )
    changed_schedule = build_rhythm_preview(
        [{**row, "next_due": date(2026, 7, 28)}],
        config,
        today=date(2026, 7, 15),
        household_id=10,
    )

    assert first["preview_hash"] == same["preview_hash"]
    assert first["preview_hash"] != changed_config["preview_hash"]
    assert first["preview_hash"] != changed_schedule["preview_hash"]


CARE_RHYTHM_SCHEMA = """
CREATE TABLE plant_species (
    id INTEGER PRIMARY KEY,
    phenology_json TEXT,
    common_name_nl TEXT,
    common_name_en TEXT
);
CREATE TABLE care_rhythm_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL,
    previous_config TEXT NOT NULL,
    applied_config TEXT NOT NULL,
    preview_hash TEXT NOT NULL,
    created_at TEXT,
    undone_at TEXT
);
CREATE TABLE household_care_rhythm_preferences (
    household_id INTEGER PRIMARY KEY,
    indoor_weekdays TEXT NOT NULL,
    outdoor_weekdays TEXT NOT NULL,
    last_operation_id INTEGER
);
CREATE TABLE map_care_rhythm_overrides (
    household_id INTEGER NOT NULL,
    map_id INTEGER NOT NULL,
    weekdays TEXT NOT NULL,
    PRIMARY KEY (household_id, map_id)
);
CREATE TABLE care_rhythm_operation_members (
    operation_id INTEGER NOT NULL,
    schedule_id INTEGER NOT NULL,
    previous_next_due DATE NOT NULL,
    applied_next_due DATE NOT NULL,
    previous_rhythm_operation_id INTEGER,
    previous_last_done TEXT,
    previous_last_done_by INTEGER,
    PRIMARY KEY (operation_id, schedule_id)
);
"""


def _next_weekday(today: date, iso_weekday: int) -> date:
    days = (iso_weekday - today.isoweekday()) % 7
    return today + timedelta(days=days or 7)


@pytest_asyncio.fixture
async def rhythm_db(seeded_db):
    today = date.today()
    monday = _next_weekday(today, 1)
    await seeded_db.executescript(CARE_RHYTHM_SCHEMA)
    await seeded_db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other household');
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Back garden', 'outdoor', 1),
          (2, 'Living room', 'indoor', 1),
          (3, 'Other garden', 'outdoor', 2);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (101, 'Rose', 1, 1, 1),
          (102, 'Fern', 1, 1, 1),
          (103, 'Monstera', 1, 2, 1),
          (104, 'Archived', 1, 1, 0),
          (105, 'Foreign', 2, 3, 1);
    """)
    schedules = [
        (201, 101, "water", 7, monday + timedelta(days=1), 1, 0, 0),
        (202, 102, "water", 7, monday + timedelta(days=2), 1, 0, 0),
        (203, 103, "water", 7, monday + timedelta(days=3), 1, 0, 0),
        (204, 104, "water", 7, monday + timedelta(days=1), 1, 0, 0),
        (205, 101, "fertilize", 30, monday + timedelta(days=1), 1, 0, 0),
        (206, 101, "water", 7, monday + timedelta(days=1), 0, 0, 0),
        (207, 101, "heat_protect", 1, monday + timedelta(days=1), 1, 1, 0),
        (208, 105, "water", 7, monday + timedelta(days=1), 1, 0, 0),
    ]
    for row in schedules:
        await seeded_db.execute(
            """INSERT INTO care_schedules
               (id, plant_id, care_type, interval_days, next_due, is_active,
                is_ephemeral, rhythm_opt_out)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            row,
        )
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_preview_endpoint_is_side_effect_free_and_household_scoped(
    client, rhythm_db, auth_header,
):
    today = date.today()
    monday = _next_weekday(today, 1)
    before = await rhythm_db.execute_fetchall(
        "SELECT id, next_due FROM care_schedules ORDER BY id"
    )

    response = await client.post(
        "/api/care-rhythm/preview",
        headers=auth_header,
        json={
            "indoor_weekdays": [4],
            "outdoor_weekdays": [1],
            "map_overrides": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["schedule_id"] for item in body["items"]] == [201, 202, 203]
    assert body["items"][0]["new_date"] == monday.isoformat()
    assert body["items"][0]["movement_days"] == -1
    assert body["items"][1]["reason"] == "outside_window"
    assert body["items"][2]["status"] == "unchanged"
    after = await rhythm_db.execute_fetchall(
        "SELECT id, next_due FROM care_schedules ORDER BY id"
    )
    assert after == before


@pytest.mark.asyncio
async def test_preview_rejects_foreign_map_override(client, rhythm_db, auth_header):
    response = await client.post(
        "/api/care-rhythm/preview",
        headers=auth_header,
        json={
            "indoor_weekdays": [4],
            "outdoor_weekdays": [1],
            "map_overrides": [{"map_id": 3, "weekdays": [5]}],
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_care_rhythm_map"


@pytest.mark.asyncio
async def test_get_settings_proposes_indoor_and_outdoor_days_without_persisting(
    client, rhythm_db, auth_header,
):
    response = await client.get("/api/household/care-rhythm", headers=auth_header)

    assert response.status_code == 200
    body = response.json()
    assert body["saved"] is False
    assert body["config"] == {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [2],
        "map_overrides": [],
    }
    assert [(item["id"], item["map_type"]) for item in body["maps"]] == [
        (1, "outdoor"),
        (2, "indoor"),
    ]
    assert await rhythm_db.execute_fetchall(
        "SELECT household_id FROM household_care_rhythm_preferences"
    ) == []


async def _preview(client, auth_header, config: dict) -> dict:
    response = await client.post(
        "/api/care-rhythm/preview",
        headers=auth_header,
        json=config,
    )
    assert response.status_code == 200
    return response.json()


async def _apply(client, auth_header, config: dict, preview_hash: str):
    return await client.post(
        "/api/care-rhythm/apply",
        headers=auth_header,
        json={"config": config, "preview_hash": preview_hash},
    )


@pytest.mark.asyncio
async def test_onboarding_preview_uses_saved_effective_map_routine(
    client, rhythm_db, auth_header,
):
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    preview = await _preview(client, auth_header, config)
    applied = await _apply(client, auth_header, config, preview["preview_hash"])
    assert applied.status_code == 200
    today = date.today()
    next_tuesday = _next_weekday(today, 2)
    interval_days = (next_tuesday - today).days

    response = await client.post(
        "/api/care-rhythm/onboarding-preview",
        headers=auth_header,
        json={"map_id": 1, "interval_days": interval_days},
    )

    assert response.status_code == 200
    assert response.json() == {
        "available": True,
        "baseline_date": next_tuesday.isoformat(),
        "proposed_date": (next_tuesday - timedelta(days=1)).isoformat(),
        "movement_days": -1,
        "reason": "moved_earlier",
    }


@pytest.mark.asyncio
async def test_onboarding_preview_is_unavailable_until_routine_is_saved(
    client, rhythm_db, auth_header,
):
    response = await client.post(
        "/api/care-rhythm/onboarding-preview",
        headers=auth_header,
        json={"map_id": 1, "interval_days": 7},
    )

    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["proposed_date"] is None


@pytest.mark.asyncio
async def test_apply_and_undo_change_only_future_due_dates_transactionally(
    client, rhythm_db, auth_header,
):
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    preview = await _preview(client, auth_header, config)

    applied = await _apply(client, auth_header, config, preview["preview_hash"])

    assert applied.status_code == 200
    result = applied.json()
    assert result["affected_count"] == 1
    operation_id = result["operation_id"]
    rows = await rhythm_db.execute_fetchall(
        """SELECT id, interval_days, next_due, last_done, season_adjust,
                  rhythm_operation_id
           FROM care_schedules WHERE id IN (201, 202, 203) ORDER BY id"""
    )
    assert rows[0]["next_due"] == preview["items"][0]["new_date"]
    assert rows[0]["rhythm_operation_id"] == operation_id
    assert rows[1]["next_due"] == preview["items"][1]["old_date"]
    assert rows[2]["next_due"] == preview["items"][2]["old_date"]
    assert [row["interval_days"] for row in rows] == [7, 7, 7]
    assert all(row["last_done"] is None for row in rows)
    assert all(row["season_adjust"] is None for row in rows)

    stored = (await rhythm_db.execute_fetchall(
        """SELECT indoor_weekdays, outdoor_weekdays, last_operation_id
           FROM household_care_rhythm_preferences WHERE household_id = 1"""
    ))[0]
    assert json.loads(stored["indoor_weekdays"]) == [4]
    assert json.loads(stored["outdoor_weekdays"]) == [1]
    assert stored["last_operation_id"] == operation_id

    undone = await client.post(
        f"/api/care-rhythm/{operation_id}/undo",
        headers=auth_header,
    )
    assert undone.status_code == 200
    restored = await rhythm_db.execute_fetchall(
        "SELECT id, next_due, rhythm_operation_id FROM care_schedules "
        "WHERE id IN (201, 202, 203) ORDER BY id"
    )
    assert [row["next_due"] for row in restored] == [
        item["old_date"] for item in preview["items"]
    ]
    assert all(row["rhythm_operation_id"] is None for row in restored)
    assert await rhythm_db.execute_fetchall(
        "SELECT household_id FROM household_care_rhythm_preferences"
    ) == []


@pytest.mark.asyncio
async def test_apply_rejects_stale_preview_without_writes(client, rhythm_db, auth_header):
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    preview = await _preview(client, auth_header, config)
    await rhythm_db.execute(
        "UPDATE care_schedules SET next_due = ? WHERE id = 201",
        (date.today() + timedelta(days=30),),
    )
    await rhythm_db.commit()

    response = await _apply(client, auth_header, config, preview["preview_hash"])

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "stale_care_rhythm_preview"
    assert await rhythm_db.execute_fetchall("SELECT id FROM care_rhythm_operations") == []
    assert await rhythm_db.execute_fetchall(
        "SELECT household_id FROM household_care_rhythm_preferences"
    ) == []


@pytest.mark.asyncio
async def test_chained_apply_and_undo_restore_previous_map_override_configuration(
    client, rhythm_db, auth_header,
):
    first_config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    first_preview = await _preview(client, auth_header, first_config)
    first = await _apply(
        client, auth_header, first_config, first_preview["preview_hash"],
    )
    first_operation_id = first.json()["operation_id"]

    second_config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [2],
        "map_overrides": [{"map_id": 1, "weekdays": [5]}],
    }
    second_preview = await _preview(client, auth_header, second_config)
    second = await _apply(
        client, auth_header, second_config, second_preview["preview_hash"],
    )
    assert second.status_code == 200
    second_operation_id = second.json()["operation_id"]

    saved = await client.get("/api/household/care-rhythm", headers=auth_header)
    assert saved.status_code == 200
    assert saved.json()["saved"] is True
    assert saved.json()["config"] == second_config

    blocked = await client.post(
        f"/api/care-rhythm/{first_operation_id}/undo",
        headers=auth_header,
    )
    assert blocked.status_code == 409

    second_undo = await client.post(
        f"/api/care-rhythm/{second_operation_id}/undo",
        headers=auth_header,
    )
    assert second_undo.status_code == 200
    restored = await client.get("/api/household/care-rhythm", headers=auth_header)
    assert restored.json()["config"] == first_config

    first_undo = await client.post(
        f"/api/care-rhythm/{first_operation_id}/undo",
        headers=auth_header,
    )
    assert first_undo.status_code == 200
    proposed = await client.get("/api/household/care-rhythm", headers=auth_header)
    assert proposed.json()["saved"] is False


@pytest.mark.asyncio
async def test_undo_rejects_later_manual_schedule_change(client, rhythm_db, auth_header):
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    preview = await _preview(client, auth_header, config)
    applied = await _apply(client, auth_header, config, preview["preview_hash"])
    operation_id = applied.json()["operation_id"]
    await rhythm_db.execute(
        """UPDATE care_schedules
           SET next_due = ?, rhythm_opt_out = 1, rhythm_operation_id = NULL
           WHERE id = 201""",
        (date.today() + timedelta(days=40),),
    )
    await rhythm_db.commit()

    response = await client.post(
        f"/api/care-rhythm/{operation_id}/undo",
        headers=auth_header,
    )

    assert response.status_code == 409
    current = (await rhythm_db.execute_fetchall(
        "SELECT next_due, rhythm_opt_out FROM care_schedules WHERE id = 201"
    ))[0]
    assert current["rhythm_opt_out"] == 1
    operation = (await rhythm_db.execute_fetchall(
        "SELECT undone_at FROM care_rhythm_operations WHERE id = ?",
        (operation_id,),
    ))[0]
    assert operation["undone_at"] is None


@pytest.mark.asyncio
async def test_undo_rejects_later_care_even_when_due_date_matches_applied_date(
    client, rhythm_db, auth_header,
):
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    preview = await _preview(client, auth_header, config)
    applied = await _apply(client, auth_header, config, preview["preview_hash"])
    operation_id = applied.json()["operation_id"]
    await rhythm_db.execute(
        """UPDATE care_schedules
           SET last_done = '2026-07-20 09:00:00', last_done_by = 1
           WHERE id = 201"""
    )
    await rhythm_db.commit()

    response = await client.post(
        f"/api/care-rhythm/{operation_id}/undo",
        headers=auth_header,
    )

    assert response.status_code == 409
    current = (await rhythm_db.execute_fetchall(
        "SELECT next_due, last_done FROM care_schedules WHERE id = 201"
    ))[0]
    assert current["next_due"] == preview["items"][0]["new_date"]
    assert current["last_done"] == "2026-07-20 09:00:00"


@pytest.mark.asyncio
async def test_apply_rolls_back_operation_preferences_and_dates_on_failure(
    client, rhythm_db, auth_header,
):
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    preview = await _preview(client, auth_header, config)
    await rhythm_db.execute("""
        CREATE TRIGGER fail_rhythm_apply
        BEFORE UPDATE OF next_due ON care_schedules
        WHEN OLD.id = 201
        BEGIN
            SELECT RAISE(ABORT, 'forced rhythm apply failure');
        END
    """)
    await rhythm_db.commit()

    with pytest.raises(Exception, match="forced rhythm apply failure"):
        await apply_care_rhythm(
            rhythm_db,
            household_id=1,
            config=config,
            preview_hash=preview["preview_hash"],
        )
    schedule = (await rhythm_db.execute_fetchall(
        "SELECT next_due, rhythm_operation_id FROM care_schedules WHERE id = 201"
    ))[0]
    assert schedule["next_due"] == preview["items"][0]["old_date"]
    assert schedule["rhythm_operation_id"] is None
    assert await rhythm_db.execute_fetchall("SELECT id FROM care_rhythm_operations") == []
    assert await rhythm_db.execute_fetchall(
        "SELECT household_id FROM household_care_rhythm_preferences"
    ) == []


@pytest.mark.asyncio
async def test_undo_rolls_back_all_restores_when_finalize_fails(
    client, rhythm_db, auth_header,
):
    config = {
        "indoor_weekdays": [4],
        "outdoor_weekdays": [1],
        "map_overrides": [],
    }
    preview = await _preview(client, auth_header, config)
    applied = await _apply(client, auth_header, config, preview["preview_hash"])
    operation_id = applied.json()["operation_id"]
    applied_date = (await rhythm_db.execute_fetchall(
        "SELECT next_due FROM care_schedules WHERE id = 201"
    ))[0]["next_due"]
    await rhythm_db.execute("""
        CREATE TRIGGER fail_rhythm_undo_finalize
        BEFORE UPDATE OF undone_at ON care_rhythm_operations
        WHEN OLD.id = 1
        BEGIN
            SELECT RAISE(ABORT, 'forced rhythm undo failure');
        END
    """)
    await rhythm_db.commit()

    with pytest.raises(Exception, match="forced rhythm undo failure"):
        await undo_care_rhythm(
            rhythm_db,
            household_id=1,
            operation_id=operation_id,
        )
    schedule = (await rhythm_db.execute_fetchall(
        "SELECT next_due, rhythm_operation_id FROM care_schedules WHERE id = 201"
    ))[0]
    assert schedule["next_due"] == applied_date
    assert schedule["rhythm_operation_id"] == operation_id
    preference = (await rhythm_db.execute_fetchall(
        "SELECT last_operation_id FROM household_care_rhythm_preferences "
        "WHERE household_id = 1"
    ))[0]
    assert preference["last_operation_id"] == operation_id


@pytest.mark.asyncio
async def test_schedule_sync_can_opt_water_out_and_clears_rhythm_owner(
    client, rhythm_db, auth_header,
):
    await rhythm_db.execute(
        "UPDATE care_schedules SET rhythm_operation_id = 77 WHERE id = 201"
    )
    await rhythm_db.commit()

    response = await client.put(
        "/api/plants/101/care-schedules",
        headers=auth_header,
        json={
            "schedules": [{
                "care_type": "water",
                "interval_days": 7,
                "rhythm_opt_out": True,
            }],
        },
    )

    assert response.status_code == 200
    schedule = (await rhythm_db.execute_fetchall(
        """SELECT rhythm_opt_out, rhythm_operation_id
           FROM care_schedules WHERE id = 201"""
    ))[0]
    assert schedule["rhythm_opt_out"] == 1
    assert schedule["rhythm_operation_id"] is None
    water = next(
        item for item in response.json()["care_schedules"]
        if item["care_type"] == "water"
    )
    assert water["rhythm_opt_out"] is True


@pytest.mark.asyncio
async def test_unchanged_schedule_sync_preserves_rhythm_owner(
    client, rhythm_db, auth_header,
):
    await rhythm_db.execute(
        "UPDATE care_schedules SET rhythm_operation_id = 77 WHERE id = 201"
    )
    await rhythm_db.commit()

    response = await client.put(
        "/api/plants/101/care-schedules",
        headers=auth_header,
        json={
            "schedules": [{
                "care_type": "water",
                "interval_days": 7,
                "rhythm_opt_out": False,
            }],
        },
    )

    assert response.status_code == 200
    schedule = (await rhythm_db.execute_fetchall(
        """SELECT rhythm_opt_out, rhythm_operation_id
           FROM care_schedules WHERE id = 201"""
    ))[0]
    assert schedule["rhythm_opt_out"] == 0
    assert schedule["rhythm_operation_id"] == 77


@pytest.mark.asyncio
async def test_interval_patch_opts_water_out_and_clears_rhythm_owner(
    client, rhythm_db, auth_header,
):
    await rhythm_db.execute(
        "UPDATE care_schedules SET rhythm_operation_id = 77 WHERE id = 201"
    )
    await rhythm_db.commit()

    response = await client.patch(
        "/api/care/schedules/201",
        headers=auth_header,
        json={"interval_days": 9},
    )

    assert response.status_code == 200
    schedule = (await rhythm_db.execute_fetchall(
        """SELECT interval_days, rhythm_opt_out, rhythm_operation_id
           FROM care_schedules WHERE id = 201"""
    ))[0]
    assert schedule["interval_days"] == 9
    assert schedule["rhythm_opt_out"] == 1
    assert schedule["rhythm_operation_id"] is None

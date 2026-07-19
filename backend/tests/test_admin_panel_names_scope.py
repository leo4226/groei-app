import pytest


@pytest.fixture
async def admin_names_db(seeded_db):
    """A species catalog with assorted localized-name gaps + plants across two
    households, mirroring test_admin_panel_facts_scope but for common names."""
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await seeded_db.execute("INSERT INTO households (id, name) VALUES (2, 'Other Garden')")
    await seeded_db.execute(
        """
        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            common_name_nl TEXT,
            common_name_en TEXT,
            latin_name TEXT,
            phenology_json TEXT,
            updated_at TEXT
        )
        """
    )
    await seeded_db.executemany(
        """
        INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name, phenology_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (1, "Basilicum", None, "Ocimum basilicum", "{}"),          # missing EN
            (2, None, "Lavender", "Lavandula angustifolia", "{}"),     # missing NL
            (3, "Venkel", "Fennel", "Foeniculum vulgare", "{}"),       # complete
            # common_name_nl echoes the Latin name → treated as missing NL
            (4, "Mahonia aquifolium", "Oregon grape", "Mahonia aquifolium", "{}"),
            (5, None, None, "Alia hortensis", "{}"),                   # missing both
        ],
    )
    await seeded_db.executemany(
        """
        INSERT INTO plants (id, name, species_id, is_active, map_id, household_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (101, "Basil", 1, 1, 10, 1),        # active + on this household's map
            (102, "Lavender", 2, 1, None, 1),   # active, not on a map
            (103, "Old fennel", 3, 0, 10, 1),   # archived → not in_use
            (201, "Other plant", 5, 1, 20, 2),  # other household
        ],
    )
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_backfill_names_preview_counts_all_localized_gaps(client, admin_names_db, auth_header):
    all_preview = await client.get("/api/admin-panel/backfill-names/preview?scope=all", headers=auth_header)
    assert all_preview.status_code == 200, all_preview.text
    body = all_preview.json()
    # species 1, 2, 4, 5 have a gap (3 is complete)
    assert body["missing_names"] == 4
    assert body["missing_names_nl"] == 3   # 2, 4, 5
    assert body["missing_names_en"] == 2   # 1, 5


@pytest.mark.asyncio
async def test_incomplete_names_endpoint_limits_after_filtering_and_sorts_by_prevalence(
    client, admin_names_db, auth_header
):
    # Give species 2 the highest active prevalence; the endpoint should filter
    # incomplete species first, report the full total, then apply the UI limit.
    await admin_names_db.execute(
        """INSERT INTO plants (id, name, species_id, is_active, map_id, household_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (104, "More lavender", 2, 1, 10, 1),
    )
    await admin_names_db.commit()

    resp = await client.get(
        "/api/admin-panel/species/incomplete-names?limit=2",
        headers=auth_header,
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 4
    assert [s["id"] for s in body["species"]] == [2, 5]
    assert [s["active_count"] for s in body["species"]] == [2, 1]


@pytest.mark.asyncio
async def test_backfill_names_preview_scopes_to_household_active_plants(client, admin_names_db, auth_header):
    in_use = await client.get("/api/admin-panel/backfill-names/preview?scope=in_use", headers=auth_header)
    assert in_use.status_code == 200, in_use.text
    body = in_use.json()
    assert body["scope"] == "in_use"
    assert body["map_only"] is False
    # household 1 active plants → species 1 and 2, both with a gap
    assert body["missing_names"] == 2

    garden = await client.get(
        "/api/admin-panel/backfill-names/preview?scope=in_use&map_only=true",
        headers=auth_header,
    )
    assert garden.status_code == 200, garden.text
    gbody = garden.json()
    assert gbody["map_only"] is True
    # only species 1 is on a map for household 1
    assert gbody["missing_names"] == 1


@pytest.mark.asyncio
async def test_backfill_names_runner_scopes_to_household_and_fills_missing_language_only(
    admin_names_db, monkeypatch
):
    from routers.admin_panel import _run_backfill_names

    async def fake_generate_names(plant_name):
        return {
            "common_name_nl": f"NL-{plant_name}",
            "common_name_en": f"EN-{plant_name}",
            "latin_name": None,
        }

    monkeypatch.setattr("species_service._generate_names", fake_generate_names)

    async def on_progress(done, total):
        pass

    result = await _run_backfill_names(
        admin_names_db,
        {"scope": "in_use", "map_only": True, "limit": 25, "household_id": 1},
        on_progress,
    )
    # Only species 1 (household 1, on a map) is in scope.
    assert result["scope"] == "in_use"
    assert result["map_only"] is True
    assert result["processed"] == 1
    assert result["updated"] == 1

    rows = await admin_names_db.execute_fetchall(
        "SELECT id, common_name_nl, common_name_en FROM plant_species ORDER BY id"
    )
    by_id = {r["id"]: dict(r) for r in rows}
    # species 1 was missing only EN → EN filled, NL untouched
    assert by_id[1]["common_name_nl"] == "Basilicum"
    assert by_id[1]["common_name_en"] == "EN-Basilicum"
    # species outside the map-only household scope stay untouched
    assert by_id[2]["common_name_nl"] is None
    assert by_id[5]["common_name_en"] is None


@pytest.mark.asyncio
async def test_backfill_names_job_runner_fills_both_languages(admin_names_db, monkeypatch):
    from routers.admin_panel import _run_backfill_names

    async def fake_generate_names(plant_name):
        return {
            "common_name_nl": f"NL-{plant_name}",
            "common_name_en": f"EN-{plant_name}",
            "latin_name": None,
        }

    monkeypatch.setattr("species_service._generate_names", fake_generate_names)

    progress = []

    async def on_progress(done, total):
        progress.append((done, total))

    result = await _run_backfill_names(
        admin_names_db,
        {"scope": "all", "map_only": False, "limit": 25},
        on_progress,
    )

    assert progress == [(0, 1), (1, 1)]
    # species 1, 2, 4, 5 all had a gap and get updated
    assert result["processed"] == 4
    assert result["updated"] == 4

    rows = await admin_names_db.execute_fetchall(
        "SELECT id, common_name_nl, common_name_en FROM plant_species ORDER BY id"
    )
    by_id = {r["id"]: dict(r) for r in rows}
    assert by_id[5]["common_name_nl"] == "NL-Alia hortensis"
    assert by_id[5]["common_name_en"] == "EN-Alia hortensis"
    # complete species untouched
    assert by_id[3]["common_name_nl"] == "Venkel"
    assert by_id[3]["common_name_en"] == "Fennel"

@pytest.mark.asyncio
async def test_backfill_names_fills_species_with_only_latin_missing(admin_names_db, monkeypatch):
    await admin_names_db.execute(
        """
        INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name, phenology_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (6, "Munt", "Mint", None, "{}"),
    )
    await admin_names_db.commit()

    from species_service import ensure_species_localized_names

    async def fake_generate_names(plant_name):
        return {
            "common_name_nl": f"NL-{plant_name}",
            "common_name_en": f"EN-{plant_name}",
            "latin_name": "Mentha spicata",
        }

    monkeypatch.setattr("species_service._generate_names", fake_generate_names)

    updated = await ensure_species_localized_names(admin_names_db, 6, "Munt")

    assert updated is True
    rows = await admin_names_db.execute_fetchall(
        "SELECT common_name_nl, common_name_en, latin_name FROM plant_species WHERE id = ?",
        (6,),
    )
    row = dict(rows[0])
    assert row["common_name_nl"] == "Munt"
    assert row["common_name_en"] == "Mint"
    assert row["latin_name"] == "Mentha spicata"

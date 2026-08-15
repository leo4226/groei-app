# backend/tests/test_icon_generation.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# The AI now returns only the plant fragment; the backend composites it onto the
# standard pot and validates the finished icon.
PLANT = '<g><ellipse cx="50" cy="50" rx="9" ry="9" fill="#4A7C4E"/></g>'
# A fragment that makes the composed icon invalid (disallowed tag) -> procedural.
BAD_PLANT = '<foreignObject/>'


async def _generate(db, *, scope="all", map_only=False, limit=25, household_id=1):
    """Run the icon generation the admin panel actually uses.

    These tests used to POST /api/admin-panel/generate-icons — a second, fully
    duplicated implementation of icon generation that the panel stopped calling
    when it moved to background jobs. So the tested path was the one nobody ran,
    and the path every admin runs had no coverage at all; the two had already
    drifted apart. That endpoint is gone, and these tests drive the job runner.

    Returns (result, progress) where progress is every (done, total) the runner
    reported, so tests can assert the bar actually moves.
    """
    from routers.admin_panel import _run_generate_icons

    progress: list[tuple[int, int]] = []

    async def on_progress(done, total):
        progress.append((done, total))

    result = await _run_generate_icons(
        db,
        {"scope": scope, "map_only": map_only, "limit": limit, "household_id": household_id},
        on_progress,
    )
    return result, progress


@pytest.fixture
async def admin_db(seeded_db):
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id=1")
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT 0")
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, latin_name TEXT)")
    await seeded_db.execute("INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (1,'Roos','Rosa canina')")
    await seeded_db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_generate_ai_path_writes_r2_and_db(client, admin_db, auth_header):
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, _ = await _generate(admin_db)
    assert body["count"] == 1
    rows = await admin_db.execute_fetchall("SELECT id, source, url FROM generated_icons ORDER BY id")
    ids = {r["id"] for r in rows}
    # Keyed on the latin name, not the Dutch common name — see test_two_species_
    # of_one_genus_get_separate_icons for what the common name did.
    assert {"gen_rosa_canina", "gen_rosa_canina_bare"} <= ids
    assert fake_storage.put.call_count == 2


@pytest.mark.asyncio
async def test_falls_back_to_procedural_on_bad_svg(client, admin_db, auth_header):
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": BAD_PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, _ = await _generate(admin_db)
    rows = await admin_db.execute_fetchall("SELECT source FROM generated_icons")
    assert rows and all(r["source"] == "procedural" for r in rows)
    # The fallback is reported rather than passing as a plain success: a species
    # that always fails AI keeps coming back as "missing", and this is the only
    # place that says why.
    assert body["fallback_count"] == 1
    assert body["skipped_details"][0]["reason"] == "ai_failed_used_generic_art"


@pytest.mark.asyncio
async def test_ai_retries_before_procedural_fallback(client, admin_db, auth_header):
    # The reasoning model is flaky (timeout / empty content); two failures then a
    # success must still yield an AI icon, not the generic procedural fallback.
    flaky = AsyncMock(side_effect=[
        Exception("read timeout"),
        ValueError("empty content"),
        {"plant_svg": PLANT, "cat": "flower"},
    ])
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants", new=flaky), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, _ = await _generate(admin_db)
    rows = await admin_db.execute_fetchall("SELECT source FROM generated_icons")
    assert rows and all(r["source"] == "ai" for r in rows)
    assert flaky.call_count == 3
    assert body["fallback_count"] == 0


@pytest.mark.asyncio
async def test_preview_counts_all_uncovered_species(client, admin_db, auth_header):
    resp = await client.get("/api/admin-panel/generate-icons/preview", headers=auth_header)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["scope"] == "all"
    assert body["count"] == 1  # the single seeded species (Rosa canina), uncovered


@pytest.mark.asyncio
async def test_preview_in_use_scope_and_map_only(client, admin_db, auth_header):
    # A species exists but no plant references it yet -> in_use count is 0.
    r0 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use", headers=auth_header)
    assert r0.json()["count"] == 0
    # Add a plant that needs an icon, linked to the species, NOT placed on a map.
    await admin_db.execute(
        "INSERT INTO plants (id,name,species_id,icon_requested,is_active,household_id) "
        "VALUES (1,'Mijn roos',1,1,1,1)")
    await admin_db.commit()
    r1 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use", headers=auth_header)
    assert r1.json()["count"] == 1
    # map_only excludes it (no map_id).
    r2 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use&map_only=true", headers=auth_header)
    assert r2.json()["count"] == 0
    # Place it on a map -> map_only now counts it.
    await admin_db.execute("UPDATE plants SET map_id = 5 WHERE id = 1")
    await admin_db.commit()
    r3 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use&map_only=true", headers=auth_header)
    assert r3.json()["count"] == 1


@pytest.mark.asyncio
async def test_preview_in_use_counts_only_current_admin_household(client, admin_db, auth_header):
    await admin_db.execute("INSERT INTO households (id, name) VALUES (2, 'Other household')")
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (2,'Andere roos','Rosa gallica')"
    )
    await admin_db.executemany(
        "INSERT INTO plants (id,name,species_id,icon_requested,is_active,map_id,household_id) "
        "VALUES (?, ?, ?, 1, 1, 5, ?)",
        [
            (1, 'Mijn roos', 1, 1),
            (2, 'Andere roos', 2, 2),
        ],
    )
    await admin_db.commit()

    resp = await client.get(
        "/api/admin-panel/generate-icons/preview?scope=in_use&map_only=true",
        headers=auth_header,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] == 1


@pytest.mark.asyncio
async def test_preview_counts_procedural_icons_as_still_needing_ai_upgrade(client, admin_db, auth_header):
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos','Roos','Rosa canina','flower','potted',NULL,'https://r2/gen_roos.svg','procedural')"
    )
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos_bare','Roos','Rosa canina','flower','bare','gen_roos','https://r2/gen_roos_bare.svg','procedural')"
    )
    await admin_db.execute(
        "INSERT INTO plants (id,name,species,species_id,icon_key,icon_requested,is_active,map_id,household_id) "
        "VALUES (1,'Mijn roos','Rosa canina',1,'gen_roos_bare',0,1,5,1)"
    )
    await admin_db.commit()

    all_preview = await client.get("/api/admin-panel/generate-icons/preview?scope=all", headers=auth_header)
    assert all_preview.status_code == 200, all_preview.text
    assert all_preview.json()["count"] == 1

    in_use_preview = await client.get(
        "/api/admin-panel/generate-icons/preview?scope=in_use&map_only=true",
        headers=auth_header,
    )
    assert in_use_preview.status_code == 200, in_use_preview.text
    assert in_use_preview.json()["count"] == 1


@pytest.mark.asyncio
async def test_ai_generation_upgrades_existing_procedural_icon(client, admin_db, auth_header):
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos','Roos','Rosa canina','flower','potted',NULL,'https://r2/old_roos.svg','procedural')"
    )
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos_bare','Roos','Rosa canina','flower','bare','gen_roos','https://r2/old_roos_bare.svg','procedural')"
    )
    await admin_db.execute(
        "INSERT INTO plants (id,name,species,species_id,icon_key,icon_requested,is_active,map_id,household_id) "
        "VALUES (1,'Mijn roos','Rosa canina',1,'gen_roos_bare',0,1,5,1)"
    )
    await admin_db.commit()

    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})),          patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, _ = await _generate(admin_db, scope="in_use", map_only=True, limit=25)

    assert body["count"] == 1
    rows = await admin_db.execute_fetchall("SELECT id, source, url FROM generated_icons ORDER BY id")
    by_id = {row["id"]: dict(row) for row in rows}
    # The pre-existing procedural rows are keyed on the old common-name scheme;
    # the AI upgrade lands on the latin-keyed id.
    assert by_id["gen_rosa_canina"]["source"] == "ai"
    assert by_id["gen_rosa_canina_bare"]["source"] == "ai"
    assert by_id["gen_rosa_canina"]["url"] != "https://r2/old_roos.svg"


@pytest.mark.asyncio
async def test_generate_respects_limit_and_reports_remaining(client, admin_db, auth_header):
    # Second uncovered species -> two candidates under scope=all.
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (2,'Basterdkool','Bunias orientalis')")
    await admin_db.commit()
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, progress = await _generate(admin_db, limit=1)
    assert body["count"] == 1
    assert body["remaining"] == 1
    # Progress is reported per icon, so the bar moves during a long run.
    assert progress == [(0, 1), (1, 1)]


@pytest.mark.asyncio
async def test_dangling_icon_key_surfaces_and_is_reassigned(client, admin_db, auth_header):
    # A plant linked to a species, with an icon_key that resolves to NO real icon
    # (a stale/dangling key) and icon_requested = 0 — the legacy-data case.
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (2,'Basterdkool','Bunias orientalis')")
    await admin_db.execute(
        "INSERT INTO plants (id,name,species,species_id,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Basterdkool','Bunias orientalis',2,'basterdkool_old',0,1,1)")
    await admin_db.commit()
    # It must surface under in_use even though icon_requested=0 and the key is non-null/non-placeholder.
    pv = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use", headers=auth_header)
    assert pv.json()["count"] == 1
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "edible"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        await _generate(admin_db, scope="in_use")
    # The dangling key is replaced by the freshly generated icon.
    row = (await admin_db.execute_fetchall("SELECT icon_key, icon_requested FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "gen_bunias_orientalis"
    assert not row["icon_requested"]

@pytest.mark.asyncio
async def test_sync_upgrades_valid_generic_icon_to_existing_ai_generated_icon(client, admin_db, auth_header):
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos','Roos','Rosa canina','flower','potted',NULL,'https://r2/gen_roos.svg','ai')"
    )
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos_bare','Roos','Rosa canina','flower','bare','gen_roos','https://r2/gen_roos_bare.svg','ai')"
    )
    await admin_db.execute(
        "INSERT INTO plants (id,name,species,species_id,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Mijn roos','Rosa canina',1,'daisy',0,1,1)"
    )
    await admin_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await admin_db.commit()

    resp = await client.post('/api/icon-catalog/sync', headers=auth_header)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['matched_plants'] == 1
    assert body['matches'][0]['icon_key'] == 'gen_roos'
    row = (await admin_db.execute_fetchall("SELECT icon_key, icon_requested FROM plants WHERE id=1"))[0]
    assert row['icon_key'] == 'gen_roos'
    assert not row['icon_requested']


@pytest.mark.asyncio
async def test_sync_does_not_upgrade_generic_icon_to_procedural_generated_icon(client, admin_db, auth_header):
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos','Roos','Rosa canina','flower','potted',NULL,'https://r2/gen_roos.svg','procedural')"
    )
    await admin_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
        "VALUES ('gen_roos_bare','Roos','Rosa canina','flower','bare','gen_roos','https://r2/gen_roos_bare.svg','procedural')"
    )
    await admin_db.execute(
        "INSERT INTO plants (id,name,species,species_id,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Mijn roos','Rosa canina',1,'daisy',0,1,1)"
    )
    await admin_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await admin_db.commit()

    resp = await client.post('/api/icon-catalog/sync', headers=auth_header)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['matched_plants'] == 0
    row = (await admin_db.execute_fetchall("SELECT icon_key FROM plants WHERE id=1"))[0]
    assert row['icon_key'] == 'daisy'


@pytest.mark.asyncio
async def test_two_species_of_one_genus_get_separate_icons(client, admin_db, auth_header):
    """The bug that made every run "leave a few plants out".

    The icon id came from the Dutch common name, and when a species had none the
    code fell back to ``derive_common_name(latin)`` — which returns the *genus*.
    So Rosa canina, Rosa gallica and Rosa rugosa all produced ``gen_rosa``, and
    generation does DELETE-then-INSERT on that id: each species overwrote the
    icon just made for the previous one. All three were reported as generated;
    two were left with nothing.
    """
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) "
        "VALUES (2, NULL, 'Rosa gallica'), (3, NULL, 'Rosa rugosa')")
    await admin_db.commit()

    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, _ = await _generate(admin_db)

    assert body["count"] == 3
    rows = await admin_db.execute_fetchall(
        "SELECT id, sci FROM generated_icons WHERE form = 'potted' ORDER BY id")
    # One icon per species, and each carries its own latin name — the whole
    # point, since `sci` is what coverage and plant matching resolve against.
    assert len(rows) == 3, "a genus must not collapse three species onto one icon"
    assert {r["sci"] for r in rows} == {"Rosa canina", "Rosa gallica", "Rosa rugosa"}


@pytest.mark.asyncio
async def test_species_sharing_a_dutch_name_get_separate_icons(client, admin_db, auth_header):
    """Same collision, reached the other way: a duplicated common name."""
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) "
        "VALUES (2, 'Roos', 'Rosa gallica')")
    await admin_db.commit()

    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        await _generate(admin_db)

    rows = await admin_db.execute_fetchall(
        "SELECT sci FROM generated_icons WHERE form = 'potted'")
    assert {r["sci"] for r in rows} == {"Rosa canina", "Rosa gallica"}


@pytest.mark.asyncio
async def test_r2_failure_is_reported_with_a_hint(client, admin_db, auth_header):
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=RuntimeError("bucket unreachable"))
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, _ = await _generate(admin_db)

    assert body["count"] == 0
    assert body["skipped_count"] == 1
    detail = body["skipped_details"][0]
    assert detail["reason"] == "r2_upload_failed"
    assert "bucket unreachable" in detail["error"]
    assert detail["hint"], "a failure the admin cannot act on is not a report"


@pytest.mark.asyncio
async def test_plants_generation_cannot_reach_are_reported(client, admin_db, auth_header):
    """Why Settings says 3 plants and the panel offers to generate for 2.

    Generation works per species and keys the icon on the latin name, so a plant
    with no species link — or one whose species has no latin name — is invisible
    to `_target_species` no matter how often the tool runs. Settings counts
    plants; the panel counts species. Neither was wrong, but the plant that could
    never be served was nowhere on screen.
    """
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (2, 'Naamloos', NULL)")
    await admin_db.executemany(
        "INSERT INTO plants (id,name,species_id,icon_key,icon_requested,is_active,household_id) "
        "VALUES (?,?,?,NULL,1,1,1)",
        [
            (1, "Mijn roos", 1),        # linked + latin → generatable
            (2, "Oregon grape", None),  # no species link → unreachable
            (3, "Naamloos kruid", 2),   # species without a latin name → unreachable
        ],
    )
    await admin_db.commit()

    resp = await client.get(
        "/api/admin-panel/generate-icons/preview?scope=in_use", headers=auth_header)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["count"] == 1, "one species is actually generatable"
    assert body["blocked_count"] == 2
    by_name = {b["name"]: b for b in body["blocked"]}
    assert by_name["Oregon grape"]["reason"] == "no_species_link"
    assert by_name["Naamloos kruid"]["reason"] == "species_has_no_latin_name"
    assert all(b["hint"] for b in body["blocked"]), "each needs a next step"


@pytest.mark.asyncio
async def test_blocked_plants_ride_along_on_the_run_result(client, admin_db, auth_header):
    await admin_db.execute(
        "INSERT INTO plants (id,name,species_id,icon_key,icon_requested,is_active,household_id) "
        "VALUES (2,'Oregon grape',NULL,NULL,1,1,1)")
    await admin_db.commit()

    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        body, _ = await _generate(admin_db, scope="in_use")

    assert body["blocked_count"] == 1
    assert any(d.get("reason") == "no_species_link" for d in body["skipped_details"])


@pytest.mark.asyncio
async def test_uploads_do_not_block_the_event_loop(client, admin_db, auth_header):
    """R2 uploads are synchronous boto3; on the loop they starve the health check.

    Fly probes /health every 30s with a 5s timeout. A blocking upload per icon
    (two per species) parked the loop, the probe timed out, Fly restarted the
    machine, and the restart marked the running job `interrupted` — the
    "Stopped early" the panel kept showing. This asserts the upload is handed to
    a worker thread, by checking it does not run on the event loop's thread.
    """
    import threading

    loop_thread = threading.get_ident()
    upload_threads: list[int] = []

    fake_storage = MagicMock()

    def _put(key, data, ct):
        upload_threads.append(threading.get_ident())
        return f"https://r2/{key}"

    fake_storage.put = MagicMock(side_effect=_put)
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        await _generate(admin_db)

    assert upload_threads, "the run should have uploaded something"
    assert all(t != loop_thread for t in upload_threads), (
        "a synchronous R2 upload must not run on the event loop thread"
    )

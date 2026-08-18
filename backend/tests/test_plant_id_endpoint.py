"""HTTP-level tests for the plant identification endpoints."""
import base64
import pytest
from unittest.mock import patch, AsyncMock
from services.plant_id import IdCandidate, PlantIdQuotaExceeded, PlantIdServiceError


def _fake_candidates() -> list[IdCandidate]:
    return [
        IdCandidate(
            scientific_name="Monstera deliciosa",
            scientific_authorship="Liebm.",
            common_names=["Swiss cheese plant", "Gatenplant"],
            confidence=0.89,
            genus="Monstera",
            family="Araceae",
            plantnet_image_url=None,
        ),
        IdCandidate(
            scientific_name="Philodendron giganteum",
            scientific_authorship=None,
            common_names=["Giant philodendron"],
            confidence=0.05,
            genus="Philodendron",
            family="Araceae",
            plantnet_image_url=None,
        ),
        IdCandidate(
            scientific_name="Epipremnum aureum",
            scientific_authorship=None,
            common_names=["Golden pothos"],
            confidence=0.02,
            genus="Epipremnum",
            family="Araceae",
            plantnet_image_url=None,
        ),
    ]


@pytest.mark.asyncio
async def test_identify_endpoint_returns_top_3(client, seeded_db, auth_header):
    """Endpoint returns up to 3 candidates ranked by confidence."""
    with patch("routers.plant_id.identify", new=AsyncMock(return_value=_fake_candidates())):
        files = {"image": ("plant.jpg", b"fake-bytes", "image/jpeg")}
        resp = await client.post("/api/plants/identify", files=files, headers=auth_header)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["candidates"]) == 3
    assert body["candidates"][0]["scientific_name"] == "Monstera deliciosa"
    assert body["candidates"][0]["confidence"] == 0.89
    assert body["low_confidence"] is False


@pytest.mark.asyncio
async def test_identify_endpoint_low_confidence_flag(client, seeded_db, auth_header):
    """low_confidence is true for any non-high result (was: only in [0.10, 0.30) band).
    Now derived from the new `confidence` field — see _classify_confidence in plant_id.py."""
    low = _fake_candidates()
    low[0].confidence = 0.20
    with patch("routers.plant_id.identify", new=AsyncMock(return_value=low)):
        resp = await client.post(
            "/api/plants/identify",
            files={"image": ("plant.jpg", b"img", "image/jpeg")},
            headers=auth_header,
        )
    assert resp.status_code == 200
    assert resp.json()["low_confidence"] is True


@pytest.mark.asyncio
async def test_identify_endpoint_no_match_when_top_below_threshold(client, seeded_db, auth_header):
    """When top candidate < 0.10, return empty candidates."""
    low = _fake_candidates()
    low[0].confidence = 0.05
    with patch("routers.plant_id.identify", new=AsyncMock(return_value=low)):
        resp = await client.post(
            "/api/plants/identify",
            files={"image": ("plant.jpg", b"img", "image/jpeg")},
            headers=auth_header,
        )
    assert resp.status_code == 200
    assert resp.json()["candidates"] == []
    assert resp.json()["low_confidence"] is False


@pytest.mark.asyncio
async def test_identify_endpoint_503_on_quota_exceeded(client, seeded_db, auth_header):
    """PlantIdQuotaExceeded → HTTP 503, detail localized to ?lang= (default en)."""
    with patch("routers.plant_id.identify", new=AsyncMock(side_effect=PlantIdQuotaExceeded())):
        resp = await client.post(
            "/api/plants/identify",
            files={"image": ("plant.jpg", b"img", "image/jpeg")},
            headers=auth_header,
        )
    assert resp.status_code == 503
    assert "Identification temporarily" in resp.json()["detail"]

    with patch("routers.plant_id.identify", new=AsyncMock(side_effect=PlantIdQuotaExceeded())):
        resp_nl = await client.post(
            "/api/plants/identify?lang=nl",
            files={"image": ("plant.jpg", b"img", "image/jpeg")},
            headers=auth_header,
        )
    assert resp_nl.status_code == 503
    assert "Identificatie tijdelijk" in resp_nl.json()["detail"]


@pytest.mark.asyncio
async def test_identify_endpoint_502_on_service_error(client, seeded_db, auth_header):
    """PlantIdServiceError → HTTP 502."""
    with patch("routers.plant_id.identify", new=AsyncMock(side_effect=PlantIdServiceError("boom"))):
        resp = await client.post(
            "/api/plants/identify",
            files={"image": ("plant.jpg", b"img", "image/jpeg")},
            headers=auth_header,
        )
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_identify_endpoint_attaches_species_id_if_known(client, seeded_db, auth_header):
    """If a candidate's scientific_name matches plant_species.latin_name, attach species_id."""
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT, common_name_en TEXT, care_thresholds TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_nl, common_name_en) VALUES (7, 'Monstera deliciosa', 'Gatenplant', 'Swiss cheese plant')"
    )
    await seeded_db.commit()

    with patch("routers.plant_id.identify", new=AsyncMock(return_value=_fake_candidates())):
        resp = await client.post(
            "/api/plants/identify",
            files={"image": ("plant.jpg", b"img", "image/jpeg")},
            headers=auth_header,
        )
    body = resp.json()
    assert body["candidates"][0]["species_id"] == 7
    assert body["candidates"][1]["species_id"] is None


@pytest.mark.asyncio
async def test_identify_endpoint_passes_all_images_to_bioclip(client, seeded_db, auth_header):
    """Multi-angle: the endpoint forwards every uploaded image to _bioclip_identify."""
    from routers.plant_id import IdentifyResponse

    async def fake_bioclip(image_bytes_list, db, lang="nl", household_id=None):
        assert isinstance(image_bytes_list, list)
        assert len(image_bytes_list) == 3
        return IdentifyResponse(candidates=[], confidence="no_match", low_confidence=False, source="bioclip")

    with patch("routers.plant_id._bioclip_identify", new=fake_bioclip):
        resp = await client.post(
            "/api/plants/identify",
            files=[
                ("image", ("plant.jpg", b"img1", "image/jpeg")),
                ("extra_images", ("angle-2.jpg", b"img2", "image/jpeg")),
                ("extra_images", ("angle-3.jpg", b"img3", "image/jpeg")),
            ],
            headers=auth_header,
        )
    assert resp.status_code == 200
    assert resp.json()["source"] == "bioclip"


@pytest.mark.asyncio
async def test_identify_endpoint_single_image_still_one_element(client, seeded_db, auth_header):
    """Single-image behavior is unchanged: exactly one element in the list."""
    from routers.plant_id import IdentifyResponse

    async def fake_bioclip(image_bytes_list, db, lang="nl", household_id=None):
        assert isinstance(image_bytes_list, list)
        assert len(image_bytes_list) == 1
        return IdentifyResponse(candidates=[], confidence="no_match", low_confidence=False, source="bioclip")

    with patch("routers.plant_id._bioclip_identify", new=fake_bioclip):
        resp = await client.post(
            "/api/plants/identify",
            files={"image": ("plant.jpg", b"img1", "image/jpeg")},
            headers=auth_header,
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_identify_endpoint_rejects_more_than_three_images(client, seeded_db, auth_header):
    """At most 3 photos per identification — the 4th is rejected with 400."""
    resp = await client.post(
        "/api/plants/identify",
        files=[
            ("image", ("plant.jpg", b"img1", "image/jpeg")),
            ("extra_images", ("angle-2.jpg", b"img2", "image/jpeg")),
            ("extra_images", ("angle-3.jpg", b"img3", "image/jpeg")),
            ("extra_images", ("angle-4.jpg", b"img4", "image/jpeg")),
        ],
        headers=auth_header,
    )
    assert resp.status_code == 400
    assert "3 photos" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_identify_endpoint_validates_each_image(client, seeded_db, auth_header):
    """Validation applies to every upload, not just the first: a bad extra
    angle (oversized or wrong content type) is rejected."""
    resp = await client.post(
        "/api/plants/identify",
        files=[
            ("image", ("plant.jpg", b"img1", "image/jpeg")),
            ("extra_images", ("angle-2.txt", b"img2", "text/plain")),
        ],
        headers=auth_header,
    )
    assert resp.status_code == 400
    assert "Unknown image format" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_commit_returns_prefill_for_known_species(client, seeded_db, auth_header, tmp_path, monkeypatch):
    """When species is in catalog, commit returns enriched payload from cache (no external lookup)."""
    monkeypatch.setattr("routers.plant_id._save_identify_photo", lambda image_bytes: "photos/test.jpg")

    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT, common_name_en TEXT, care_thresholds TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_nl, common_name_en, care_thresholds) "
        "VALUES (7, 'Monstera deliciosa', 'Gatenplant', 'Swiss cheese plant', '{\"min_temp_c\": 10}')"
    )
    await seeded_db.commit()

    fake_photo = base64.b64encode(b"\xff\xd8\xff\xe0fake-jpeg-bytes").decode("ascii")
    resp = await client.post(
        "/api/plants/identify/commit",
        json={"scientific_name": "Monstera deliciosa", "photo_base64": fake_photo},
        headers=auth_header,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["species_id"] == 7
    assert body["name_suggested"] == "Gatenplant"  # default lang=nl
    assert body["name_nl_suggested"] == "Gatenplant"
    assert body["scientific_name"] == "Monstera deliciosa"
    assert body["care_thresholds"] == {"min_temp_c": 10}
    # Photo storage is patched out (it goes to R2 in production); the endpoint
    # returns whatever path the storage layer produced.
    assert body["photo_path"] == "photos/test.jpg"


@pytest.mark.asyncio
async def test_commit_suggests_english_name_for_english_ui(client, seeded_db, auth_header, monkeypatch):
    """?lang=en → name_suggested is the English catalog name, so English users
    no longer get Dutch names saved into their journal/garden (language audit)."""
    monkeypatch.setattr("routers.plant_id._save_identify_photo", lambda image_bytes: "photos/test.jpg")

    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT, common_name_en TEXT, care_thresholds TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_nl, common_name_en) "
        "VALUES (7, 'Mahonia aquifolium', 'Mahonie', 'Oregon grape')"
    )
    await seeded_db.commit()

    fake_photo = base64.b64encode(b"\xff\xd8\xff\xe0fake-jpeg-bytes").decode("ascii")
    resp = await client.post(
        "/api/plants/identify/commit?lang=en",
        json={"scientific_name": "Mahonia aquifolium", "photo_base64": fake_photo},
        headers=auth_header,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name_suggested"] == "Oregon grape"
    assert body["name_nl_suggested"] == "Mahonie"  # deprecated field keeps old shape


@pytest.mark.asyncio
async def test_commit_triggers_enrichment_for_unknown_species(client, seeded_db, auth_header, tmp_path, monkeypatch):
    """When species is not in catalog, commit triggers the species pipeline."""
    monkeypatch.setattr("routers.plant_id._save_identify_photo", lambda image_bytes: "photos/test.jpg")
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT, common_name_en TEXT, care_thresholds TEXT)"
    )
    await seeded_db.commit()

    async def fake_enrichment(db, scientific_name):
        await db.execute(
            "INSERT INTO plant_species (id, latin_name, common_name_nl, common_name_en, care_thresholds) "
            "VALUES (99, ?, 'Onbekende soort', 'Unknown', '{\"min_temp_c\": 5}')",
            (scientific_name,),
        )
        await db.commit()
        return 99

    monkeypatch.setattr("routers.plant_id._enrich_species_if_missing", fake_enrichment)

    fake_photo = base64.b64encode(b"\xff\xd8\xff\xe0jpg").decode("ascii")
    resp = await client.post(
        "/api/plants/identify/commit",
        json={"scientific_name": "Rare planticus", "photo_base64": fake_photo},
        headers=auth_header,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["species_id"] == 99
    assert body["scientific_name"] == "Rare planticus"


@pytest.mark.asyncio
async def test_commit_rejects_unknown_species_on_enrichment_failure(client, seeded_db, auth_header, tmp_path, monkeypatch):
    """If species pipeline returns None, return 404."""
    monkeypatch.setattr("routers.plant_id._save_identify_photo", lambda image_bytes: "photos/test.jpg")
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT, common_name_en TEXT, care_thresholds TEXT)"
    )
    await seeded_db.commit()

    async def fake_enrichment(db, scientific_name):
        return None
    monkeypatch.setattr("routers.plant_id._enrich_species_if_missing", fake_enrichment)

    fake_photo = base64.b64encode(b"jpg").decode("ascii")
    resp = await client.post(
        "/api/plants/identify/commit",
        json={"scientific_name": "Totally fake species", "photo_base64": fake_photo},
        headers=auth_header,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_commit_backfills_missing_english_name_for_known_species(
    client, seeded_db, auth_header, monkeypatch
):
    """Known species with only NL name should be repaired before later plant lists render it."""
    monkeypatch.setattr("routers.plant_id._save_identify_photo", lambda image_bytes: "photos/test.jpg")
    await seeded_db.execute(
        """
        CREATE TABLE IF NOT EXISTS plant_species (
            id INTEGER PRIMARY KEY,
            latin_name TEXT,
            common_name_nl TEXT,
            common_name_en TEXT,
            phenology_json TEXT,
            care_thresholds TEXT,
            updated_at TEXT
        )
        """
    )
    await seeded_db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_nl, common_name_en, care_thresholds) "
        "VALUES (7, 'Vaccinium corymbosum', 'Blauwe bes', NULL, '{\"min_temp_c\": -5}')"
    )
    await seeded_db.commit()

    async def fake_names(name):
        return {
            "common_name_nl": "Blauwe bes",
            "common_name_en": "Blueberry",
            "latin_name": "Vaccinium corymbosum",
        }

    # The commit hot path uses the fast names-only call; the heavy phenology
    # generation is deferred (no-op under pytest).
    monkeypatch.setattr("species_service._generate_names", fake_names)

    fake_photo = base64.b64encode(b"\xff\xd8\xff\xe0jpg").decode("ascii")
    resp = await client.post(
        "/api/plants/identify/commit",
        json={"scientific_name": "Vaccinium corymbosum", "photo_base64": fake_photo},
        headers=auth_header,
    )

    assert resp.status_code == 200, resp.text
    row = (await seeded_db.execute_fetchall(
        "SELECT common_name_en FROM plant_species WHERE id = 7"
    ))[0]
    assert row["common_name_en"] == "Blueberry"

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
    """When top candidate is between 0.10 and 0.30, low_confidence is true."""
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
    """PlantIdQuotaExceeded → HTTP 503 with Dutch detail."""
    with patch("routers.plant_id.identify", new=AsyncMock(side_effect=PlantIdQuotaExceeded())):
        resp = await client.post(
            "/api/plants/identify",
            files={"image": ("plant.jpg", b"img", "image/jpeg")},
            headers=auth_header,
        )
    assert resp.status_code == 503
    assert "Identificatie tijdelijk" in resp.json()["detail"]


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
async def test_commit_returns_prefill_for_known_species(client, seeded_db, auth_header, tmp_path, monkeypatch):
    """When species is in catalog, commit returns enriched payload from cache (no external lookup)."""
    monkeypatch.setattr("routers.plant_id._PHOTOS_DIR", str(tmp_path))

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
    assert body["name_nl_suggested"] == "Gatenplant"
    assert body["scientific_name"] == "Monstera deliciosa"
    assert body["care_thresholds"] == {"min_temp_c": 10}
    assert body["photo_path"].startswith("/api/photos/identify_")
    saved_filename = body["photo_path"].rsplit("/", 1)[-1]
    assert (tmp_path / saved_filename).exists()


@pytest.mark.asyncio
async def test_commit_triggers_enrichment_for_unknown_species(client, seeded_db, auth_header, tmp_path, monkeypatch):
    """When species is not in catalog, commit triggers the species pipeline."""
    monkeypatch.setattr("routers.plant_id._PHOTOS_DIR", str(tmp_path))
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
    monkeypatch.setattr("routers.plant_id._PHOTOS_DIR", str(tmp_path))
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

"""Public garden atlas (#803): opt-in flag + anonymized read endpoint.

Covers the privacy contract from
docs/plans/2026-05-27-public-gardens-and-biodiversity.md:
- only opt-in outdoor maps appear; private maps never leak (household isolation)
- no account/household PII, no exact GPS (rounded to 2 decimals)
- map photos stay private unless photos_public is also on
- browse filters: city, month, min_score
"""
import json

import pytest
import pytest_asyncio

SCORE_CANVAS = json.dumps({"scale_px_per_m": 46, "canvas_w": 680, "canvas_h": 680})


@pytest_asyncio.fixture
async def atlas_db(seeded_db):
    """seeded_db plus the atlas-only schema.

    The shared conftest maps table is deliberately minimal (other tests ALTER
    it for their own needs), so the atlas columns are added here instead.
    """
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS plant_species ("
        " id INTEGER PRIMARY KEY, slug TEXT, common_name_nl TEXT, common_name_en TEXT,"
        " latin_name TEXT, native_to_nl INTEGER, invasive_nl INTEGER,"
        " flowering_months TEXT, pollinator_value INTEGER)"
    )
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS zones ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER NOT NULL,"
        " name TEXT NOT NULL, zone_type TEXT NOT NULL, sun_exposure TEXT,"
        " boundary TEXT NOT NULL, color TEXT, sort_order INTEGER DEFAULT 0)"
    )
    await seeded_db.execute(
        "CREATE TABLE IF NOT EXISTS ground_zones ("
        " id TEXT PRIMARY KEY, map_id INTEGER NOT NULL, name TEXT NOT NULL,"
        " zone_type TEXT NOT NULL, polygon TEXT NOT NULL, soil_note TEXT)"
    )
    for col in (
        "slug TEXT",
        "svg_file TEXT",
        "viewbox TEXT",
        "scale_info TEXT",
        "sort_order INTEGER DEFAULT 0",
        "bearing DOUBLE PRECISION DEFAULT 0",
        "canvas_data TEXT",
        "lat DOUBLE PRECISION",
        "lon DOUBLE PRECISION",
        "streek_slug TEXT",
        "streek_source TEXT DEFAULT 'auto'",
        "is_public INTEGER NOT NULL DEFAULT 0",
        "photos_public INTEGER NOT NULL DEFAULT 0",
        "place_name TEXT",
        "country_code TEXT",
        "thumbnail_file TEXT",
        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
    ):
        await seeded_db.execute(f"ALTER TABLE maps ADD COLUMN {col}")
    await seeded_db.commit()
    return seeded_db


async def _seed_map(
    db,
    *,
    map_id: int,
    name: str,
    slug: str,
    household_id: int = 1,
    is_public: int = 0,
    photos_public: int = 0,
    place_name: str | None = "Amsterdam",
    country_code: str | None = "NL",
    lat: float | None = 52.3715,
    lon: float | None = 4.8499,
    streek_slug: str | None = None,
    thumbnail_file: str | None = None,
):
    await db.execute(
        """INSERT INTO maps (id, name, slug, map_type, household_id, canvas_data,
                            svg_file, viewbox, lat, lon, streek_slug, is_public,
                            photos_public, place_name, country_code, thumbnail_file)
           VALUES (?, ?, ?, 'outdoor', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (map_id, name, slug, household_id, SCORE_CANVAS,
         f"maps/{slug}.svg", "0 0 680 680", lat, lon, streek_slug,
         is_public, photos_public, place_name, country_code, thumbnail_file),
    )


async def _seed_species(db, *, species_id: int, latin="Plantus testus",
                        native=0, pollinator=0, months=None):
    await db.execute(
        """INSERT INTO plant_species (id, slug, common_name_nl, common_name_en,
                                      latin_name, native_to_nl, invasive_nl,
                                      flowering_months, pollinator_value)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)""",
        (species_id, f"sp-{species_id}", "Testplant", "Test plant", latin,
         native, json.dumps(months or []), pollinator),
    )


async def _seed_plant(db, *, plant_id: int, map_id: int, species_id: int,
                      name: str, map_x: float = 100.0, map_y: float = 120.0,
                      photo_path: str | None = None):
    await db.execute(
        """INSERT INTO plants (id, name, map_id, species_id, map_x, map_y,
                               is_active, photo_path)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)""",
        (plant_id, name, map_id, species_id, map_x, map_y, photo_path),
    )


async def _public_slugs(client) -> list[str]:
    resp = await client.get("/api/atlas/gardens")
    assert resp.status_code == 200
    return [g["slug"] for g in resp.json()]


@pytest.mark.asyncio
async def test_public_list_only_shows_opt_in_gardens(atlas_db, client):
    await _seed_map(atlas_db, map_id=1, name="Public Garden", slug="public-garden", is_public=1)
    await _seed_map(atlas_db, map_id=2, name="Private Garden", slug="private-garden", is_public=0)
    await atlas_db.commit()

    slugs = await _public_slugs(client)
    assert "public-garden" in slugs
    assert "private-garden" not in slugs


@pytest.mark.asyncio
async def test_public_list_is_anonymous_and_gps_rounded(atlas_db, client):
    await _seed_map(atlas_db, map_id=1, name="Public Garden", slug="public-garden",
                    is_public=1, lat=52.37156, lon=4.84991)
    await atlas_db.commit()

    resp = await client.get("/api/atlas/gardens")
    garden = resp.json()[0]
    # No internal/household/account fields, no exact GPS.
    for forbidden in ("id", "household_id", "email", "account", "lat", "lon"):
        assert forbidden not in garden, f"leaked field: {forbidden}"
    assert garden["approx_lat"] == 52.37
    assert garden["approx_lon"] == 4.85
    assert garden["city"] == "Amsterdam"


@pytest.mark.asyncio
async def test_detail_404_for_private_or_unknown(atlas_db, client):
    await _seed_map(atlas_db, map_id=1, name="Private Garden", slug="private-garden", is_public=0)
    await atlas_db.commit()

    assert (await client.get("/api/atlas/gardens/private-garden")).status_code == 404
    assert (await client.get("/api/atlas/gardens/nope")).status_code == 404


@pytest.mark.asyncio
async def test_detail_has_layout_without_photos_until_opted_in(atlas_db, client):
    await _seed_map(atlas_db, map_id=1, name="Public Garden", slug="public-garden",
                    is_public=1, photos_public=0, thumbnail_file=None)
    await atlas_db.execute(
        "INSERT INTO zones (map_id, name, zone_type, boundary, color, sort_order) "
        "VALUES (1, 'Border', 'flowerbed', '10,10 20,10 20,20 10,20', '#88aa66', 1)"
    )
    await atlas_db.execute(
        "INSERT INTO ground_zones (id, map_id, name, zone_type, polygon) "
        "VALUES ('gz-1', 1, 'Bed', 'soil', '[[0,0],[10,0],[10,10],[0,10]]')"
    )
    await _seed_species(atlas_db, species_id=1, native=1, pollinator=2, months=[5, 6])
    await _seed_plant(atlas_db, plant_id=1, map_id=1, species_id=1,
                      name="Tulp", photo_path="https://cdn.example/secret.jpg")
    await atlas_db.commit()

    resp = await client.get("/api/atlas/gardens/public-garden")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["slug"] == "public-garden"
    assert len(detail["zones"]) == 1
    assert detail["zones"][0]["name"] == "Border"
    assert len(detail["ground_zones"]) == 1
    assert detail["ground_zones"][0]["id"] == "gz-1"
    assert len(detail["plants"]) == 1
    plant = detail["plants"][0]
    assert plant["latin_name"] == "Plantus testus"
    assert plant["map_x"] == 100.0
    # Photos stay private until the owner opts in.
    assert plant["photo_path"] is None
    assert detail["thumbnail_file"] is None
    assert detail["flower_months"] == [5, 6]


@pytest.mark.asyncio
async def test_photos_exposed_when_opted_in(atlas_db, client):
    await _seed_map(atlas_db, map_id=1, name="Public Garden", slug="public-garden",
                    is_public=1, photos_public=1, thumbnail_file="thumb.svg")
    await _seed_species(atlas_db, species_id=1)
    await _seed_plant(atlas_db, plant_id=1, map_id=1, species_id=1,
                      name="Tulp", photo_path="https://cdn.example/plant.jpg")
    await atlas_db.commit()

    detail = (await client.get("/api/atlas/gardens/public-garden")).json()
    assert detail["thumbnail_file"] == "thumb.svg"
    assert detail["plants"][0]["photo_path"] == "https://cdn.example/plant.jpg"


@pytest.mark.asyncio
async def test_city_filter(atlas_db, client):
    await _seed_map(atlas_db, map_id=1, name="A", slug="ams", is_public=1, place_name="Amsterdam")
    await _seed_map(atlas_db, map_id=2, name="B", slug="utrecht", is_public=1, place_name="Utrecht")
    await atlas_db.commit()

    slugs = [g["slug"] for g in (await client.get("/api/atlas/gardens?city=amsterdam")).json()]
    assert slugs == ["ams"]


@pytest.mark.asyncio
async def test_month_filter(atlas_db, client):
    await _seed_map(atlas_db, map_id=1, name="A", slug="june-garden", is_public=1)
    await _seed_species(atlas_db, species_id=1, months=[5, 6])
    await _seed_plant(atlas_db, plant_id=1, map_id=1, species_id=1, name="June")
    await _seed_map(atlas_db, map_id=2, name="B", slug="winter-garden", is_public=1)
    await _seed_species(atlas_db, species_id=2, months=[1, 2])
    await _seed_plant(atlas_db, plant_id=2, map_id=2, species_id=2, name="Winter")
    await atlas_db.commit()

    slugs = [g["slug"] for g in (await client.get("/api/atlas/gardens?month=6")).json()]
    assert slugs == ["june-garden"]


@pytest.mark.asyncio
async def test_min_score_filter(atlas_db, client):
    # A: 3 native, pollinator-3 species → a real score. B: empty garden → 0.
    await _seed_map(atlas_db, map_id=1, name="A", slug="rich-garden", is_public=1)
    await _seed_species(atlas_db, species_id=1, native=1, pollinator=3, months=[4, 5, 6, 7])
    await _seed_species(atlas_db, species_id=2, native=1, pollinator=3, months=[5, 6, 7, 8])
    await _seed_species(atlas_db, species_id=3, native=1, pollinator=3, months=[6, 7, 8, 9])
    for pid in (1, 2, 3):
        await _seed_plant(atlas_db, plant_id=pid, map_id=1, species_id=pid, name=f"P{pid}")
    await _seed_map(atlas_db, map_id=2, name="B", slug="empty-garden", is_public=1)
    await atlas_db.commit()

    all_slugs = [g["slug"] for g in (await client.get("/api/atlas/gardens")).json()]
    rich = [g for g in all_slugs if g == "rich-garden"]
    assert len(rich) == 1  # sanity: rich garden listed
    filtered = [g["slug"] for g in (await client.get("/api/atlas/gardens?min_score=5")).json()]
    assert "rich-garden" in filtered
    assert "empty-garden" not in filtered


@pytest.mark.asyncio
async def test_toggle_public_controls_visibility(atlas_db, client, auth_header):
    await _seed_map(atlas_db, map_id=1, name="Garden", slug="garden", is_public=0)
    await atlas_db.commit()
    assert "garden" not in await _public_slugs(client)

    resp = await client.put("/api/maps/1", json={"is_public": True}, headers=auth_header)
    assert resp.status_code == 200
    assert resp.json()["is_public"] is True
    assert "garden" in await _public_slugs(client)

    resp = await client.put("/api/maps/1", json={"is_public": False}, headers=auth_header)
    assert resp.status_code == 200
    assert resp.json()["is_public"] is False
    assert "garden" not in await _public_slugs(client)

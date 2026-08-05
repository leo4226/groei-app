"""Field journal plant discoveries."""

import base64
import json

import pytest
import pytest_asyncio


DISCOVERIES_SCHEMA = """
    CREATE TABLE plant_discoveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        species_id INTEGER,
        common_name TEXT NOT NULL,
        latin_name TEXT,
        thumbnail_url TEXT,
        notes TEXT,
        location_lat REAL,
        location_lon REAL,
        place_name TEXT,
        country_code TEXT,
        share_token TEXT,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        common_name_nl TEXT NOT NULL,
        common_name_en TEXT,
        latin_name TEXT,
        phenology_json TEXT,
        fun_fact_nl TEXT,
        fun_fact_en TEXT
    );
"""


class FakeStorage:
    def __init__(self):
        self.puts = []

    def put(self, key: str, data: bytes, content_type: str) -> str:
        self.puts.append((key, data, content_type))
        return f"https://cdn.test/{key}"


@pytest_asyncio.fixture
async def discoveries_db(seeded_db):
    db = seeded_db
    await db.executescript(DISCOVERIES_SCHEMA)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_save_discovery_uploads_captured_photo_data(client, discoveries_db, auth_header, monkeypatch):
    from routers import discoveries

    storage = FakeStorage()
    monkeypatch.setattr(discoveries, "_get_storage", lambda: storage)
    payload = base64.b64encode(b"fake jpg").decode("ascii")

    res = await client.post(
        "/api/discover",
        headers=auth_header,
        json={
            "species_id": 123,
            "common_name": "Dandelion",
            "latin_name": "Taraxacum officinale",
            "thumbnail_data": f"data:image/jpeg;base64,{payload}",
        },
    )

    assert res.status_code == 201
    body = res.json()
    assert body["thumbnail_url"].startswith("https://cdn.test/field-journal/")
    assert storage.puts == [
        (storage.puts[0][0], b"fake jpg", "image/jpeg"),
    ]

    list_res = await client.get("/api/discover", headers=auth_header)
    assert list_res.status_code == 200
    assert list_res.json()[0]["thumbnail_url"] == body["thumbnail_url"]


@pytest.mark.asyncio
async def test_list_discoveries_enriches_species_names_facts_and_location(client, discoveries_db, auth_header):
    await discoveries_db.execute(
        """INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name, phenology_json)
           VALUES (?, ?, ?, ?, ?)""",
        (
            123,
            "Jakobskruiskruid",
            "Ragwort",
            "Jacobaea vulgaris",
            json.dumps({
                "interesting_facts_nl": "Rupsen van de sint-jacobsvlinder eten deze plant graag.",
                "interesting_facts_en": "Cinnabar moth caterpillars love this plant.",
            }),
        ),
    )
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries
              (account_id, household_id, species_id, common_name, latin_name, thumbnail_url,
               notes, location_lat, location_lon, place_name, country_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            1,
            1,
            123,
            "Jakobskruiskruid",
            "Jacobaea vulgaris",
            "https://cdn.test/discovery.jpg",
            "Near the canal",
            52.3715,
            4.8499,
            # A stored place also keeps the geocode backfill task inert in tests
            "Amsterdam",
            "NL",
        ),
    )
    await discoveries_db.commit()

    res = await client.get("/api/discover", headers=auth_header)

    assert res.status_code == 200
    item = res.json()[0]
    assert item["common_name"] == "Jakobskruiskruid"
    assert item["species_common_name_nl"] == "Jakobskruiskruid"
    assert item["species_common_name_en"] == "Ragwort"
    assert item["fun_fact_nl"] == "Rupsen van de sint-jacobsvlinder eten deze plant graag."
    assert item["fun_fact_en"] == "Cinnabar moth caterpillars love this plant."
    assert item["notes"] == "Near the canal"
    assert item["location_lat"] == 52.3715
    assert item["location_lon"] == 4.8499
    assert item["place_name"] == "Amsterdam"
    assert item["country_code"] == "NL"

@pytest.mark.asyncio
async def test_list_prefers_cached_fun_fact_columns_over_empty_phenology(client, discoveries_db, auth_header):
    """Species created by the identify flow have NO phenology_json, but the
    DiscoveryCard caches a generated fact in the fun_fact_* columns — the
    journal must read those (the Oleander/Peer no-fun-fact bug, #589)."""
    await discoveries_db.execute(
        """INSERT INTO plant_species (id, common_name_nl, latin_name, phenology_json, fun_fact_nl, fun_fact_en)
           VALUES (7, 'Oleander', 'Nerium oleander', NULL, 'Alle delen zijn giftig.', 'All parts are poisonous.')""",
    )
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries (account_id, household_id, species_id, common_name, place_name, country_code)
           VALUES (1, 1, 7, 'Oleander', 'Noordwijk', 'NL')""",
    )
    await discoveries_db.commit()

    res = await client.get("/api/discover", headers=auth_header)
    assert res.status_code == 200
    item = res.json()[0]
    assert item["fun_fact_nl"] == "Alle delen zijn giftig."
    assert item["fun_fact_en"] == "All parts are poisonous."


@pytest.mark.asyncio
async def test_list_scope_mine_filters_to_calling_account(client, discoveries_db, auth_header):
    """scope=mine returns only the caller's own discoveries; the default
    (all) returns every find in the household (#789)."""
    await discoveries_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash) "
        "VALUES (2, 1, 'lissy@example.com', 'Lissy', 'x')"
    )
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries (id, account_id, household_id, common_name, discovered_at)
           VALUES (?, ?, ?, ?, ?)""",
        (11, 1, 1, "Leon's find", "2026-08-01 10:00:00"),
    )
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries (id, account_id, household_id, common_name, discovered_at)
           VALUES (?, ?, ?, ?, ?)""",
        (12, 2, 1, "Lissy's find", "2026-08-02 10:00:00"),
    )
    await discoveries_db.commit()

    # Default scope: every find in the household
    res = await client.get("/api/discover", headers=auth_header)
    assert res.status_code == 200
    assert {d["common_name"] for d in res.json()} == {"Leon's find", "Lissy's find"}

    # scope=all: explicit form of the default
    res = await client.get("/api/discover?scope=all", headers=auth_header)
    assert res.status_code == 200
    assert len(res.json()) == 2

    # scope=mine: only the calling account's find
    res = await client.get("/api/discover?scope=mine", headers=auth_header)
    assert res.status_code == 200
    assert [d["common_name"] for d in res.json()] == ["Leon's find"]

    # The other household member sees only her own find
    from auth import create_token

    lissy_header = {"Authorization": f"Bearer {create_token(account_id=2, household_id=1)}"}
    res = await client.get("/api/discover?scope=mine", headers=lissy_header)
    assert res.status_code == 200
    assert [d["common_name"] for d in res.json()] == ["Lissy's find"]


@pytest.mark.asyncio
async def test_list_scope_rejects_unknown_values(client, discoveries_db, auth_header):
    res = await client.get("/api/discover?scope=everyone", headers=auth_header)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_share_mints_stable_token_and_scopes_to_household(client, discoveries_db, auth_header):
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries (id, account_id, household_id, common_name)
           VALUES (1, 1, 1, 'Peer'), (2, 9, 999, 'Andermans vondst')""",
    )
    await discoveries_db.commit()

    res = await client.post("/api/discover/1/share", headers=auth_header)
    assert res.status_code == 200
    url = res.json()["share_url"]
    assert url.startswith("https://floreren.app/s/")
    token = url.rsplit("/", 1)[1]
    assert len(token) >= 10

    # Second share reuses the same token
    res2 = await client.post("/api/discover/1/share", headers=auth_header)
    assert res2.json()["share_url"] == url

    # Another household's discovery is invisible
    res3 = await client.post("/api/discover/2/share", headers=auth_header)
    assert res3.status_code == 404


@pytest.mark.asyncio
async def test_public_share_page_renders_specimen_card(client, discoveries_db, auth_header):
    await discoveries_db.execute(
        """INSERT INTO plant_species (id, common_name_nl, latin_name, fun_fact_nl)
           VALUES (7, 'Oleander', 'Nerium oleander', 'Alle delen zijn giftig.')""",
    )
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries
              (id, account_id, household_id, species_id, common_name, latin_name,
               thumbnail_url, notes, place_name, country_code, share_token, discovered_at)
           VALUES (1, 1, 1, 7, 'Oleander <script>alert(1)</script>', 'Nerium oleander',
                   'https://cdn.test/oleander.jpg', 'geheim veldnotitie', 'Noordwijk', 'NL',
                   'tok_abc123', '2026-07-11 14:00:00')""",
    )
    await discoveries_db.commit()

    res = await client.get("/s/tok_abc123")
    assert res.status_code == 200
    page = res.text
    # The name the owner logged wins (it may be localized to their language);
    # free text is always HTML-escaped, never raw
    assert "Oleander &lt;script&gt;alert(1)&lt;/script&gt;" in page
    assert "<script>alert(1)</script>" not in page
    assert "<em>Nerium oleander</em>" in page
    # Sharer account language is nl (default) → Dutch boilerplate + NL fact
    assert 'lang="nl"' in page
    assert "Alle delen zijn giftig." in page
    assert "Gevonden op" in page and "Wist je dat" in page
    assert "Noordwijk, NL" in page and "11 juli 2026" in page
    assert 'property="og:image" content="https://cdn.test/oleander.jpg"' in page
    assert 'property="og:title"' in page
    # Private parts stay private: no notes, no exact coordinates
    assert "geheim veldnotitie" not in page

    # Unknown token → 404
    res404 = await client.get("/s/nope")
    assert res404.status_code == 404


@pytest.mark.asyncio
async def test_public_share_page_renders_in_sharers_language(client, discoveries_db, auth_header):
    """An English-account owner shares → English boilerplate, EN fact, EN month,
    and the name they logged (not the Dutch catalog name). Issue: share pages
    were hardcoded Dutch regardless of the sharer's language."""
    await discoveries_db.execute("UPDATE accounts SET language = 'en' WHERE id = 1")
    await discoveries_db.execute(
        """INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name, fun_fact_nl, fun_fact_en)
           VALUES (8, 'Mahonie', 'Oregon grape', 'Mahonia aquifolium',
                   'De bessen zijn eetbaar.', 'The berries are edible.')""",
    )
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries
              (id, account_id, household_id, species_id, common_name, latin_name,
               place_name, country_code, share_token, discovered_at)
           VALUES (2, 1, 1, 8, 'Oregon grape', 'Mahonia aquifolium',
                   'Amsterdam', 'NL', 'tok_en_456', '2026-07-11 14:00:00')""",
    )
    await discoveries_db.commit()

    res = await client.get("/s/tok_en_456")
    assert res.status_code == 200
    page = res.text
    assert 'lang="en"' in page
    assert "Oregon grape" in page and "Mahonie" not in page
    assert "The berries are edible." in page and "De bessen zijn eetbaar." not in page
    assert "Found on 11 July 2026 in Amsterdam, NL" in page
    assert "Did you know" in page and "Wist je dat" not in page
    assert "Shared from a personal field guide" in page
    assert "Gedeeld uit een persoonlijke veldgids" not in page
    assert "Discover Floreren" in page


@pytest.mark.asyncio
async def test_update_discovery_location_sets_coordinates_and_scopes_to_household(
    client, discoveries_db, auth_header,
):
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries (id, account_id, household_id, common_name)
           VALUES (1, 1, 1, 'Hawaïaanse witte hibiscus'),
                  (2, 9, 999, 'Private discovery')""",
    )
    await discoveries_db.commit()

    response = await client.patch(
        "/api/discover/1/location",
        headers=auth_header,
        json={"location_lat": 38.7223, "location_lon": -9.1393},
    )

    assert response.status_code == 200
    assert response.json()["location_lat"] == 38.7223
    assert response.json()["location_lon"] == -9.1393

    other_household = await client.patch(
        "/api/discover/2/location",
        headers=auth_header,
        json={"location_lat": 38.7223, "location_lon": -9.1393},
    )
    assert other_household.status_code == 404

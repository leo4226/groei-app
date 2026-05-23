# Plant Detection — Pl@ntNet Identify Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a photo-based plant identification flow: snap one photo → see top 3 species candidates from Pl@ntNet → pick one → land on AddPlant with name, species, icon, care thresholds, and photo pre-filled.

**Architecture:** A new backend service `services/plant_id.py` wraps the Pl@ntNet API. Two new endpoints — `POST /api/plants/identify` (multipart image upload, returns candidates) and `POST /api/plants/identify/commit` (returns full pre-fill payload, reuses the existing species-enrichment pipeline for unknown species). A new frontend page `IdentifyPlant.tsx` runs a three-step camera/identifying/results state machine and navigates to AddPlant with pre-fill state. AddPlant gains an entry-choice screen with Detection as the primary option.

**Tech Stack:** Python 3.11+ / FastAPI / aiosqlite / httpx (already a dep), React 19 / TypeScript / Vite / Zustand, browser MediaDevices API for camera capture, Pl@ntNet API v2.

**Reference:** `docs/specs/in-progress/2026-05-17-plant-detection-design.md`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `groei/backend/services/plant_id.py` | **Create** | Wraps Pl@ntNet API. Pure function `identify()` + dataclass `IdCandidate` + custom exceptions. |
| `groei/backend/routers/plant_id.py` | **Create** | `POST /plants/identify` + `POST /plants/identify/commit` |
| `groei/backend/main.py` | Modify | Register new router |
| `groei/backend/tests/fixtures/plantnet_response.json` | **Create** | Recorded Pl@ntNet response for unit tests (no live API in CI) |
| `groei/backend/tests/test_plant_id.py` | **Create** | Unit tests for `plant_id.identify()` |
| `groei/backend/tests/test_plant_id_endpoint.py` | **Create** | Integration tests for both endpoints |
| `.env.example` | Create or modify | Document `PLANTNET_API_KEY` env var |
| `groei/frontend/src/types/index.ts` | Modify | Add `PlantIdCandidate`, `IdentifyResponse`, `IdentifyCommitResult` types |
| `groei/frontend/src/api/client.ts` | Modify | Add `identifyPlant()` and `commitIdentification()` API methods |
| `groei/frontend/src/pages/IdentifyPlant.tsx` | **Create** | Three-step camera/identifying/results state machine |
| `groei/frontend/src/components/identify/IdentifyCamera.tsx` | **Create** | Camera viewfinder + capture button |
| `groei/frontend/src/components/identify/IdentifyResults.tsx` | **Create** | Top-3 candidate cards + low-confidence banner + no-match screen + powered-by footer |
| `groei/frontend/src/pages/AddPlant.tsx` | Modify | Entry-choice screen (📸 / 🔍 / ✏️) + pre-fill handler when navigated from /identify |
| `groei/frontend/src/App.tsx` | Modify | Register `/identify` route |
| `groei/frontend/src/i18n/nl.ts` | Modify | Add `identify.*` and `addPlant.entry.*` strings |
| `groei/frontend/src/i18n/en.ts` | Modify | English equivalents |
| `groei/frontend/src/i18n/translations.ts` | Modify | Type entries for the new strings |

---

### Task 1: Add `PLANTNET_API_KEY` to env

**Files:**
- Create or modify: `.env.example` at repo root or wherever the existing one lives
- Modify: `groei/backend/.env` (local-only, gitignored — the user already has the key)

- [ ] **Step 1: Find the existing .env files**

```bash
cd "C:/Users/leon_/Projects/Plant APP" && find . -maxdepth 3 -name ".env*" -not -path "*/node_modules/*" -not -path "*/.venv/*" 2>&1 | head
```

- [ ] **Step 2: Add the key to .env (local)**

If `groei/backend/.env` exists, append:

```
PLANTNET_API_KEY=2b10JSXuwQmNaKQLJ8waCB0D7
```

If it doesn't exist, create it with at least that line. Do NOT commit this file — it must remain gitignored. Verify with `git status` (the file should not appear as untracked).

- [ ] **Step 3: Add the key to .env.example if one exists**

If a `.env.example` template exists in `groei/backend/` or the repo root, append:

```
PLANTNET_API_KEY=
```

If no `.env.example` exists, do not create one (don't introduce a new pattern unilaterally).

- [ ] **Step 4: No commit yet**

The .env edits aren't committed (gitignored). The plan continues to Task 2.

---

### Task 2: PlantNet API client — record a real response as a fixture

**Files:**
- Create: `groei/backend/tests/fixtures/plantnet_response.json`

We need a real Pl@ntNet response to write tests against. This task captures one once, then tests run offline against the fixture forever.

- [ ] **Step 1: Pick a test image**

Use any clear plant photo. A good choice is `groei/backend/photos/<existing-plant-photo>.jpg` if any user-uploaded plant photo exists. Otherwise use any public-domain plant image. Note its absolute path.

- [ ] **Step 2: Make a real Pl@ntNet API call to record the response**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && \
.venv/Scripts/python.exe -c "
import os, json, httpx
from dotenv import load_dotenv
load_dotenv()
key = os.environ['PLANTNET_API_KEY']
with open(r'PATH_TO_TEST_IMAGE.jpg', 'rb') as f:
    image_bytes = f.read()
r = httpx.post(
    f'https://my-api.plantnet.org/v2/identify/all?api-key={key}',
    files={'images': ('plant.jpg', image_bytes, 'image/jpeg')},
    data={'organs': 'auto'},
    timeout=30.0,
)
print('status:', r.status_code)
with open('tests/fixtures/plantnet_response.json', 'w', encoding='utf-8') as out:
    json.dump(r.json(), out, indent=2, ensure_ascii=False)
print('saved fixture')
"
```

Replace `PATH_TO_TEST_IMAGE.jpg` with the real path. Verify status is 200 and the fixture is created. Inspect the JSON to see the actual structure — fields like `results[].score`, `results[].species.scientificNameWithoutAuthor`, `results[].species.commonNames`, `results[].images[].url` (or similar — the actual shape is what we'll code against). Note any discrepancies from the spec's assumed field names.

- [ ] **Step 3: Commit the fixture**

```bash
mkdir -p groei/backend/tests/fixtures
git add groei/backend/tests/fixtures/plantnet_response.json
git commit -m "test(plant-id): record Pl@ntNet API response as test fixture"
```

---

### Task 3: PlantNet client service — dataclass + exceptions

**Files:**
- Create: `groei/backend/services/plant_id.py` (dataclass + exceptions only — function body in Task 4)
- Create: `groei/backend/tests/test_plant_id.py`

- [ ] **Step 1: Write the failing test**

Create `groei/backend/tests/test_plant_id.py`:

```python
"""Unit tests for the Pl@ntNet identification service."""
import pytest
from services.plant_id import IdCandidate, PlantIdQuotaExceeded, PlantIdServiceError


def test_id_candidate_dataclass_fields():
    """IdCandidate exposes the documented fields."""
    c = IdCandidate(
        scientific_name="Monstera deliciosa",
        scientific_authorship="Liebm.",
        common_names=["Swiss cheese plant"],
        confidence=0.89,
        genus="Monstera",
        family="Araceae",
        plantnet_image_url="https://bs.plantnet.org/image/o/abc.jpg",
    )
    assert c.scientific_name == "Monstera deliciosa"
    assert c.confidence == 0.89
    assert c.common_names == ["Swiss cheese plant"]


def test_exceptions_are_distinct():
    """Quota and service error are separate exception classes."""
    assert issubclass(PlantIdQuotaExceeded, Exception)
    assert issubclass(PlantIdServiceError, Exception)
    assert not issubclass(PlantIdQuotaExceeded, PlantIdServiceError)
    assert not issubclass(PlantIdServiceError, PlantIdQuotaExceeded)
```

- [ ] **Step 2: Run test, confirm import failure**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id.py -v
```

Expected: `ImportError: cannot import name 'IdCandidate' from 'services.plant_id'`.

- [ ] **Step 3: Create the file with the dataclass and exceptions**

Create `groei/backend/services/plant_id.py`:

```python
"""Pl@ntNet API client for plant identification.

Wraps the free Pl@ntNet identify endpoint. Pure (stateless, no DB),
reads PLANTNET_API_KEY from env at import.
"""
from dataclasses import dataclass


@dataclass
class IdCandidate:
    """A single species candidate returned by Pl@ntNet."""
    scientific_name: str
    scientific_authorship: str | None
    common_names: list[str]
    confidence: float                # 0.0 – 1.0
    genus: str | None
    family: str | None
    plantnet_image_url: str | None


class PlantIdQuotaExceeded(Exception):
    """Raised when Pl@ntNet returns HTTP 429 (daily quota hit)."""


class PlantIdServiceError(Exception):
    """Raised when Pl@ntNet is unreachable or returns a non-2xx, non-429 status."""
```

- [ ] **Step 4: Run test, confirm pass**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/plant_id.py groei/backend/tests/test_plant_id.py
git commit -m "feat(plant-id): IdCandidate dataclass + service exceptions"
```

---

### Task 4: PlantNet `identify()` function

**Files:**
- Modify: `groei/backend/services/plant_id.py` (append `identify` function)
- Modify: `groei/backend/tests/test_plant_id.py` (append parsing tests)

- [ ] **Step 1: Write the failing tests**

Append to `groei/backend/tests/test_plant_id.py`:

```python
import json
from pathlib import Path
import httpx
from unittest.mock import patch, AsyncMock
from services.plant_id import identify


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "plantnet_response.json"


@pytest.fixture
def plantnet_payload():
    """Real recorded PlantNet response."""
    with FIXTURE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.asyncio
async def test_identify_parses_top_candidates(plantnet_payload):
    """identify() returns IdCandidate list ranked by confidence."""
    mock_response = httpx.Response(200, json=plantnet_payload)
    with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
        candidates = await identify(b"fake-image-bytes")

    assert len(candidates) > 0
    # Sorted by confidence descending
    for prev, curr in zip(candidates, candidates[1:]):
        assert prev.confidence >= curr.confidence
    # First candidate has the expected shape
    top = candidates[0]
    assert isinstance(top.scientific_name, str) and len(top.scientific_name) > 0
    assert isinstance(top.confidence, float) and 0.0 <= top.confidence <= 1.0
    assert isinstance(top.common_names, list)


@pytest.mark.asyncio
async def test_identify_respects_max_results(plantnet_payload):
    """max_results truncates the candidate list."""
    mock_response = httpx.Response(200, json=plantnet_payload)
    with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
        candidates = await identify(b"img", max_results=2)
    assert len(candidates) <= 2


@pytest.mark.asyncio
async def test_identify_raises_on_429():
    """HTTP 429 raises PlantIdQuotaExceeded."""
    mock_response = httpx.Response(429, json={"message": "Quota exceeded"})
    with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
        with pytest.raises(PlantIdQuotaExceeded):
            await identify(b"img")


@pytest.mark.asyncio
async def test_identify_raises_on_5xx():
    """HTTP 5xx raises PlantIdServiceError."""
    mock_response = httpx.Response(503, text="Service Unavailable")
    with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
        with pytest.raises(PlantIdServiceError):
            await identify(b"img")


@pytest.mark.asyncio
async def test_identify_raises_on_network_failure():
    """httpx RequestError surfaces as PlantIdServiceError."""
    async def boom(*a, **kw):
        raise httpx.ConnectError("network down")
    with patch("services.plant_id._post_plantnet", new=boom):
        with pytest.raises(PlantIdServiceError):
            await identify(b"img")


@pytest.mark.asyncio
async def test_identify_returns_empty_when_no_results():
    """Pl@ntNet returning empty results gives empty list, not None or raise."""
    mock_response = httpx.Response(200, json={"results": [], "remainingIdentificationRequests": 499})
    with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
        candidates = await identify(b"img")
    assert candidates == []
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id.py -v
```

Expected: 6 new tests fail (ImportError for `identify`).

- [ ] **Step 3: Implement `identify` and the `_post_plantnet` seam**

Append to `groei/backend/services/plant_id.py`:

```python
import os
import httpx
from typing import Iterable


_PLANTNET_URL = "https://my-api.plantnet.org/v2/identify/all"


async def _post_plantnet(image_bytes: bytes, organs: list[str], api_key: str) -> httpx.Response:
    """Single seam for the HTTP call — patchable in tests."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await client.post(
            _PLANTNET_URL,
            params={"api-key": api_key},
            files=[("images", ("plant.jpg", image_bytes, "image/jpeg"))],
            data=[("organs", o) for o in organs],
        )


def _parse_candidate(result: dict) -> IdCandidate:
    """Convert one Pl@ntNet result entry into an IdCandidate."""
    species = result.get("species", {})
    images = result.get("images") or []
    return IdCandidate(
        scientific_name=species.get("scientificNameWithoutAuthor", ""),
        scientific_authorship=species.get("scientificNameAuthorship") or None,
        common_names=species.get("commonNames") or [],
        confidence=float(result.get("score", 0.0)),
        genus=(species.get("genus") or {}).get("scientificNameWithoutAuthor"),
        family=(species.get("family") or {}).get("scientificNameWithoutAuthor"),
        plantnet_image_url=(images[0].get("url", {}).get("o") if images else None),
    )


async def identify(
    image_bytes: bytes,
    organs: list[str] | None = None,
    max_results: int = 5,
) -> list[IdCandidate]:
    """Identify a plant from one image via Pl@ntNet.

    Raises:
        PlantIdQuotaExceeded: HTTP 429 from Pl@ntNet.
        PlantIdServiceError: any other non-2xx response or network failure.
    """
    api_key = os.environ.get("PLANTNET_API_KEY", "")
    if not api_key:
        raise PlantIdServiceError("PLANTNET_API_KEY not set")
    organs = organs or ["auto"]

    try:
        response = await _post_plantnet(image_bytes, organs, api_key)
    except httpx.RequestError as e:
        raise PlantIdServiceError(f"network error: {e}") from e

    if response.status_code == 429:
        raise PlantIdQuotaExceeded("Pl@ntNet daily quota exhausted")
    if response.status_code >= 400:
        raise PlantIdServiceError(f"Pl@ntNet returned {response.status_code}")

    payload = response.json()
    results = payload.get("results") or []
    candidates = [_parse_candidate(r) for r in results]
    candidates.sort(key=lambda c: c.confidence, reverse=True)
    return candidates[:max_results]
```

**IMPORTANT — verify the parsing against the real fixture.** Task 2 saved a real Pl@ntNet response. Open `tests/fixtures/plantnet_response.json` and check that field names in `_parse_candidate` match what's actually in the JSON. PlantNet's actual field names may differ slightly from the spec's guesses (`images[0].url.o` is a common variant). Adjust `_parse_candidate` to match the real fixture; the tests above use the fixture as the source of truth.

- [ ] **Step 4: Run tests, confirm pass**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id.py -v
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/plant_id.py groei/backend/tests/test_plant_id.py
git commit -m "feat(plant-id): identify() PlantNet client with error handling"
```

---

### Task 5: `POST /api/plants/identify` endpoint

**Files:**
- Create: `groei/backend/routers/plant_id.py`
- Modify: `groei/backend/main.py` (register router)
- Create: `groei/backend/tests/test_plant_id_endpoint.py`

- [ ] **Step 1: Write the failing test**

Create `groei/backend/tests/test_plant_id_endpoint.py`:

```python
"""HTTP-level tests for the plant identification endpoints."""
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
            plantnet_image_url="https://bs.plantnet.org/image/o/abc.jpg",
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
    # Need plant_species table in the conftest schema — see schema check
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
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id_endpoint.py -v
```

Expected: all tests fail with 404 (router not registered yet).

- [ ] **Step 3: Create the router**

Create `groei/backend/routers/plant_id.py`:

```python
"""HTTP endpoints for plant identification."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.plant_id import identify, PlantIdQuotaExceeded, PlantIdServiceError


router = APIRouter(prefix="/plants", tags=["plant-id"])

_MAX_IMAGE_BYTES = 5 * 1024 * 1024   # 5 MB
_MIN_CONFIDENCE_FOR_RESULT = 0.10    # below this, treat as no match
_LOW_CONFIDENCE_UPPER = 0.30         # 0.10–0.30 triggers the low_confidence flag


class CandidateOut(BaseModel):
    scientific_name: str
    common_names_nl: list[str]
    common_names_en: list[str]
    confidence: float
    species_id: int | None
    thumbnail_url: str | None


class IdentifyResponse(BaseModel):
    candidates: list[CandidateOut]
    low_confidence: bool


def _split_common_names(names: list[str]) -> tuple[list[str], list[str]]:
    """Pl@ntNet returns common names without language tags. Treat all as both
    languages for now; the species enrichment pipeline disambiguates later."""
    return names, names


async def _attach_species_id(db, scientific_name: str) -> int | None:
    rows = await db.execute_fetchall(
        "SELECT id FROM plant_species WHERE latin_name = ? LIMIT 1",
        (scientific_name,),
    )
    return rows[0]["id"] if rows else None


@router.post("/identify", response_model=IdentifyResponse)
async def identify_endpoint(
    image: UploadFile = File(...),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    image_bytes = await image.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Afbeelding te groot (max 5 MB)")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Onbekend afbeeldingsformaat")

    try:
        candidates = await identify(image_bytes)
    except PlantIdQuotaExceeded:
        raise HTTPException(status_code=503, detail="Identificatie tijdelijk niet beschikbaar")
    except PlantIdServiceError:
        raise HTTPException(status_code=502, detail="Kon niet verbinden met identificatieservice")

    if not candidates or candidates[0].confidence < _MIN_CONFIDENCE_FOR_RESULT:
        return IdentifyResponse(candidates=[], low_confidence=False)

    top3 = candidates[:3]
    out: list[CandidateOut] = []
    for c in top3:
        common_nl, common_en = _split_common_names(c.common_names)
        species_id = await _attach_species_id(db, c.scientific_name)
        out.append(CandidateOut(
            scientific_name=c.scientific_name,
            common_names_nl=common_nl,
            common_names_en=common_en,
            confidence=c.confidence,
            species_id=species_id,
            thumbnail_url=c.plantnet_image_url,
        ))

    low_conf = _MIN_CONFIDENCE_FOR_RESULT <= candidates[0].confidence < _LOW_CONFIDENCE_UPPER
    return IdentifyResponse(candidates=out, low_confidence=low_conf)
```

- [ ] **Step 4: Register the router in main.py**

In `groei/backend/main.py`, find the line `from routers import warnings as warnings_router` (around line 19) and add:

```python
from routers import plant_id as plant_id_router
```

Then find the corresponding `app.include_router(warnings_router.router, prefix="/api")` (around line 69) and add right after:

```python
app.include_router(plant_id_router.router, prefix="/api")
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id_endpoint.py -v
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add groei/backend/routers/plant_id.py groei/backend/main.py groei/backend/tests/test_plant_id_endpoint.py
git commit -m "feat(plant-id): POST /api/plants/identify endpoint"
```

---

### Task 6: `POST /api/plants/identify/commit` endpoint

**Files:**
- Modify: `groei/backend/routers/plant_id.py` (append commit endpoint)
- Modify: `groei/backend/tests/test_plant_id_endpoint.py` (append commit tests)

- [ ] **Step 1: Find the existing species-enrichment helper**

Read `groei/backend/species_service.py` and `groei/backend/threshold_service.py` (both at `groei/backend/`). Find the function that, given a scientific name, fetches species data via Trefle + Claude AI and returns or inserts a `plant_species` row. This is reused by AddPlant when adding a new species manually. Note the exact function name + signature.

If no such single function exists, identify the two helper calls (e.g. `fetch_species_from_trefle()` then `enrich_with_claude()`) and the insertion pattern. You'll wrap them in a local `_enrich_species_if_missing()` helper inside the commit endpoint.

Common entry points (verify by reading the files):
- `species_service.lookup_or_create_species(db, scientific_name)`
- `threshold_service.fetch_care_thresholds(scientific_name)`

The plan below uses the placeholder name `lookup_or_create_species_id(db, scientific_name)` — replace with the actual function name you find.

- [ ] **Step 2: Find the icon-matching pattern**

Read `groei/icons/manifest.json` (a few entries) to understand the structure. Also check if there's an existing `icons` router or helper at `groei/backend/routers/icons.py` that maps scientific name → icon_key. If so, reuse it. If not, the commit endpoint will do a simple in-memory match:
1. Lowercase the genus part of the scientific name (e.g. "Monstera deliciosa" → "monstera")
2. Check if `groei/icons/<genus>.svg` exists
3. Else, return `icon_key=None`

- [ ] **Step 3: Find the photo storage convention**

Read `groei/backend/main.py` lines 38-40. Photos are served at `/api/photos` from `groei/backend/photos/`. New uploads should be saved into that directory and the returned `photo_path` should be a relative `/api/photos/<filename>` URL.

- [ ] **Step 4: Write the failing test for the commit endpoint**

Append to `groei/backend/tests/test_plant_id_endpoint.py`:

```python
import base64


@pytest.mark.asyncio
async def test_commit_returns_prefill_for_known_species(client, seeded_db, auth_header, tmp_path, monkeypatch):
    """When species is in catalog, commit returns enriched payload from cache (no external lookup)."""
    # Redirect photo writes to tmp dir
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
    # The photo file actually exists on disk
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
        # Simulate the existing pipeline inserting a new row
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
```

- [ ] **Step 5: Run, confirm fail**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id_endpoint.py -v
```

Expected: 3 new tests fail with 404 (commit endpoint not implemented).

- [ ] **Step 6: Implement the commit endpoint**

Append to `groei/backend/routers/plant_id.py`:

```python
import base64
import json
import os
import secrets
from datetime import datetime
from pathlib import Path


# Replace the value below with the actual photos dir on the project — main.py uses this:
_PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "..", "photos")
_ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "icons")


class IdentifyCommitRequest(BaseModel):
    scientific_name: str
    photo_base64: str    # raw base64 OR a data: URL prefix like "data:image/jpeg;base64,..."


class IdentifyCommitResponse(BaseModel):
    species_id: int
    name_nl_suggested: str
    scientific_name: str
    icon_key: str | None
    care_thresholds: dict
    photo_path: str


def _strip_data_url(b64: str) -> str:
    """Accept either a raw base64 string or a 'data:...;base64,XXX' data URL."""
    if "," in b64 and b64.lstrip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _match_icon_key(scientific_name: str) -> str | None:
    """Cheap icon match: lowercase genus → look for icon file. Returns icon_key or None."""
    genus = scientific_name.strip().split(" ", 1)[0].lower()
    if not genus:
        return None
    candidate = Path(_ICONS_DIR) / f"{genus}.svg"
    if candidate.exists():
        return genus
    return None


async def _enrich_species_if_missing(db, scientific_name: str) -> int | None:
    """Trigger the existing species-enrichment pipeline. Returns species_id or None on failure.

    REPLACE THE INSIDE OF THIS FUNCTION WITH A CALL TO THE REAL PIPELINE.
    The likely entry point is in species_service.py — read that file and adapt.
    """
    # TEMPORARY skeleton — implementer must replace with real pipeline call.
    # Example:
    #   from species_service import lookup_or_create_species
    #   return await lookup_or_create_species(db, scientific_name)
    return None


def _save_identify_photo(image_bytes: bytes) -> str:
    """Save photo to PHOTOS_DIR and return the /api/photos/<filename> URL."""
    os.makedirs(_PHOTOS_DIR, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    suffix = secrets.token_hex(3)
    filename = f"identify_{timestamp}_{suffix}.jpg"
    full = Path(_PHOTOS_DIR) / filename
    full.write_bytes(image_bytes)
    return f"/api/photos/{filename}"


@router.post("/identify/commit", response_model=IdentifyCommitResponse)
async def identify_commit(
    body: IdentifyCommitRequest,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    # Look up the species
    rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, common_name_en, care_thresholds "
        "FROM plant_species WHERE latin_name = ? LIMIT 1",
        (body.scientific_name,),
    )
    if rows:
        row = dict(rows[0])
        species_id = row["id"]
        name_nl = row["common_name_nl"] or row["common_name_en"] or body.scientific_name
        thresholds = json.loads(row["care_thresholds"]) if row["care_thresholds"] else {}
    else:
        species_id = await _enrich_species_if_missing(db, body.scientific_name)
        if species_id is None:
            raise HTTPException(status_code=404, detail="Soort niet gevonden")
        # Re-fetch the just-inserted row
        rows = await db.execute_fetchall(
            "SELECT common_name_nl, common_name_en, care_thresholds FROM plant_species WHERE id = ?",
            (species_id,),
        )
        row = dict(rows[0])
        name_nl = row["common_name_nl"] or row["common_name_en"] or body.scientific_name
        thresholds = json.loads(row["care_thresholds"]) if row["care_thresholds"] else {}

    # Save the photo
    try:
        image_bytes = base64.b64decode(_strip_data_url(body.photo_base64))
    except Exception:
        raise HTTPException(status_code=400, detail="Onbekend afbeeldingsformaat")
    photo_path = _save_identify_photo(image_bytes)

    return IdentifyCommitResponse(
        species_id=species_id,
        name_nl_suggested=name_nl,
        scientific_name=body.scientific_name,
        icon_key=_match_icon_key(body.scientific_name),
        care_thresholds=thresholds,
        photo_path=photo_path,
    )
```

**IMPORTANT:** the `_enrich_species_if_missing` function above is a skeleton. Read `groei/backend/species_service.py` and `groei/backend/threshold_service.py` to find the real species-enrichment entry point (probably `lookup_or_create_species()` or similar) and call it. The test `test_commit_triggers_enrichment_for_unknown_species` patches this function, so the test will pass even with the skeleton, but the real flow must call the real pipeline before merge.

- [ ] **Step 7: Run tests, confirm pass**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id_endpoint.py -v
```

Expected: all 9 endpoint tests pass.

- [ ] **Step 8: Commit**

```bash
git add groei/backend/routers/plant_id.py groei/backend/tests/test_plant_id_endpoint.py
git commit -m "feat(plant-id): POST /api/plants/identify/commit endpoint"
```

---

### Task 7: Wire the real species-enrichment pipeline into `_enrich_species_if_missing`

**Files:**
- Modify: `groei/backend/routers/plant_id.py` (replace skeleton with real call)

- [ ] **Step 1: Read the species pipeline**

```bash
cat groei/backend/species_service.py groei/backend/threshold_service.py | head -200
```

Find the function that:
1. Takes a scientific name
2. Hits Trefle (and/or Claude AI as fallback)
3. Inserts a `plant_species` row with `latin_name`, `common_name_nl`, `common_name_en`, `care_thresholds`
4. Returns the new species_id

Common signatures: `async def lookup_or_create_species(db, scientific_name) -> int | None` or `async def ensure_species(db, latin_name) -> Species`. If split across files, identify the calling sequence used elsewhere in the codebase (search for callers).

- [ ] **Step 2: Replace the skeleton**

In `groei/backend/routers/plant_id.py`, replace the `_enrich_species_if_missing` body:

```python
async def _enrich_species_if_missing(db, scientific_name: str) -> int | None:
    """Trigger the existing species-enrichment pipeline."""
    from species_service import lookup_or_create_species  # adjust import to actual symbol
    try:
        species_id = await lookup_or_create_species(db, scientific_name)
        return species_id
    except Exception:
        return None
```

The actual import + function name comes from Step 1. If the pipeline doesn't have a single one-call entry point, build a small adapter that does the multi-step lookup + insertion using the existing helpers.

- [ ] **Step 3: Sanity-test the import path**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -c "from routers.plant_id import _enrich_species_if_missing; print('import ok')"
```

- [ ] **Step 4: Re-run endpoint tests to confirm nothing regressed**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei/backend" && .venv/Scripts/python.exe -m pytest tests/test_plant_id_endpoint.py -v
```

Expected: 9 passed (the test that mocks this function still works because it patches `routers.plant_id._enrich_species_if_missing` directly).

- [ ] **Step 5: Commit**

```bash
git add groei/backend/routers/plant_id.py
git commit -m "feat(plant-id): wire real species-enrichment pipeline into commit"
```

---

### Task 8: Frontend types

**Files:**
- Modify: `groei/frontend/src/types/index.ts`

- [ ] **Step 1: Read the current types file**

```bash
head -80 groei/frontend/src/types/index.ts
```

Find where existing types are exported. Add at the end (or alongside other plant-related types):

- [ ] **Step 2: Append the new types**

```typescript
export type PlantIdCandidate = {
  scientific_name: string
  common_names_nl: string[]
  common_names_en: string[]
  confidence: number
  species_id: number | null
  thumbnail_url: string | null
}

export type IdentifyResponse = {
  candidates: PlantIdCandidate[]
  low_confidence: boolean
}

export type IdentifyCommitResult = {
  species_id: number
  name_nl_suggested: string
  scientific_name: string
  icon_key: string | null
  care_thresholds: Record<string, unknown>
  photo_path: string
}
```

- [ ] **Step 3: Verify TS compiles**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors related to these types.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/types/index.ts
git commit -m "feat(plant-id): frontend types for identification"
```

---

### Task 9: Frontend API client methods

**Files:**
- Modify: `groei/frontend/src/api/client.ts`

- [ ] **Step 1: Read existing client patterns**

```bash
head -80 groei/frontend/src/api/client.ts && echo "---" && tail -40 groei/frontend/src/api/client.ts
```

The existing `api<T>(method, path, options)` helper is what to use. There's already a `form: FormData` option for multipart.

- [ ] **Step 2: Append new methods**

Add to `groei/frontend/src/api/client.ts`:

```typescript
import type { IdentifyResponse, IdentifyCommitResult } from '../types'

// Add anywhere alongside other exported API functions:

export async function identifyPlant(imageBlob: Blob): Promise<IdentifyResponse> {
  const form = new FormData()
  form.append('image', imageBlob, 'plant.jpg')
  return api<IdentifyResponse>('POST', '/plants/identify', { form })
}

export async function commitIdentification(
  scientificName: string,
  photoBase64: string,
): Promise<IdentifyCommitResult> {
  return api<IdentifyCommitResult>('POST', '/plants/identify/commit', {
    body: { scientific_name: scientificName, photo_base64: photoBase64 },
  })
}
```

(Adjust the import line to merge with the existing `import type { … } from '../types'` line at the top of the file rather than adding a duplicate.)

- [ ] **Step 3: Verify TS compiles**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/api/client.ts
git commit -m "feat(plant-id): frontend API client methods for identify + commit"
```

---

### Task 10: i18n strings for identification

**Files:**
- Modify: `groei/frontend/src/i18n/nl.ts`
- Modify: `groei/frontend/src/i18n/en.ts`
- Modify: `groei/frontend/src/i18n/translations.ts`

- [ ] **Step 1: Read existing i18n structure**

```bash
head -30 groei/frontend/src/i18n/nl.ts && echo "---" && head -30 groei/frontend/src/i18n/translations.ts
```

The existing pattern uses a nested object indexed by key. Follow the same pattern.

- [ ] **Step 2: Append Dutch strings**

In `groei/frontend/src/i18n/nl.ts`, add to the appropriate place in the existing exported object:

```typescript
  addPlant: {
    // ... preserve existing entries
    entry: {
      identify: 'Identificeer met foto',
      identifySubtitle: 'Snelste — laat AI het type herkennen',
      pick: 'Kies uit lijst',
      pickSubtitle: 'Browse onze plantenbibliotheek',
      manual: 'Handmatig invullen',
      manualSubtitle: 'Ik weet zelf wat het is',
    },
  },
  identify: {
    camera: {
      title: 'Maak een foto',
      capture: 'Foto maken',
      cancel: 'Annuleren',
      noAccess: 'Geen toegang tot camera',
    },
    identifying: 'Identificeren...',
    enriching: 'Bezig met opzoeken...',
    results: {
      title: 'Mogelijke matches',
      confidence: 'zekerheid',
      poweredBy: 'powered by Pl@ntNet',
      choose: 'Kies deze',
    },
    lowConfidence: 'Lage zekerheid — controleer de resultaten zorgvuldig',
    noMatch: {
      title: 'Geen match gevonden',
      body: 'Probeer een andere foto of vul de plant handmatig in.',
      retry: 'Opnieuw proberen',
      manualFallback: 'Handmatig invullen',
    },
    errorOffline: 'Identificatie werkt niet zonder internet',
    errorService: 'Kon niet verbinden met identificatieservice',
    errorQuota: 'Identificatie tijdelijk niet beschikbaar (dagelijkse limiet)',
    privacy: {
      notice: "Foto's worden naar Pl@ntNet gestuurd voor identificatie.",
      ack: 'OK, begrepen',
    },
  },
```

- [ ] **Step 3: Append English strings**

In `groei/frontend/src/i18n/en.ts`, add the equivalent:

```typescript
  addPlant: {
    // ... preserve existing entries
    entry: {
      identify: 'Identify with photo',
      identifySubtitle: 'Fastest — let AI recognise the species',
      pick: 'Pick from list',
      pickSubtitle: 'Browse our plant library',
      manual: 'Enter manually',
      manualSubtitle: 'I know what it is',
    },
  },
  identify: {
    camera: {
      title: 'Take a photo',
      capture: 'Capture',
      cancel: 'Cancel',
      noAccess: 'No camera access',
    },
    identifying: 'Identifying...',
    enriching: 'Looking up...',
    results: {
      title: 'Possible matches',
      confidence: 'confidence',
      poweredBy: 'powered by Pl@ntNet',
      choose: 'Pick this one',
    },
    lowConfidence: 'Low confidence — review carefully',
    noMatch: {
      title: 'No match found',
      body: 'Try a different photo or add the plant manually.',
      retry: 'Try again',
      manualFallback: 'Enter manually',
    },
    errorOffline: 'Identification needs an internet connection',
    errorService: 'Could not reach the identification service',
    errorQuota: 'Identification temporarily unavailable (daily limit)',
    privacy: {
      notice: 'Photos are sent to Pl@ntNet for identification.',
      ack: 'OK, got it',
    },
  },
```

- [ ] **Step 4: Update translations.ts type**

In `groei/frontend/src/i18n/translations.ts`, the type union (or interface) describing the translation tree needs the new keys. Read the file, find the type that mirrors the language objects, and add the corresponding `identify` + `addPlant.entry` shape so TypeScript stays happy.

- [ ] **Step 5: Verify TS compiles**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add groei/frontend/src/i18n/nl.ts groei/frontend/src/i18n/en.ts groei/frontend/src/i18n/translations.ts
git commit -m "feat(plant-id): i18n strings for identification flow (nl + en)"
```

---

### Task 11: IdentifyCamera component

**Files:**
- Create: `groei/frontend/src/components/identify/IdentifyCamera.tsx`

- [ ] **Step 1: Create the component**

Create `groei/frontend/src/components/identify/IdentifyCamera.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'

type Props = {
  onCapture: (blob: Blob, dataUrl: string) => void
  onCancel: () => void
}

export function IdentifyCamera({ onCapture, onCancel }: Props) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        setError(t('identify.camera.noAccess'))
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [t])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        onCapture(blob, dataUrl)
      },
      'image/jpeg',
      0.85,
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <button onClick={onCancel} aria-label={t('identify.camera.cancel')} className="text-2xl">×</button>
        <span className="text-sm opacity-75">{t('identify.camera.title')}</span>
        <span className="w-6" />
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-white text-center p-8">
            <p>{error}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>
      {!error && (
        <div className="p-6 flex justify-center">
          <button
            onClick={capture}
            aria-label={t('identify.camera.capture')}
            className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 active:scale-95 transition-transform"
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/components/identify/IdentifyCamera.tsx
git commit -m "feat(plant-id): IdentifyCamera component (viewfinder + capture)"
```

---

### Task 12: IdentifyResults component

**Files:**
- Create: `groei/frontend/src/components/identify/IdentifyResults.tsx`

- [ ] **Step 1: Create the component**

Create `groei/frontend/src/components/identify/IdentifyResults.tsx`:

```tsx
import { useT } from '../../i18n'
import type { PlantIdCandidate } from '../../types'

type Props = {
  candidates: PlantIdCandidate[]
  lowConfidence: boolean
  capturedThumbnailUrl: string | null      // data URL of the user's photo, for visual recall
  onChoose: (candidate: PlantIdCandidate) => void
  onRetry: () => void
  onManualFallback: () => void
}

export function IdentifyResults({
  candidates, lowConfidence, capturedThumbnailUrl, onChoose, onRetry, onManualFallback,
}: Props) {
  const t = useT()

  if (candidates.length === 0) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <h2 className="text-xl font-semibold mb-2">{t('identify.noMatch.title')}</h2>
        <p className="text-gray-600 mb-6">{t('identify.noMatch.body')}</p>
        {capturedThumbnailUrl && (
          <img src={capturedThumbnailUrl} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-75" />
        )}
        <div className="flex flex-col gap-3">
          <button onClick={onRetry} className="bg-green-700 text-white px-4 py-3 rounded">
            {t('identify.noMatch.retry')}
          </button>
          <button onClick={onManualFallback} className="text-gray-700 px-4 py-3 rounded border">
            {t('identify.noMatch.manualFallback')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-2">{t('identify.results.title')}</h2>
      {lowConfidence && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 mb-4 text-sm">
          {t('identify.lowConfidence')}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {candidates.map((c) => {
          const pct = Math.round(c.confidence * 100)
          const commonName = c.common_names_nl[0] || c.common_names_en[0] || c.scientific_name
          return (
            <button
              key={c.scientific_name}
              onClick={() => onChoose(c)}
              className="flex items-center gap-3 p-3 bg-white border rounded-lg text-left active:bg-gray-50"
            >
              {c.thumbnail_url ? (
                <img src={c.thumbnail_url} alt="" className="w-16 h-16 object-cover rounded" />
              ) : (
                <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-2xl">🌿</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{commonName}</div>
                <div className="text-xs italic text-gray-500 truncate">{c.scientific_name}</div>
                <div className="mt-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                  <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{pct}% {t('identify.results.confidence')}</div>
              </div>
            </button>
          )
        })}
      </div>
      <div className="text-center text-xs text-gray-400 mt-6">{t('identify.results.poweredBy')}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/components/identify/IdentifyResults.tsx
git commit -m "feat(plant-id): IdentifyResults component (candidates + no-match)"
```

---

### Task 13: IdentifyPlant page (state machine)

**Files:**
- Create: `groei/frontend/src/pages/IdentifyPlant.tsx`

- [ ] **Step 1: Create the page**

Create `groei/frontend/src/pages/IdentifyPlant.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { identifyPlant, commitIdentification } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import { IdentifyResults } from '../components/identify/IdentifyResults'
import type { PlantIdCandidate } from '../types'

type Step =
  | { kind: 'privacy' }
  | { kind: 'camera' }
  | { kind: 'identifying'; thumbnail: string }
  | { kind: 'results'; candidates: PlantIdCandidate[]; lowConfidence: boolean; thumbnail: string; capturedBlob: Blob }
  | { kind: 'enriching' }
  | { kind: 'error'; message: string; thumbnail: string | null }

const PRIVACY_ACK_KEY = 'groei.identify.privacy_ack'

export function IdentifyPlantPage() {
  const t = useT()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(() =>
    localStorage.getItem(PRIVACY_ACK_KEY) === '1' ? { kind: 'camera' } : { kind: 'privacy' }
  )
  const [capturedPhotoBlob, setCapturedPhotoBlob] = useState<Blob | null>(null)
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.onLine) {
      setStep({ kind: 'error', message: t('identify.errorOffline'), thumbnail: null })
    }
  }, [t])

  async function handleCapture(blob: Blob, dataUrl: string) {
    setCapturedPhotoBlob(blob)
    setCapturedPhotoDataUrl(dataUrl)
    setStep({ kind: 'identifying', thumbnail: dataUrl })
    try {
      const resp = await identifyPlant(blob)
      setStep({
        kind: 'results',
        candidates: resp.candidates,
        lowConfidence: resp.low_confidence,
        thumbnail: dataUrl,
        capturedBlob: blob,
      })
    } catch (e) {
      const message = e instanceof Error && e.message.includes('tijdelijk')
        ? t('identify.errorQuota')
        : t('identify.errorService')
      setStep({ kind: 'error', message, thumbnail: dataUrl })
    }
  }

  async function handleChoose(candidate: PlantIdCandidate) {
    if (!capturedPhotoDataUrl) return
    setStep({ kind: 'enriching' })
    try {
      const enriched = await commitIdentification(candidate.scientific_name, capturedPhotoDataUrl)
      // Hand the pre-fill payload to AddPlant via navigation state.
      navigate('/plant/add', { state: { prefill: enriched, from: 'identify' } })
    } catch {
      setStep({
        kind: 'error',
        message: t('identify.errorService'),
        thumbnail: capturedPhotoDataUrl,
      })
    }
  }

  function ackPrivacy() {
    localStorage.setItem(PRIVACY_ACK_KEY, '1')
    setStep({ kind: 'camera' })
  }

  function manualFallback() {
    navigate('/plant/add', { state: { from: 'manual' } })
  }

  function retry() {
    setStep({ kind: 'camera' })
    setCapturedPhotoBlob(null)
    setCapturedPhotoDataUrl(null)
  }

  // --- render per step ---

  if (step.kind === 'privacy') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h2 className="text-xl font-semibold mb-2">📸 {t('identify.camera.title')}</h2>
        <p className="text-gray-600 my-4">{t('identify.privacy.notice')}</p>
        <div className="flex flex-col gap-3">
          <button onClick={ackPrivacy} className="bg-green-700 text-white px-4 py-3 rounded">
            {t('identify.privacy.ack')}
          </button>
          <button onClick={() => navigate(-1)} className="text-gray-700 px-4 py-3 rounded border">
            {t('identify.camera.cancel')}
          </button>
        </div>
      </div>
    )
  }

  if (step.kind === 'camera') {
    return <IdentifyCamera onCapture={handleCapture} onCancel={() => navigate(-1)} />
  }

  if (step.kind === 'identifying') {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <img src={step.thumbnail} alt="" className="w-40 h-40 object-cover rounded mx-auto mb-6" />
        <p className="text-gray-700">{t('identify.identifying')}</p>
      </div>
    )
  }

  if (step.kind === 'enriching') {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <p className="text-gray-700">{t('identify.enriching')}</p>
      </div>
    )
  }

  if (step.kind === 'results') {
    return (
      <IdentifyResults
        candidates={step.candidates}
        lowConfidence={step.lowConfidence}
        capturedThumbnailUrl={step.thumbnail}
        onChoose={handleChoose}
        onRetry={retry}
        onManualFallback={manualFallback}
      />
    )
  }

  // error step
  return (
    <div className="p-6 max-w-md mx-auto text-center">
      <h2 className="text-xl font-semibold mb-2">⚠️</h2>
      <p className="text-gray-600 mb-6">{step.message}</p>
      {step.thumbnail && (
        <img src={step.thumbnail} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-50" />
      )}
      <div className="flex flex-col gap-3">
        <button onClick={retry} className="bg-green-700 text-white px-4 py-3 rounded">
          {t('identify.noMatch.retry')}
        </button>
        <button onClick={manualFallback} className="text-gray-700 px-4 py-3 rounded border">
          {t('identify.noMatch.manualFallback')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/pages/IdentifyPlant.tsx
git commit -m "feat(plant-id): IdentifyPlant page state machine"
```

---

### Task 14: Register `/identify` route

**Files:**
- Modify: `groei/frontend/src/App.tsx`

- [ ] **Step 1: Read App.tsx route definitions**

```bash
grep -n "Route\|Routes\|path=" groei/frontend/src/App.tsx | head -30
```

- [ ] **Step 2: Add the route**

Find the `<Routes>` block and add (alongside other routes):

```tsx
import { IdentifyPlantPage } from './pages/IdentifyPlant'

// ... inside <Routes>:
<Route path="/identify" element={<IdentifyPlantPage />} />
```

- [ ] **Step 3: Verify TS compiles + route resolves**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

Then run the dev server briefly and navigate to `/identify` to confirm the page renders the privacy notice (no need to actually capture a photo here):

```bash
cd groei && npm run dev:frontend
```

(Ctrl-C after verifying.)

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/App.tsx
git commit -m "feat(plant-id): register /identify route"
```

---

### Task 15: AddPlant entry-choice screen + pre-fill handler

**Files:**
- Modify: `groei/frontend/src/pages/AddPlant.tsx`

- [ ] **Step 1: Read current AddPlant.tsx**

```bash
wc -l groei/frontend/src/pages/AddPlant.tsx && head -60 groei/frontend/src/pages/AddPlant.tsx
```

Understand the existing component's structure (likely a single form with state). Identify where to add the entry-choice gate.

- [ ] **Step 2: Add the entry-choice screen + pre-fill reader**

At the top of the AddPlant component:

```tsx
import { useLocation, useNavigate } from 'react-router-dom'
import type { IdentifyCommitResult } from '../types'

// inside the component:
const location = useLocation()
const navigate = useNavigate()
const t = useT()

type LocState = { from?: 'identify' | 'manual'; prefill?: IdentifyCommitResult } | null
const state = (location.state ?? null) as LocState

// If user landed without choosing a path, show the entry chooser.
if (state?.from == null) {
  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">{t('addPlant.title') /* preserve if exists */}</h2>
      <div className="flex flex-col gap-3">
        <button
          onClick={() => navigate('/identify')}
          className="bg-green-700 text-white p-4 rounded-lg text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📸</span>
            <div>
              <div className="font-medium">{t('addPlant.entry.identify')}</div>
              <div className="text-xs opacity-85">{t('addPlant.entry.identifySubtitle')}</div>
            </div>
          </div>
        </button>
        <button
          onClick={() => navigate(location.pathname, { state: { from: 'pick' }, replace: true })}
          className="bg-gray-100 p-4 rounded-lg text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔍</span>
            <div>
              <div className="font-medium">{t('addPlant.entry.pick')}</div>
              <div className="text-xs text-gray-600">{t('addPlant.entry.pickSubtitle')}</div>
            </div>
          </div>
        </button>
        <button
          onClick={() => navigate(location.pathname, { state: { from: 'manual' }, replace: true })}
          className="bg-gray-100 p-4 rounded-lg text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✏️</span>
            <div>
              <div className="font-medium">{t('addPlant.entry.manual')}</div>
              <div className="text-xs text-gray-600">{t('addPlant.entry.manualSubtitle')}</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
```

Then below the entry-choice gate, before the existing form render, read the pre-fill if present:

```tsx
const prefill = state?.prefill
// Use prefill?.name_nl_suggested, prefill?.species_id, prefill?.icon_key,
// prefill?.care_thresholds, prefill?.photo_path as the initial values for the
// existing form fields (name, species_id, icon_key, care_thresholds, photo_path).
// Replace any existing useState initial values with these when present, e.g.:
//
//   const [name, setName] = useState(prefill?.name_nl_suggested ?? '')
//   const [iconKey, setIconKey] = useState(prefill?.icon_key ?? null)
//   const [photoPath, setPhotoPath] = useState(prefill?.photo_path ?? null)
//   const [careThresholds, setCareThresholds] = useState(prefill?.care_thresholds ?? {})
//   const [speciesId, setSpeciesId] = useState(prefill?.species_id ?? null)
```

How exactly the prefill wires in depends on the current shape of AddPlant. Read the file and adapt — keep the existing form intact, just change the initial values when prefill is present.

If `state?.from === 'pick'`: render the existing PlantPickerSheet (find current trigger point and unconditionally render the sheet on mount).

- [ ] **Step 3: Verify TS + flow**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

Run `npm run dev:frontend` and verify:
1. Navigating to `/plant/add` from a fresh state shows the entry chooser.
2. Tapping 📸 navigates to `/identify` (which then shows privacy notice + camera).
3. Tapping ✏️ shows the existing manual form.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/pages/AddPlant.tsx
git commit -m "feat(plant-id): AddPlant entry-choice screen + identify pre-fill"
```

---

### Task 16: End-to-end manual smoke test

**Files:** None — verification only.

- [ ] **Step 1: Start backend + frontend**

```bash
cd "C:/Users/leon_/Projects/Plant APP/groei" && npm run dev
```

Wait until both ports (backend 8000, frontend 5173) are up.

- [ ] **Step 2: Smoke test the full flow**

In a browser at `http://localhost:5173`:

1. Log in.
2. Navigate to `/plant/add`.
3. Confirm the entry-choice screen shows three options.
4. Tap "📸 Identificeer met foto".
5. Confirm the privacy notice (first time only). Tap "OK, begrepen".
6. Confirm the camera viewfinder shows your webcam feed.
7. Snap a photo of any plant nearby (or hold up a phone screen showing a plant photo).
8. Confirm "Identificeren..." appears for 2-4 seconds.
9. Confirm the results screen shows up to 3 candidates with confidence bars + the "powered by Pl@ntNet" footer.
10. Tap a candidate.
11. Confirm "Bezig met opzoeken..." appears briefly.
12. Confirm you land on the AddPlant form with name, species, icon, and care thresholds pre-filled.
13. Place on map and save. Confirm the plant appears with the captured photo.

- [ ] **Step 3: Test the error paths**

1. Disconnect from internet → tap detect → confirm "needs an internet connection" message.
2. With a non-plant photo (e.g. a wall), confirm "no match found" screen with retry + manual buttons.

- [ ] **Step 4: Capture notes**

Create `docs/notes/plant-detection-verification.md` with:
- Date
- Branch SHA (`git rev-parse HEAD`)
- Each of the steps above marked done/issue
- Anything that surprised you (PlantNet response time, accuracy on your plants, UI rough edges)

- [ ] **Step 5: Commit notes**

```bash
git add docs/notes/plant-detection-verification.md
git commit -m "docs: plant detection end-to-end verification notes"
```

---

## Self-Review

**1. Spec coverage:**
- ✓ Pl@ntNet API client — Tasks 3, 4
- ✓ Single-shot 1-photo flow — Task 11 (camera) + Task 4 (organs=["auto"])
- ✓ Top-3 candidates with confidence — Task 5 + Task 12
- ✓ Low-confidence (0.10-0.30) banner — Task 5 + Task 12
- ✓ No-match (<0.10) handling — Task 5 + Task 12
- ✓ Smart pre-fill (species_id, icon_key, care_thresholds, photo) — Tasks 6, 7, 15
- ✓ Entry inside AddPlant (Option C) — Task 15
- ✓ Privacy notice (localStorage) — Task 13
- ✓ Offline guard — Task 13
- ✓ Powered-by Pl@ntNet footer — Task 12
- ✓ Photo storage to `groei/backend/photos/` — Task 6
- ✓ Icon-key matching from manifest — Task 6 (`_match_icon_key`)
- ✓ Reuse existing species-enrichment pipeline — Task 7
- ✓ Tests: unit (Tasks 3, 4) + endpoint (Tasks 5, 6) + manual e2e (Task 16)
- ✓ i18n nl + en — Task 10
- ✓ Route registration — Task 14
- ✓ PLANTNET_API_KEY env var — Task 1

Frontend snapshot tests mentioned in the spec are deferred to a follow-up — there's no existing snapshot-test setup in the codebase, and adding one for two components is over-scope for this plan. The manual e2e in Task 16 covers the same surface.

**2. Placeholder scan:**
- Two soft TODOs flagged explicitly with rationale: the `_enrich_species_if_missing` skeleton in Task 6 (replaced in Task 7) and the `_match_icon_key` simple-genus fallback in Task 6. Both have notes telling the implementer what to verify against the actual codebase. No silent placeholders.
- The `_parse_candidate` function notes that field names must be verified against the real Pl@ntNet fixture (Task 4 Step 3). This is correct — we cannot guess the exact JSON shape and the fixture is the source of truth.

**3. Type consistency:**
- `IdCandidate` (backend dataclass, Tasks 3-4) ↔ `CandidateOut` (Pydantic, Task 5) ↔ `PlantIdCandidate` (TS, Task 8) — fields aligned: scientific_name, confidence, common_names (split per language in the Out version), species_id, thumbnail_url.
- `IdentifyResponse` shape: `{candidates, low_confidence}` — same in Pydantic (Task 5) and TS (Task 8).
- `IdentifyCommitResponse` / `IdentifyCommitResult` — fields aligned: species_id, name_nl_suggested, scientific_name, icon_key, care_thresholds, photo_path.
- `_enrich_species_if_missing` referenced in Task 6 tests (patched), defined in Task 6 (skeleton), replaced in Task 7 (real call).

No drift identified.

---

## Execution Handoff

Plan saved to `docs/plans/in-progress/2026-05-17-plant-detection.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review (spec then quality), fast iteration. We just did this for Care System Phase A and it worked well.
2. **Inline Execution** — execute tasks in this session with checkpoints. Heavier on my context.

Which approach?
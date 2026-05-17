# Plant Detection — Phase A Verification

**Date:** 2026-05-17
**Branch:** `feat/plant-detection`
**Branch SHA:** `90e5f03ac9262548c49c532bed1255d001c39216`
**Backend tests:** 19 plant-id-related tests passing (10 service unit + 9 endpoint).

## Automated verification done

- [PASS] Backend uvicorn starts cleanly with PLANTNET_API_KEY env var loaded (`.env` via `python-dotenv`).
- [PASS] OpenAPI exposes both endpoints: `['/api/plants/identify', '/api/plants/identify/commit']`.
- [PASS] Both endpoints return `HTTP 401 Unauthorized` when called without a bearer token (auth dep wired).
- [PASS] Backend unit + endpoint test suite: `pytest tests/test_plant_id.py tests/test_plant_id_endpoint.py` — 19 passed, 0 failed.
- [FAIL] Real end-to-end Pl@ntNet call from running server: produced `HTTP 500 Internal Server Error`. See "Defect found" below. PlantNet daily quota was NOT consumed by this attempt — the request never left the host.
- [PASS-with-caveat] Frontend `tsc -p tsconfig.app.json --noEmit` — no new errors in `identify`/`plant_id` files. One pre-existing error remains in `src/pages/AddPlant.tsx(110,47): Cannot find name 'huisLocs'`, which is present on `master` (`master:groei/frontend/src/pages/AddPlant.tsx:80`) and therefore pre-dates this branch. It is unrelated to the plant-detection work (only matched the `AddPlant` filter keyword).

## Defect found during smoke test (BLOCKING for live use)

`services/plant_id.py::_post_plantnet` calls `httpx.AsyncClient(...).post(_PLANTNET_URL, files=[...], data=[...])`. With the installed combination of **httpx 0.28.1 + Python 3.14**, the multipart body produced by `files=...` is constructed as a sync `ByteStream` rather than an `AsyncByteStream`, so `AsyncClient._send_single_request` raises:

```
RuntimeError: Attempted to send an sync request with an AsyncClient instance.
```

This was reproduced two ways:

1. End-to-end via `POST /api/plants/identify` against the running uvicorn (returns HTTP 500, stack trace bottoms out in `httpx/_client.py:1725`).
2. Direct in-process call: `asyncio.run(identify(image_bytes))` from a small repro script using the same `.venv` Python.

A control test (`httpx.AsyncClient` with a plain `GET https://httpbin.org/get`) succeeded, confirming the failure is specific to multipart `files=` body construction with `AsyncClient` on this httpx/Python combo. A control multipart `POST` to `https://httpbin.org/post` reproduced the same `RuntimeError`, isolating the cause to httpx itself rather than the PlantNet endpoint.

Because the failure is in HTTP transport, the unit tests (which patch `_post_plantnet`) and the endpoint tests (which patch `services.plant_id.identify`) do not exercise this code path and therefore stayed green. The defect is invisible to the current test suite.

### Suggested next-task fix candidates (not done in this task)

- Pin / upgrade httpx (e.g. test against httpx 0.27.x or current 0.28.x patch) and confirm `files=` produces an `AsyncByteStream`.
- Or: construct the multipart body explicitly (`httpx.MultipartStream`/`aiohttp`/manual `content=` with `httpx._multipart.MultipartStream`) so the async-stream invariant is preserved.
- Add an integration test using `respx` or a recorded `pytest-httpx` cassette that exercises `_post_plantnet` end-to-end (not just `identify` with `_post_plantnet` patched out), so future regressions are caught.

## Recorded-fixture cross-check

`groei/backend/tests/fixtures/plantnet_response.json` (used by the existing unit tests) contains the expected outcome for `photos/3_1776331116.png`:

- Top result: **Cortaderia selloana**, confidence **0.947**
- Runner-up: Festuca glauca, 0.006
- `remainingIdentificationRequests`: **499** (at time of recording)

The parsing path is exercised by `tests/test_plant_id.py`, so the response-handling code is verified — only the transport layer is broken.

## Browser test still needed (cannot automate in this session)

After the transport defect is fixed, the user should manually verify the full UX flow:

1. `npm run dev` from `groei/`
2. Log in, navigate to `/plant/add`
3. Confirm the three-button entry choice (camera / search / pencil) is shown
4. Tap "Identificeer met foto"
5. Confirm one-time privacy notice (then "OK, begrepen")
6. Confirm camera viewfinder appears (allow camera permission)
7. Snap a photo of any plant
8. Confirm "Identificeren..." then results screen with up to 3 candidates
9. Tap a candidate, confirm "Bezig met opzoeken..." then AddPlant pre-filled
10. Confirm name/species/icon/photo are all pre-set
11. Save and confirm the plant appears with the captured photo

## Known limitations (independent of the transport defect)

- New species (not in `plant_species` cache): the existing pipeline populates `phenology_json` but not `care_thresholds`, so the user lands on AddPlant with empty care thresholds and needs to set them manually. Cached species (most common plants) get full pre-fill.
- Pl@ntNet's default endpoint omits species reference images, so the result-screen thumbnails fall back to a leaf placeholder. v2 could add `&include-related-images=true`.

## Files modified

See `git log feat/plant-detection ^master --oneline` for the full commit list.

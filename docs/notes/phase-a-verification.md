# Care System Phase A — Sanity Verification

- **Date:** 2026-05-17
- **Branch:** `feat/care-system-phase-a`
- **Branch SHA at verification:** `2dea0dbf5a045a36648d282dc571a487b61506ec`

## Result: DONE_WITH_CONCERNS

The new `GET /api/plants/{plant_id}/warnings` endpoint is wired into the FastAPI
app and the OpenAPI schema, and the authentication dependency is correctly
enforced. However, executing it against the real development database produces
an HTTP 500 due to a schema-name mismatch (see "Anomalies" below).

## OpenAPI route

- Matching paths: `['/api/plants/{plant_id}/warnings']`
- Unauthenticated call: `HTTP 401` (auth dep wired correctly).

## Tested plant

- Plant ID: `2` ("Framboos"), household 1, account 1.
- JWT minted via `auth.create_token(account_id=1, household_id=1)` with
  `.env` JWT_SECRET loaded.
- Result: HTTP 500.
- `top_warning.care_type`: N/A — endpoint raised before returning a body.
- `active_care_types`: N/A — endpoint raised before returning a body.

## Anomalies

### 1. DB filename in CLAUDE.md is stale

CLAUDE.md and the task description say the dev DB is
`groei/backend/groei.db`. The real database used by `database/__init__.py`
(and all migration scripts) is `groei/backend/floreren.db`. A stub empty
`groei.db` does exist alongside it, which is misleading. Should be reconciled —
either update the docs to say `floreren.db` or rename the DB.

### 2. Warnings query references a non-existent column (`maps.type`)

`groei/backend/routers/warnings.py:69` selects `m.type as map_type` from the
`maps` table. The live schema (see `PRAGMA table_info(maps)`) has no `type`
column — the column is named `map_type`. The rest of the codebase
(`routers/dashboard.py`, `routers/alerts.py`, `routers/maps.py`) correctly
uses `m.map_type`.

The unit tests pass because `test_warnings_parity.py:150` builds an in-memory
schema that *also* uses `type` (`m.type AS map_type`), so the production code
and its test fixture share the same wrong column name and never disagree. This
is a parity-test blind spot, not just a typo.

Recommended one-line fix in `routers/warnings.py`:

```diff
-                  m.type as map_type
+                  m.map_type
```

And the matching update in the parity test fixture so it mirrors the real
schema.

Raw traceback captured from uvicorn stdout:

```
File "C:\Users\leon_\Projects\Plant APP\groei\backend\routers\warnings.py", line 67, in get_plant_warnings
    plant_rows = await db.execute_fetchall(
...
sqlite3.OperationalError: no such column: m.type
```

### 3. (Minor) `auth.create_token` requires `.env` to be loaded

`auth.py` reads `JWT_SECRET` at import time via `os.environ.get`. Minting a
token from a one-shot Python invocation requires `from dotenv import
load_dotenv; load_dotenv()` first; otherwise the token is signed with
`dev-secret-change-me` and the running server (which loaded `.env`) rejects
it as "Invalid or expired token". Not a bug, but worth knowing for future
ad-hoc CLI verification.

## Conclusion

Endpoint registration, auth wiring, and the upstream pipeline are healthy.
The blocker for end-to-end success is a single mis-named column in
`routers/warnings.py`, masked by an identically-mis-named test fixture. Phase
A should not be considered "live-DB green" until that is patched and
re-verified.

## FIXED — 2026-05-17

The schema-name mismatch is resolved.

- `routers/warnings.py` now selects `m.map_type` (no alias needed).
- `tests/test_warnings_endpoint.py` fixture `CREATE TABLE` + `INSERT` use
  `map_type`.
- `tests/test_warnings_parity.py` fixture `CREATE TABLE`, `INSERT`s, and the
  `SELECT` join all use `map_type`.

Verified against the live `floreren.db`:

- Real `maps` schema columns: `id, name, slug, svg_file, viewbox, scale_info,
  sort_order, created_at, canvas_data, map_type, lat, lon, bearing,
  household_id, thumbnail_file`. No `type` column exists.
- `pytest tests/test_warnings.py tests/test_warnings_endpoint.py
  tests/test_warnings_parity.py`: **37 passed**.
- `curl -H "Authorization: Bearer <token>"
  http://127.0.0.1:8765/api/plants/2/warnings`: **HTTP 200**.
  - `plant_id`: `2`
  - `environment`: `"outdoor_container"`
  - `active_care_types`: `["water", "fertilize", "frost_protect",
    "heat_protect", "prune", "repot", "pest_check"]`
  - `top_warning`: `null` (no warnings active; `water` is in good state with
    `days_until_due: 2`, `last_done: 2026-05-16`)
  - `care_summary`: all 7 active care types report `status: "good"`.

Phase A is now live-DB green.

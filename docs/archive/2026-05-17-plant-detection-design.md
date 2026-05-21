# Plant Detection — Pl@ntNet-powered Identify Flow

**Date:** 2026-05-17
**Status:** approved

## Summary

Add a plant-identification flow that lets the user snap one photo of a plant and have the app suggest the top 3 species candidates via the free Pl@ntNet API. Picking a candidate pre-fills the existing "Add Plant" form with name, species, care thresholds, icon, and the captured photo, so the user only needs to confirm position on the map and save.

## Motivation

Manually adding plants is high-friction: the user has to know the name, type it correctly, hunt for the right icon, fill in care thresholds, and place it. Photo-based identification removes the "know the name" step — the single hardest part for casual plant collectors and the most-requested feature for plant apps. Pl@ntNet's free tier (500 identifications/day, 78k species) is wildly over-provisioned for one household and requires only an attribution footnote in return.

## Design principles

1. **Single shot, no organ wizard.** Tap → snap → result. Multi-image with organ hints (leaf/flower/fruit) is more accurate but adds friction; defer to v2.
2. **Smart pre-fill, manual fallback.** Picking a candidate triggers full species enrichment so the user lands on a nearly-complete AddPlant form. If identification fails, manual entry is always one tap away.
3. **No new tables.** Reuse `plants.photo_path`, `plants.species_id`, the existing `plant_species` table, and the existing Trefle/Claude species-enrichment pipeline.
4. **Detection is one of three ways to add a plant.** It lives as the prominent first option in AddPlant, not as a new bottom-nav slot or map FAB. Keeps information architecture lean.

## End-to-end flow

```
AddPlant page (entry choice)
  ↓ tap "📸 Identificeer met foto"
IdentifyPlant page — camera step
  ↓ snap photo
IdentifyPlant page — identifying step (~2-4 sec, POST to PlantNet)
  ↓
IdentifyPlant page — results step (top 3 candidates with confidence bars)
  ↓ tap candidate
  ↓ "Bezig met opzoeken..." (species enrichment, may fetch from Trefle/Claude)
AddPlant page — form step (pre-filled: name, species_id, icon_key, care_thresholds, photo_path)
  ↓ user picks map position + Save
Plant created.
```

Failure paths:
- PlantNet returns no candidates → "Geen match gevonden" screen with Retry + "Vul handmatig in" buttons.
- Top score < 10% → same "no match" screen (treats it as no useful identification).
- Top score 10-30% → results screen renders normally but with a yellow `Lage zekerheid` banner above the candidates.
- Network error / 429 quota → "Identificatie tijdelijk niet beschikbaar" with retry and manual-entry buttons.
- Offline (`navigator.onLine === false`) → the entry button is disabled with a "Niet beschikbaar offline" tooltip; clicking it shows a toast.

## Backend

### New: `groei/backend/services/plant_id.py`

Pure wrapper around the Pl@ntNet API. Reads `PLANTNET_API_KEY` from env. Stateless.

```python
@dataclass
class IdCandidate:
    scientific_name: str           # e.g. "Monstera deliciosa"
    scientific_authorship: str | None
    common_names: list[str]        # e.g. ["Swiss cheese plant", "Monstera"]
    confidence: float              # 0.0 - 1.0
    genus: str | None
    family: str | None
    plantnet_image_url: str | None # thumbnail from the matched species page

async def identify(
    image_bytes: bytes,
    organs: list[str] | None = None,
    max_results: int = 5,
) -> list[IdCandidate]:
    """POST one image to Pl@ntNet, return ranked candidates.

    Raises:
        PlantIdQuotaExceeded: HTTP 429 from PlantNet.
        PlantIdServiceError: any other non-2xx response or network failure.
    """
```

The function defaults `organs=["auto"]` to match v1's single-shot UX.

### New endpoints (in a new router `routers/plant_id.py`)

**`POST /api/plants/identify` (multipart upload)**
- Body: one `image` file (≤5 MB, JPEG/PNG/WebP).
- Auth required (existing `get_current_account` dependency).
- Calls `plant_id.identify(image_bytes)`.
- For each returned candidate, does a cheap synchronous lookup against `plant_species.latin_name` and attaches `species_id` if known (else `null`).
- Returns up to 3 candidates as JSON:

```json
{
  "candidates": [
    {
      "scientific_name": "Monstera deliciosa",
      "common_names_nl": ["Gatenplant"],
      "common_names_en": ["Swiss cheese plant"],
      "confidence": 0.89,
      "species_id": 42,
      "thumbnail_url": "https://bs.plantnet.org/image/o/..."   // from species.images[0].url in PlantNet response; field name verified at implementation
    },
    ...
  ],
  "low_confidence": false
}
```

`low_confidence` is true when the top candidate's confidence is between 0.10 and 0.30.

**`POST /api/plants/identify/commit`**
- Body: `{"scientific_name": str, "photo_base64": str}` (data-URL or raw base64). The frontend keeps the captured photo blob in memory between the two calls, so re-sending is cheap; keeping the server stateless avoids needing to cache the photo between `/identify` and `/identify/commit` (no temp storage, no cleanup job).
- Looks up `plant_species` by `latin_name`. If found, uses cached care_thresholds + icon_key.
- If not found, triggers the existing species-enrichment pipeline (Trefle then Claude AI) and inserts the result into `plant_species`. This may take 5-10s on first encounter for a new species; from then on it's cached.
- Saves the photo to `groei/backend/static/uploads/identify_<timestamp>_<random>.jpg`.
- Returns:

```json
{
  "species_id": 42,
  "name_nl_suggested": "Gatenplant",
  "scientific_name": "Monstera deliciosa",
  "icon_key": "monstera",
  "care_thresholds": {"min_temp_c": 10, "max_temp_c": 35, ...},
  "photo_path": "/static/uploads/identify_20260517_152033_a4f.jpg"
}
```

The frontend uses this payload to pre-fill the AddPlant form.

### Icon key matching

The icon catalog (`groei/icons/manifest.json`) keys icons by short names like `monstera`, `fiddle`, `oak`. Matching strategy in `identify/commit`:
1. Exact match on the genus part of the scientific name (`Monstera deliciosa` → genus `monstera` → icon `monstera`).
2. Else exact match on common-name slug (lowercased, ASCII).
3. Else fall back to `icon_key = null` and the AddPlant form will show the existing "no icon" placeholder with the manual icon picker open.

### Error responses

| Condition | HTTP | Body |
|---|---|---|
| Image too large / wrong format | 400 | `{"detail": "Image too large or unsupported format"}` |
| PlantNet quota exceeded (HTTP 429) | 503 | `{"detail": "Identificatie tijdelijk niet beschikbaar"}` |
| PlantNet error or network failure | 502 | `{"detail": "Kon niet verbinden met identificatieservice"}` |
| Unknown scientific_name in commit | 404 | `{"detail": "Soort niet gevonden"}` |

### Configuration

Add `PLANTNET_API_KEY` to `.env` (gitignored — confirmed in current repo). The key is read at module import in `plant_id.py` via `os.environ`. Add `PLANTNET_API_KEY=` (empty default) to `.env.example` if one exists; create it if not.

Pl@ntNet endpoint: `https://my-api.plantnet.org/v2/identify/all?api-key={key}`.

## Frontend

### New page: `groei/frontend/src/pages/IdentifyPlant.tsx`

Three-step state machine inside one route `/identify`:

| Step | UI |
|---|---|
| `camera` | Full-screen camera viewfinder via `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`, large capture button at bottom, close (×) at top-left. |
| `identifying` | Thumbnail of captured photo + spinner + "Identificeren..." |
| `results` | Top 3 candidate cards (confidence bar, scientific name, NL common name, optional thumbnail). Footer: "powered by Pl@ntNet". If `low_confidence`, a yellow banner above the candidates. If empty list, the "no match" screen with retry + manual buttons. |

On candidate tap: POST `/identify/commit` with the same photo (as base64), show "Bezig met opzoeken...", then navigate to `/plant/add` with the pre-fill payload in route state.

### Modified: `groei/frontend/src/pages/AddPlant.tsx`

Two changes:

1. **New entry-choice screen** rendered when no pre-fill is present. Three buttons stacked:
   - `📸 Identificeer met foto` (primary) → navigates to `/identify`
   - `🔍 Kies uit lijst` → opens existing PlantPickerSheet
   - `✏️ Handmatig invullen` → renders the existing manual form

2. **Pre-fill handler** — when the page receives navigation state from IdentifyPlant, skip the entry choice and render the manual form with `name`, `species_id`, `icon_key`, `care_thresholds`, `photo_path` pre-populated. Existing form fields stay editable.

### Modified: `groei/frontend/src/types/index.ts`

Add a `PlantIdCandidate` type and an `IdentifyCommitResult` type matching the backend responses.

### Modified: i18n strings

Add to `groei/frontend/src/i18n/nl.ts` and `en.ts`:
- `addPlant.entry.identify`, `addPlant.entry.pick`, `addPlant.entry.manual`
- `identify.camera.capture`, `identify.identifying`, `identify.results.title`, `identify.results.poweredBy`, `identify.lowConfidence`, `identify.noMatch`, `identify.retry`, `identify.manualFallback`, `identify.errorOffline`, `identify.errorService`, `identify.errorQuota`
- `identify.privacy.notice` ("Foto's worden naar Pl@ntNet gestuurd voor identificatie.")

### Privacy notice

First time the user opens IdentifyPlant on a given device: show a small dismissable banner at the bottom with `identify.privacy.notice`. Acknowledgement is stored in `localStorage` under `groei.identify.privacy_ack` (boolean). Once acked, never shown again on that device.

## Testing

**Backend unit tests** (`groei/backend/tests/test_plant_id.py`):
- `identify()` happy path against a recorded PlantNet response fixture (no live API call in CI).
- Quota exceeded → raises `PlantIdQuotaExceeded`.
- Network error → raises `PlantIdServiceError`.
- Empty results → returns empty list, not None.

**Backend integration tests** (`groei/backend/tests/test_plant_id_endpoint.py`):
- `POST /api/plants/identify` with stubbed `plant_id.identify` → returns up to 3 candidates with attached `species_id` for known species.
- `low_confidence` flag set correctly at the 0.10 and 0.30 boundaries.
- `POST /api/plants/identify/commit` with known species → returns enriched payload from cache without calling Trefle/Claude.
- `POST /api/plants/identify/commit` with unknown species → triggers species pipeline (mocked), inserts row in `plant_species`, returns enriched payload.
- 4xx/5xx error responses match the table above.

**Frontend tests:**
- Snapshot test of the results step given a canonical 3-candidate payload.
- Snapshot test of the no-match screen.
- Snapshot test of the low-confidence banner.

**Manual end-to-end test before merge:** one real photo of a real plant in Leon's garden, full flow through to a saved plant on the map.

## Out of scope

- Multi-image identification with organ hints (`leaf`, `flower`, `fruit`, `bark`). v2.
- Plant health / disease detection. PlantNet doesn't do this; would require Plant.id or similar paid API.
- "What is this plant already in my garden?" — identifying existing plants without adding them. Separate flow if requested.
- Bulk identification (multiple plants in one photo).
- Saving rejected candidates as feedback for future model training.
- Identification for non-plants (mushrooms, insects, weeds-specific) — Kindwise has separate APIs if needed.
- Native mobile camera access beyond what `navigator.mediaDevices` provides — PWA only in Phase 1.
- Auto-detection of plant phase (seed/sprout/young/mature) from the photo — manual via existing AddPlant field.
- Storing the full PlantNet response for audit/debug — recomputable from the photo if ever needed.

## Open questions

None at design time. Implementation plan will surface concrete questions during testing.

## Related work

- `docs/specs/in-progress/2026-05-16-care-system-redesign-design.md` — defines the care profile shape that pre-filled `care_thresholds` will populate.
- Existing species-enrichment pipeline (Trefle + Claude AI) is reused unchanged for unknown species.
- `groei/frontend/src/components/sheets/PlantPickerSheet.tsx` is the existing "pick from list" entry that the new entry-choice screen will route to.
- Icon catalog: `groei/icons/manifest.json` is the source of truth for icon-key matching.

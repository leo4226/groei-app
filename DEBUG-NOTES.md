# Debug Notes — PlantDetail Crash (26 May 2026)

## Symptoom
- PlantList werkt (alle planten zichtbaar)
- PlantDetail laadt: "korte flash" van plant card, daarna navigeert terug naar `/plants`
- Ook via directe URL navigatie (`/plants/{id}`): zelfde flash + redirect

## Wat we weten

### Verschillen List vs Detail endpoint

**`GET /api/plants`** (list — werkt)
- Gebruikt `enrich_plant()` (simpele dict transform)
- Returnt **dict** direct (geen Pydantic)
- Geen care schedules, care thresholds, date coercion

**`GET /api/plants/{id}`** (detail — crasht)
- Gebruikt `enrich_plant_full()` (uit `backend/services/plant_reader.py:116`)
- Roept op:
  1. Care schedules ophalen
  2. `care_thresholds` parsen (wordt uit dict `pop()`-ed)
  3. `phenology_json` parsen met `json.loads()` (heeft `try/except`, dus crash-safe)
  4. **Date coercion voor Pydantic**
- **Returnt door Pydantic**: `PlantOut.model_validate(full)` — dit kan falen

### Frontend
- `PlantDetail.tsx` useEffect: fetch faalt → `.catch(() => navigate('/plants'))`
- Vandaar de "flash": de cached plant uit de store wordt getoond, daarna redirect
- Frontend heeft geen error boundary of fallback UI voor deze case

### Hypothesen (geordend op waarschijnlijkheid)

1. **Pydantic validation error op `care_thresholds` of dates**
   - `enrich_plant_full` parsed data die `PlantOut.model_validate()` niet accepteert
   - Dit geeft een 500 error → frontend catch → redirect
   - `enrich_plant` (zonder care_thresholds/date coercion) werkt wél

2. **Corrupte `phenology_json`**
   - Lege JSON `"{}"` parseert naar `{}` — truthy in JS → PhaseCalendar crashed op `undefined.find()`
   - Maar: backend `try/except` vangt JSON parse errors al af
   - Mogelijk: JSON.parse slaagt maar returned `{}` ipv `{"months": [...]}`

3. **Care schedules ophalen** faalt (DB error, constraint violation)

### Om morgen te checken
1. [ ] Live API hit met auth: `curl -H "Authorization: Bearer <token>" https://api.floreren.app/api/plants/1` — kijk of HTTP 500 terugkomt
2. [ ] Zo ja: welke error message staat in de response body?
3. [ ] Fly.io logs als token wél logs mag lezen (`flyctl auth login` met interactieve login, niet alleen deploy token)

### Voorgestelde fixes
- Backend: `try/except` om `PlantOut.model_validate()` call in detail route
- Frontend: error state tonen ipv redirect

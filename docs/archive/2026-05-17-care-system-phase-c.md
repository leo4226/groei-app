# Phase C — Surface Migration Plan

## Goal
Switch all 4 UI surfaces from the old alert/schedule pipeline to the new unified `compute_plant_warnings()` / `care_profile` system.

## Strategy
- One surface at a time: Plant Detail → Map View → Dashboard → Calendar
- Each step: connect to new data source, remove old code path for that surface
- No `USE_UNIFIED_WARNINGS` flag needed — Phase A+B data is already live

---

### C1 — Plant Detail: "Verzorgingsprofiel" sectie

**Backend**
- `PATCH /api/plants/{id}/care-profile` — save edited care_profile JSON
- Accepts partial patch (alleen gewijzigde care types)

**Frontend**
- `useCareProfile(plantId)` hook — fetch warnings, load care_profile
- `<CareProfileSection>` component in `PlantDetail.tsx`:
  - Elke care type als rij: toggle active/inactive, interval slider, thresholds
  - "Reset to species default" per field
  - "Species default" badge vs "custom" badge
- Verwijder oude `plant.care_schedules.map()` rendering (quick action buttons blijven)
- Verplaats quick-action buttons naar header of aparte actiebar

---

### C2 — Map View: halos, badges, legend

**Backend: `maps/{slug}/items`**
- Roep `compute_plant_warnings()` aan ipv `enrich_plants()` + `alert_service.py`
- Stuur `top_warning` + `warnings[]` mee als `CareWarning` dicts
- Laat `care_status`/`temp_status`/`most_urgent` in response voor backward compat tot Phase D

**Frontend**
- `getHaloColor(plant)` — lees `plant.top_warning.color` direct, verwijder legacy `getHaloStatus()`
- `halo_visible_for_ground` check: read from `plant.environment` + `care_types.py`
- Alert badges: gebruik `plant.warnings[i].icon` direct
- `MapLegend.tsx`: groepeer op care type (💧 Water (3) · 🪴 Verpotten (2)), dan severity
- Verwijder priority logica uit `usePlantStatus.ts`

---

### C3 — Dashboard: filter chip, KPI grid, buckets

**Backend**
- `GET /api/warnings/summary?env=tuin|huis|all` — nieuwe endpoint:
  - Vraagt alle actieve plants op per household
  - Roep `compute_plant_warnings()` per plant
  - Accumuleer KPI counts per care type + severity
  - Return bucket lists: nu / vandaag / komende week
- Object shape: `{ kpis: CareTypeKPI[], buckets: {...}, plants: PlantWarningState[] }`

**Frontend**
- Filter chip — `Alles | 🏡 Tuin | 🪴 Huis` (persists in URL param)
- `StatusBanner` → KPI grid: één tile per care type met non-zero count
- `TodayGrid` → 3 buckets: Nu (overdue), Vandaag (due_today), Komende week (upcoming)
- Verwijder `fetchDashboardV2()` → switch naar `/api/warnings/summary`

---

### C4 — Calendar

**Backend: `GET /api/calendar/events`**
- Switch van directe `care_schedules` query naar pipeline-derived events
- Voeg `severity` en `color` velden toe aan response
- Voeg mist/rotate/dust/pest_check care types toe als event types

**Frontend**
- `calendarTypes.ts`: voeg mist, rotate, dust, pest_check, pest_control toe
- `CalendarAgendaCard`: toon severity (kleur/maat)
- Overige calendar componenten blijven grotendeels gelijk

---

### C5 — Tests

- Update `conftest.py` test schema met `species_care_defaults` table
- Backend tests voor `/api/warnings/summary`
- Backend tests voor `PATCH /api/plants/{id}/care-profile`
- Frontend: snapshot tests PlantMarker halo + badges
- Parity test: oude vs nieuwe map items response

## Order
1. C1: Plant Detail Verzorgingsprofiel (backend + frontend)
2. C2: Map View halos/badges/legend (backend + frontend)
3. C3: Dashboard (backend + frontend)
4. C4: Calendar (backend + frontend)
5. C5: Tests + verify

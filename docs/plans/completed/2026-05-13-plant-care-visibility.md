# Plant Care Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make plant care status visible everywhere — map markers (halo + badge), legend (split sections), QuickSheet (all schedules), and dashboard (auto-seeded from species) — by embedding a `top_alert` in map plant data and auto-creating care schedules from species defaults.

**Architecture:** A new `services/alert_service.py` extracts alert computation (previously inline in `routers/alerts.py`) and adds `compute_top_alert` which `services/plant_reader.py` calls during `enrich_plants`. Backend adds `water_interval_days` to species/threshold data and auto-seeds `care_schedules` on plant creation. Frontend consumes `top_alert` from `MapPlant` for halo severity + badge icon.

**Tech Stack:** FastAPI + aiosqlite (backend), React 19 + TypeScript + SVG (frontend), Claude Haiku via `threshold_service.py` for species defaults.

---

## File Map

### New files
- `groei/backend/services/alert_service.py` — `compute_alerts()` + `compute_top_alert()` (extracted from `routers/alerts.py`, map-type-aware)

### Backend modifications
- `groei/backend/database/migrations.py` — add `water_interval_days INTEGER` to `plant_species`
- `groei/backend/threshold_service.py` — add `water_interval_days` to Haiku prompt + `_REQUIRED_KEYS`
- `groei/backend/models.py` — add `TopAlert` model; add `top_alert` field to `MapPlantOut`
- `groei/backend/services/plant_reader.py` — update `enrich_plants` signature to accept `rain_data`, `last_watered`, `map_type`; compute and set `top_alert` per plant
- `groei/backend/routers/alerts.py` — replace local `_compute_alerts` with import from `alert_service`
- `groei/backend/routers/maps.py` — fetch `map_type` + weather data; pass to `enrich_plants` in both `get_map_plants` and `get_map_items`
- `groei/backend/routers/plants.py` — add `_seed_care_schedules` helper; call it after threshold generation
- `groei/backend/routers/admin.py` — add `POST /admin/backfill-care-schedules` endpoint

### Frontend modifications
- `groei/frontend/src/types/index.ts` — add `TopAlert` interface; add `top_alert` to `MapPlant`
- `groei/frontend/src/hooks/usePlantStatus.ts` — add `SEVERITY_HALO_COLORS` + `getHaloColor(plant)`; keep `HALO_COLORS`/`getHaloStatus` for Dashboard backward compat
- `groei/frontend/src/components/map/PlantMarker.tsx` — use `getHaloColor`; add alert badge icon (top-right corner)
- `groei/frontend/src/components/map/MapLegend.tsx` — split into "Aandacht nodig" / "Alles goed" sections; show alert icon badge per plant
- `groei/frontend/src/components/sheets/PlantQuickSheet.tsx` — lazy-fetch full `PlantOut` on open; show all care schedules with days overdue/until

---

## Task 1: DB migration — add water_interval_days to plant_species

**Files:**
- Modify: `groei/backend/database/migrations.py`

- [ ] **Step 1: Add migration**

  Open `groei/backend/database/migrations.py` and append inside `apply()`, after the existing `plant_species: care_thresholds` block (after line 58):

  ```python
  # ── plant_species: water_interval_days ──
  sp_cols2 = {row[1] for row in await db.execute_fetchall("PRAGMA table_info(plant_species)")}
  if "water_interval_days" not in sp_cols2:
      await db.execute("ALTER TABLE plant_species ADD COLUMN water_interval_days INTEGER")
  ```

- [ ] **Step 2: Verify migration runs**

  With the dev server stopped, run:
  ```
  cd groei && npm run dev:backend
  ```
  In a new terminal:
  ```
  curl http://localhost:8000/api/health
  ```
  Then stop the server and check the column exists:
  ```
  cd groei/backend && python -c "import asyncio, aiosqlite; asyncio.run(main())"
  ```
  Where `main` is:
  ```python
  async def main():
      async with aiosqlite.connect('groei.db') as db:
          rows = await db.execute_fetchall("PRAGMA table_info(plant_species)")
          print([r[1] for r in rows])
  ```
  Expected: `water_interval_days` appears in the column list.

- [ ] **Step 3: Commit**

  ```bash
  git add groei/backend/database/migrations.py
  git commit -m "feat: add water_interval_days column to plant_species"
  ```

---

## Task 2: Extend threshold_service to generate water_interval_days

**Files:**
- Modify: `groei/backend/threshold_service.py`

- [ ] **Step 1: Update `_REQUIRED_KEYS` and prompt**

  In `groei/backend/threshold_service.py`, replace `_REQUIRED_KEYS` and `_build_prompt`:

  ```python
  _REQUIRED_KEYS = {
      "drought_mm_per_week",
      "waterlog_mm_per_week",
      "min_temp_c",
      "max_temp_c",
      "bring_inside_below_c",
      "fertilise_months",
      "fertilise_tip",
      "water_interval_days",
  }


  def _build_prompt(plant_name: str, species: str | None) -> str:
      species_part = f" (soort: {species})" if species else ""
      return f"""Geef verzorgingsdrempelwaarden voor de plant: {plant_name}{species_part}

  Geef ALLEEN geldige JSON terug, zonder extra tekst of markdown. Gebruik dit exacte formaat:
  {{
    "drought_mm_per_week": <int, neerslag onder dit niveau = te droog>,
    "waterlog_mm_per_week": <int, neerslag boven dit niveau = te nat>,
    "min_temp_c": <float, plant krijgt stress onder deze temperatuur>,
    "max_temp_c": <float, plant krijgt stress boven deze temperatuur>,
    "bring_inside_below_c": <float of null, null voor volledig winterharde buitenplanten>,
    "fertilise_months": [<int 1-12>, ...],
    "fertilise_tip": "<string max 80 tekens, Nederlandse bemestingstip>",
    "water_interval_days": <int, gemiddeld aantal dagen tussen handmatig water geven, bijv. 7 voor wekelijks>
  }}"""
  ```

- [ ] **Step 2: Verify Haiku still returns valid JSON**

  Start the backend. Then trigger threshold generation for one plant:
  ```
  curl -s -X POST http://localhost:8000/api/admin/backfill-thresholds | python -m json.tool
  ```
  If any plants lack thresholds they'll be generated now. Spot-check one plant's `care_thresholds` column in the DB to confirm `water_interval_days` is present (existing plants won't have it until the backfill in Task 8 runs with the new prompt).

- [ ] **Step 3: Commit**

  ```bash
  git add groei/backend/threshold_service.py
  git commit -m "feat: add water_interval_days to care threshold generation prompt"
  ```

---

## Task 3: Create services/alert_service.py

**Files:**
- Create: `groei/backend/services/alert_service.py`

This extracts `_compute_alerts` from `routers/alerts.py` into a service, adds `map_type` filtering, and adds `compute_top_alert`.

- [ ] **Step 1: Create the file**

  Create `groei/backend/services/alert_service.py`:

  ```python
  """Alert computation service.

  Provides compute_alerts (full Dutch messages, map-type-aware) and
  compute_top_alert (single worst alert for map marker display).
  """
  import json
  from datetime import date, datetime

  _SEVERITY_ORDER = {"urgent": 2, "warning": 1, "info": 0}
  _MANUAL_WATER_DAYS = 3
  _INDOOR_SKIP = {"drought", "waterlog", "bring_inside"}


  def _fmt_date_nl(d: date) -> str:
      MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"]
      return f"{d.day} {MONTHS[d.month - 1]}"


  def compute_alerts(
      thresholds: dict,
      rain: dict,
      temp: dict,
      last_watered: date | None = None,
      map_type: str = "outdoor",
  ) -> list[dict]:
      """Return all active alerts for a plant. Skips weather alerts irrelevant to indoor maps."""
      alerts = []
      total_mm = rain["total_7day_mm"]
      temp_days = temp["days"]
      current_month = datetime.now().month
      skip = _INDOOR_SKIP if map_type == "indoor" else set()

      drought_thresh = thresholds.get("drought_mm_per_week", 0)
      waterlog_thresh = thresholds.get("waterlog_mm_per_week", 9999)
      min_temp = thresholds.get("min_temp_c")
      max_temp = thresholds.get("max_temp_c")
      bring_inside = thresholds.get("bring_inside_below_c")
      fertilise_months = thresholds.get("fertilise_months") or []
      fertilise_tip = thresholds.get("fertilise_tip", "")

      if "drought" not in skip and drought_thresh and total_mm < drought_thresh:
          recently_watered = (
              last_watered is not None
              and (date.today() - last_watered).days < _MANUAL_WATER_DAYS
          )
          if recently_watered:
              alerts.append({"type": "drought", "severity": "info",
                  "message_nl": f"Weinig regen ({total_mm}mm), maar je hebt op {_fmt_date_nl(last_watered)} water gegeven — voorlopig in orde.",
                  "icon": "💧"})
          elif total_mm < drought_thresh * 0.5:
              alerts.append({"type": "drought", "severity": "urgent",
                  "message_nl": f"Zeer weinig regen deze week ({total_mm}mm). Geef direct extra water.",
                  "icon": "💧"})
          else:
              alerts.append({"type": "drought", "severity": "warning",
                  "message_nl": f"Weinig neerslag deze week ({total_mm}mm). Overweeg extra water te geven.",
                  "icon": "💧"})

      if "waterlog" not in skip and waterlog_thresh and total_mm > waterlog_thresh:
          if total_mm > waterlog_thresh * 2:
              alerts.append({"type": "waterlog", "severity": "urgent",
                  "message_nl": f"Extreem veel regen ({total_mm}mm). Controleer drainage om wortels te beschermen.",
                  "icon": "🌧️"})
          else:
              alerts.append({"type": "waterlog", "severity": "warning",
                  "message_nl": f"Veel neerslag deze week ({total_mm}mm). Let op wateroverlast.",
                  "icon": "🌧️"})

      if min_temp is not None and temp_days:
          week_min = min(d["min"] for d in temp_days)
          if week_min < min_temp:
              alerts.append({"type": "cold", "severity": "urgent",
                  "message_nl": f"Temperatuur daalde tot {week_min}°C, onder de stressgrens van {min_temp}°C.",
                  "icon": "🥶"})
          elif week_min < min_temp + 3:
              alerts.append({"type": "cold", "severity": "warning",
                  "message_nl": f"Minimum temperatuur ({week_min}°C) nadert de stressgrens ({min_temp}°C).",
                  "icon": "🥶"})

      if max_temp is not None and temp_days:
          week_max = max(d["max"] for d in temp_days)
          if week_max > max_temp:
              alerts.append({"type": "heat", "severity": "urgent",
                  "message_nl": f"Temperatuur bereikte {week_max}°C, boven de stressgrens van {max_temp}°C.",
                  "icon": "🌡️"})
          elif week_max > max_temp - 3:
              alerts.append({"type": "heat", "severity": "warning",
                  "message_nl": f"Maximum temperatuur ({week_max}°C) nadert de stressgrens ({max_temp}°C).",
                  "icon": "🌡️"})

      if "bring_inside" not in skip and bring_inside is not None and temp_days:
          week_min = min(d["min"] for d in temp_days)
          if week_min < bring_inside:
              alerts.append({"type": "bring_inside", "severity": "urgent",
                  "message_nl": f"Temperatuur daalde tot {week_min}°C. Zet deze plant naar binnen (grens: {bring_inside}°C).",
                  "icon": "🏠"})

      if current_month in fertilise_months:
          tip = fertilise_tip or "Nu is het een goed moment om te bemesten."
          alerts.append({"type": "fertilise", "severity": "info", "message_nl": tip, "icon": "🌿"})

      return alerts


  def compute_top_alert(
      care_status: str,
      care_thresholds_json: str | None,
      rain: dict | None,
      temp: dict | None,
      last_watered: date | None,
      map_type: str = "outdoor",
  ) -> dict | None:
      """Return the single worst alert (alert_type, severity, icon) for map marker display.

      Returns None when the plant has no active alerts.
      """
      alerts = []

      if care_status == "overdue":
          alerts.append({"alert_type": "overdue_water", "severity": "urgent", "icon": "💧"})
      elif care_status == "due_today":
          alerts.append({"alert_type": "due_today", "severity": "info", "icon": "💧"})

      if care_thresholds_json and rain and temp:
          try:
              thresholds = json.loads(care_thresholds_json)
          except (json.JSONDecodeError, TypeError):
              thresholds = {}
          for a in compute_alerts(thresholds, rain, temp, last_watered, map_type):
              alerts.append({"alert_type": a["type"], "severity": a["severity"], "icon": a["icon"]})

      if not alerts:
          return None

      alerts.sort(key=lambda a: _SEVERITY_ORDER.get(a["severity"], 0), reverse=True)
      return alerts[0]
  ```

- [ ] **Step 2: Verify import works**

  ```bash
  cd groei/backend && python -c "from services.alert_service import compute_top_alert; print('OK')"
  ```
  Expected output: `OK`

- [ ] **Step 3: Update routers/alerts.py to use the service**

  In `groei/backend/routers/alerts.py`, replace the imports and the `_compute_alerts` function:

  Remove lines 1-17 (the old imports and `_compute_alerts` definition). Replace with:

  ```python
  from datetime import date, datetime

  from fastapi import APIRouter, HTTPException, Depends

  from database import db_dep
  from routers.plant_care import _get_rain_data, _get_temp_data, get_last_garden_watered
  from services.alert_service import compute_alerts, _SEVERITY_ORDER

  router = APIRouter(tags=["alerts"])
  ```

  Then in `get_plant_alerts` (line ~139), replace `_compute_alerts(thresholds, rain, temp, last_watered)` with `compute_alerts(thresholds, rain, temp, last_watered)`.

  In `get_alerts_summary`, replace `_compute_alerts(thresholds, rain, temp, last_watered)` with `compute_alerts(thresholds, rain, temp, last_watered)`.

  Also remove the local `_SEVERITY_ORDER` dict and `_fmt_date_nl` function since they now live in `alert_service.py`.

- [ ] **Step 4: Verify alerts endpoint still works**

  Start the backend, then:
  ```
  curl http://localhost:8000/api/alerts/summary
  ```
  Expected: JSON with `total_count`, `worst_severity`, `plant_ids_with_alerts`.

- [ ] **Step 5: Commit**

  ```bash
  git add groei/backend/services/alert_service.py groei/backend/routers/alerts.py
  git commit -m "refactor: extract alert computation to services/alert_service.py with map_type support"
  ```

---

## Task 4: Add TopAlert model and update MapPlantOut

**Files:**
- Modify: `groei/backend/models.py`

- [ ] **Step 1: Add TopAlert model**

  In `groei/backend/models.py`, after the `PlantAlert` class (~line 112), add:

  ```python
  class TopAlert(BaseModel):
      alert_type: str   # overdue_water | due_today | drought | waterlog | cold | heat | bring_inside | fertilise
      severity: str     # urgent | warning | info
      icon: str
  ```

- [ ] **Step 2: Add top_alert to MapPlantOut**

  In `MapPlantOut` (~line 237), add after `is_locked`:

  ```python
  top_alert: TopAlert | None = None
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add groei/backend/models.py
  git commit -m "feat: add TopAlert model and top_alert field to MapPlantOut"
  ```

---

## Task 5: Embed top_alert in enrich_plants and update maps.py

**Files:**
- Modify: `groei/backend/services/plant_reader.py`
- Modify: `groei/backend/routers/maps.py`

- [ ] **Step 1: Update enrich_plants signature and logic**

  In `groei/backend/services/plant_reader.py`:

  Add import at the top:
  ```python
  from services.alert_service import compute_top_alert
  ```

  Replace the `enrich_plants` function signature and body:

  ```python
  async def enrich_plants(db, plant_rows, today, temp_data=None, rain_data=None, last_watered=None, map_type="outdoor"):
      """Batch-enrich plant dicts. Single query for all schedules (fixes N+1)."""
      if not plant_rows:
          return []

      plants = [dict(r) for r in plant_rows]
      plant_ids = [p["id"] for p in plants]

      placeholders = ",".join("?" for _ in plant_ids)
      sched_rows = await db.execute_fetchall(
          f"""SELECT cs.care_type, cs.next_due, cs.plant_id, u.name as last_done_by_name
              FROM care_schedules cs
              LEFT JOIN users u ON cs.last_done_by = u.id
              WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1
              ORDER BY cs.plant_id, cs.next_due ASC""",
          plant_ids,
      )

      schedules_by_plant = {}
      for row in sched_rows:
          r = dict(row)
          pid = r["plant_id"]
          if pid not in schedules_by_plant:
              schedules_by_plant[pid] = []
          schedules_by_plant[pid].append(r)

      for plant in plants:
          pid = plant["id"]
          schedules = schedules_by_plant.get(pid, [])
          plant["care_status"], plant["most_urgent"] = _compute_care_status(schedules, today)

          care_thresholds = plant.pop("care_thresholds", None)
          if temp_data is not None:
              plant["temp_status"] = _compute_temp_status(care_thresholds, temp_data)
          else:
              plant["temp_status"] = "comfortable"

          plant["top_alert"] = compute_top_alert(
              care_status=plant["care_status"],
              care_thresholds_json=care_thresholds,
              rain=rain_data,
              temp=temp_data,
              last_watered=last_watered,
              map_type=map_type,
          )

          phenology_json = plant.pop("phenology_json", None)
          plant["phenology"] = json.loads(phenology_json) if phenology_json else None

      return plants
  ```

- [ ] **Step 2: Update maps.py to pass map_type + weather**

  In `groei/backend/routers/maps.py`, update the imports:

  ```python
  from routers.plant_care import _get_temp_data, _get_rain_data
  from routers.alerts import get_last_garden_watered
  ```

  Replace `get_map_plants` (the `GET /maps/{slug}/plants` endpoint):

  ```python
  @router.get("/maps/{slug}/plants", response_model=list[MapPlantOut])
  async def get_map_plants(slug: str, db = Depends(db_dep)):
      map_row = await db.execute_fetchall(
          "SELECT id, map_type FROM maps WHERE slug = ?", (slug,)
      )
      if not map_row:
          raise HTTPException(404, "Map not found")
      map_id = map_row[0]["id"]
      map_type = map_row[0]["map_type"] or "outdoor"

      plant_rows = await db.execute_fetchall(
          """SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path,
                    p.container_id, p.ground_zone_id, p.display_radius_cm,
                    p.sun_requirement, p.plant_type, p.icon_key, p.species_id,
                    p.is_locked, p.care_thresholds,
                    s.phenology_json
             FROM plants p
             LEFT JOIN plant_species s ON p.species_id = s.id
             WHERE p.map_id = ? AND p.is_active = 1 AND p.map_x IS NOT NULL AND p.map_y IS NOT NULL""",
          (map_id,),
      )
      today = date.today().isoformat()
      temp_data = await _get_temp_data()
      rain_data = await _get_rain_data()
      last_watered = await get_last_garden_watered()
      return await enrich_plants(db, plant_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, map_type=map_type)
  ```

  In `get_map_items`, update the map query to fetch `map_type`:

  ```python
  map_row = await db.execute_fetchall("SELECT id, map_type FROM maps WHERE slug = ?", (slug,))
  if not map_row:
      raise HTTPException(404, "Map not found")
  map_id = map_row[0]["id"]
  map_type = map_row[0]["map_type"] or "outdoor"
  today = date.today().isoformat()
  temp_data = await _get_temp_data()
  rain_data = await _get_rain_data()
  last_watered = await get_last_garden_watered()
  ```

  Update each `enrich_plants` call in `get_map_items` to pass the new params:
  ```python
  plants = await enrich_plants(db, plant_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, map_type=map_type)
  ```
  and
  ```python
  contained = await enrich_plants(db, contained_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, map_type=map_type)
  ```

- [ ] **Step 3: Verify top_alert appears in API response**

  Start dev server (`npm run dev` from `groei/`). Then:
  ```
  curl -s http://localhost:8000/api/maps/tuin/items | python -m json.tool | grep -A4 top_alert
  ```
  (Replace `tuin` with your map slug.) Expected: each plant in `plants` array has a `top_alert` key (either null or `{"alert_type": "...", "severity": "...", "icon": "..."}`).

- [ ] **Step 4: Commit**

  ```bash
  git add groei/backend/services/plant_reader.py groei/backend/routers/maps.py
  git commit -m "feat: embed top_alert in map plant payload (severity + icon, map-type-aware)"
  ```

---

## Task 6: Auto-seed care_schedules on plant creation

**Files:**
- Modify: `groei/backend/routers/plants.py`

- [ ] **Step 1: Add _seed_care_schedules helper**

  In `groei/backend/routers/plants.py`, add after the imports:

  ```python
  from datetime import date as _date, timedelta as _timedelta
  ```

  Add this function before the route definitions:

  ```python
  async def _seed_care_schedules(db, plant_id: int, thresholds_json: str) -> None:
      """Create care_schedules for a plant from its threshold data. Idempotent — skips if schedule exists."""
      try:
          thresholds = json.loads(thresholds_json)
      except (json.JSONDecodeError, TypeError):
          return

      water_interval = thresholds.get("water_interval_days")
      fertilise_months = thresholds.get("fertilise_months") or []

      if water_interval:
          existing = await db.execute_fetchall(
              "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'water' AND is_active = 1",
              (plant_id,),
          )
          if not existing:
              await db.execute(
                  "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES (?, 'water', ?, date('now'))",
                  (plant_id, int(water_interval)),
              )

      if fertilise_months:
          existing = await db.execute_fetchall(
              "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'fertilize' AND is_active = 1",
              (plant_id,),
          )
          if not existing:
              today = _date.today()
              current_month = today.month
              sorted_months = sorted(fertilise_months)
              next_month = next((m for m in sorted_months if m >= current_month), sorted_months[0])
              if next_month >= current_month:
                  next_due = _date(today.year, next_month, 1)
              else:
                  next_due = _date(today.year + 1, next_month, 1)
              interval = max(30, 365 // len(fertilise_months))
              await db.execute(
                  "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES (?, 'fertilize', ?, ?)",
                  (plant_id, interval, str(next_due)),
              )

      await db.commit()
  ```

- [ ] **Step 2: Call _seed_care_schedules after threshold storage**

  In `create_plant`, find the threshold storage block (~lines 134-148):

  ```python
      if cached:
          await db.execute(
              "UPDATE plants SET care_thresholds = ? WHERE id = ?",
              (cached, plant_id),
          )
          await db.commit()
      else:
          thresholds = await generate_thresholds(data.name, data.species)
          await db.execute(
              "UPDATE plants SET care_thresholds = ? WHERE id = ?",
              (json.dumps(thresholds), plant_id),
          )
          await db.commit()
  ```

  After each `await db.commit()` block, add the seed call. Replace the entire `if cached: ... else: ...` block with:

  ```python
      if cached:
          await db.execute(
              "UPDATE plants SET care_thresholds = ? WHERE id = ?",
              (cached, plant_id),
          )
          await db.commit()
          await _seed_care_schedules(db, plant_id, cached)
      else:
          thresholds = await generate_thresholds(data.name, data.species)
          thresholds_json = json.dumps(thresholds)
          await db.execute(
              "UPDATE plants SET care_thresholds = ? WHERE id = ?",
              (thresholds_json, plant_id),
          )
          await db.commit()
          await _seed_care_schedules(db, plant_id, thresholds_json)
  ```

- [ ] **Step 3: Verify by creating a test plant**

  With dev server running:
  ```
  curl -s -X POST http://localhost:8000/api/plants \
    -H "Content-Type: application/json" \
    -d '{"name":"Testplant","species":"Monstera deliciosa","user_id":1}' \
    | python -m json.tool
  ```
  Then check care_schedules:
  ```
  curl -s http://localhost:8000/api/plants/<new_id> | python -m json.tool | grep -A5 care_schedules
  ```
  Expected: `care_schedules` contains at least a `water` entry with `interval_days` set.

- [ ] **Step 4: Commit**

  ```bash
  git add groei/backend/routers/plants.py
  git commit -m "feat: auto-seed care_schedules from species thresholds on plant creation"
  ```

---

## Task 7: Admin backfill — seed schedules for existing plants

**Files:**
- Modify: `groei/backend/routers/admin.py`

- [ ] **Step 1: Add backfill endpoint**

  In `groei/backend/routers/admin.py`, add import and endpoint:

  ```python
  import json

  from fastapi import APIRouter, Depends

  from database import db_dep
  from threshold_service import generate_thresholds
  from routers.plants import _seed_care_schedules

  router = APIRouter(tags=["admin"])

  # ... existing backfill_thresholds endpoint ...


  @router.post("/admin/backfill-care-schedules")
  async def backfill_care_schedules(db = Depends(db_dep)):
      """Seed care_schedules for all active plants that have thresholds but no water schedule."""
      rows = await db.execute_fetchall(
          """SELECT p.id, p.care_thresholds FROM plants p
             WHERE p.care_thresholds IS NOT NULL AND p.is_active = 1
             AND p.id NOT IN (
                 SELECT DISTINCT plant_id FROM care_schedules WHERE care_type = 'water' AND is_active = 1
             )"""
      )

      seeded = 0
      for row in rows:
          try:
              await _seed_care_schedules(db, row["id"], row["care_thresholds"])
              seeded += 1
          except Exception as exc:
              print(f"Warning: could not seed schedules for plant {row['id']}: {exc}")

      return {"checked": len(rows), "seeded": seeded}
  ```

- [ ] **Step 2: Run the backfill**

  With the dev server running:
  ```
  curl -s -X POST http://localhost:8000/api/admin/backfill-care-schedules | python -m json.tool
  ```
  Expected: `{"checked": N, "seeded": M}` where M > 0 for any plants that had thresholds but no schedules.

- [ ] **Step 3: Verify dashboard now shows tasks**

  Open the app at `http://localhost:5173/dashboard`. The "Vandaag" section should now show plant task cards instead of the "Een rustige dag in de tuin" empty state — provided at least one plant's `next_due` is today or in the past.

  If all plants have `next_due = today` (set by `date('now')`), you'll see them in the `due_today` bucket.

- [ ] **Step 4: Commit**

  ```bash
  git add groei/backend/routers/admin.py
  git commit -m "feat: add admin endpoint to backfill care schedules for existing plants"
  ```

---

## Task 8: Frontend types and hook update

**Files:**
- Modify: `groei/frontend/src/types/index.ts`
- Modify: `groei/frontend/src/hooks/usePlantStatus.ts`

- [ ] **Step 1: Add TopAlert to types/index.ts**

  In `groei/frontend/src/types/index.ts`, add before the `MapPlant` interface:

  ```typescript
  export interface TopAlert {
    alert_type: string  // overdue_water | due_today | drought | waterlog | cold | heat | bring_inside | fertilise
    severity: 'urgent' | 'warning' | 'info'
    icon: string
  }
  ```

  In the `MapPlant` interface, add after `is_locked`:

  ```typescript
  top_alert: TopAlert | null
  ```

- [ ] **Step 2: Add getHaloColor to usePlantStatus.ts**

  In `groei/frontend/src/hooks/usePlantStatus.ts`, add after `HALO_COLORS`:

  ```typescript
  import type { MapPlant } from '../types'

  export const SEVERITY_HALO_COLORS: Record<'urgent' | 'warning' | 'info', string> = {
    urgent:  '#ea0706',
    warning: '#ff7701',
    info:    '#FFC233',
  }

  /**
   * Returns the halo colour for a map plant marker based on its top_alert severity.
   * Falls back to the legacy getHaloStatus path if top_alert is absent (e.g. stale cache).
   */
  export function getHaloColor(plant: MapPlant): string | null {
    if (plant.top_alert) return SEVERITY_HALO_COLORS[plant.top_alert.severity]
    // Legacy fallback — remove once all API responses include top_alert
    const legacy = getHaloStatus(plant)
    return legacy ? HALO_COLORS[legacy] : null
  }
  ```

  Note: keep `getHaloStatus` and `HALO_COLORS` — they are still used in `Dashboard.tsx` task cards which work with `CareTask` (no `top_alert`).

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd groei && npm run dev:frontend
  ```
  Expected: Vite starts with no TypeScript errors in the console.

- [ ] **Step 4: Commit**

  ```bash
  git add groei/frontend/src/types/index.ts groei/frontend/src/hooks/usePlantStatus.ts
  git commit -m "feat: add TopAlert type and severity-based getHaloColor hook"
  ```

---

## Task 9: PlantMarker — severity halo + alert badge icon

**Files:**
- Modify: `groei/frontend/src/components/map/PlantMarker.tsx`

- [ ] **Step 1: Switch halo to use getHaloColor**

  In `groei/frontend/src/components/map/PlantMarker.tsx`, replace:

  ```typescript
  import { getHaloStatus, HALO_COLORS } from '../../hooks/usePlantStatus'
  ```

  with:

  ```typescript
  import { getHaloColor } from '../../hooks/usePlantStatus'
  ```

  Then replace:

  ```typescript
  const haloStatus = getHaloStatus(plant)
  const haloColor  = haloStatus ? HALO_COLORS[haloStatus] : null
  ```

  with:

  ```typescript
  const haloColor = getHaloColor(plant)
  const alertIcon = plant.top_alert?.icon ?? null
  ```

- [ ] **Step 2: Add alert badge to unlocked plant rendering**

  In the unlocked plant `return` block, after the closing `</g>` of the `<g transform={rot}>` block (after the drag pill, before the final `</g>`), add:

  ```tsx
  {/* Alert badge — top-right corner, shows alert type icon */}
  {alertIcon && (
    <g style={{ pointerEvents: 'none' }}>
      <circle
        cx={iconR * 0.72}
        cy={-(iconR * 0.72)}
        r={7}
        fill="white"
        stroke={haloColor ?? '#888'}
        strokeWidth={1.5}
      />
      <text
        x={iconR * 0.72}
        y={-(iconR * 0.72)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {alertIcon}
      </text>
    </g>
  )}
  ```

- [ ] **Step 3: Verify in browser**

  Open `http://localhost:5173/map/tuin` (replace with your map slug). Plants with overdue care or weather alerts should show:
  - A coloured radial halo (red = urgent, orange = warning, yellow = info)
  - A small badge icon (💧 🥶 🌡️ etc.) at the top-right corner

  Plants with no issues should have no halo and no badge.

- [ ] **Step 4: Commit**

  ```bash
  git add groei/frontend/src/components/map/PlantMarker.tsx
  git commit -m "feat: plant marker shows severity halo + alert type badge icon"
  ```

---

## Task 10: MapLegend — split sections + alert badges

**Files:**
- Modify: `groei/frontend/src/components/map/MapLegend.tsx`

- [ ] **Step 1: Replace MapLegend implementation**

  Replace the entire contents of `groei/frontend/src/components/map/MapLegend.tsx`:

  ```tsx
  import type { MapPlant, MapObject } from '../../types'
  import { SEVERITY_HALO_COLORS } from '../../hooks/usePlantStatus'

  interface Props {
    plants: MapPlant[]
    objects: MapObject[]
    onPlantTap: (plant: MapPlant) => void
  }

  type PlantWithMeta = MapPlant & { containerName?: string }

  export default function MapLegend({ plants, objects, onPlantTap }: Props) {
    const containedPlants: PlantWithMeta[] = objects.flatMap((obj) =>
      obj.contained_plants.map((p) => ({ ...p, containerName: obj.name }))
    )

    const allPlants: PlantWithMeta[] = [...plants, ...containedPlants].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

    if (allPlants.length === 0) return null

    const alertPlants = allPlants.filter(p => p.top_alert !== null)
    const goodPlants  = allPlants.filter(p => p.top_alert === null)

    return (
      <div className="bg-surface/95 backdrop-blur-sm rounded-xl border border-border shadow-sm p-3 min-w-[150px]">
        {alertPlants.length > 0 && (
          <>
            <h3 className="text-[9px] font-semibold text-overdue uppercase tracking-wider mb-1.5">
              Aandacht nodig
            </h3>
            <ul className="space-y-1 mb-3">
              {alertPlants.map(plant => (
                <PlantRow key={plant.id} plant={plant} onTap={onPlantTap} />
              ))}
            </ul>
          </>
        )}
        {goodPlants.length > 0 && (
          <>
            <h3 className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Alles goed
            </h3>
            <ul className="space-y-1">
              {goodPlants.map(plant => (
                <PlantRow key={plant.id} plant={plant} onTap={onPlantTap} />
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  function PlantRow({ plant, onTap }: { plant: PlantWithMeta; onTap: (p: MapPlant) => void }) {
    const dotColor = plant.top_alert
      ? SEVERITY_HALO_COLORS[plant.top_alert.severity]
      : '#24e34c'
    const containerName = plant.containerName ?? null

    return (
      <li
        className="flex items-center gap-2 cursor-pointer rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-bg active:bg-bg transition-colors"
        onClick={() => onTap(plant)}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <span className="flex-1 min-w-0">
          <span className="text-xs text-text truncate block">{plant.name}</span>
          {containerName && (
            <span className="text-[9px] text-text-muted truncate block">in {containerName}</span>
          )}
        </span>
        {plant.top_alert && (
          <span className="text-[11px] shrink-0" title={plant.top_alert.alert_type}>
            {plant.top_alert.icon}
          </span>
        )}
      </li>
    )
  }
  ```

- [ ] **Step 2: Check MapLegend props call sites**

  Grep for `MapLegend` in the frontend to find where it's rendered:
  ```
  grep -r "MapLegend" groei/frontend/src --include="*.tsx"
  ```
  Verify the call site still passes `plants`, `objects`, and `onPlantTap`. The `heatmapCells` prop was removed from this implementation — if the call site passes it, remove that prop from the call (it's no longer needed since suitability labels moved out of the legend).

- [ ] **Step 3: Verify in browser**

  Open the map view. The legend should show:
  - "Aandacht nodig" section (red heading) with plants that have alerts, each with a coloured dot + name + emoji icon
  - "Alles goed" section (muted heading) with healthy plants, green dot + name, no icon

- [ ] **Step 4: Commit**

  ```bash
  git add groei/frontend/src/components/map/MapLegend.tsx
  git commit -m "feat: split map legend into attention-needed and all-good sections with alert badges"
  ```

---

## Task 11: PlantQuickSheet — show all care schedules

**Files:**
- Modify: `groei/frontend/src/components/sheets/PlantQuickSheet.tsx`

- [ ] **Step 1: Add lazy detail fetch and care schedules display**

  In `groei/frontend/src/components/sheets/PlantQuickSheet.tsx`, add imports at the top if not already present:

  ```tsx
  import { useState, useEffect } from 'react'
  import { fetchPlant } from '../../api/client'
  import type { Plant } from '../../types'
  ```

  Near the top of the component function body, add:

  ```tsx
  const [detail, setDetail] = useState<Plant | null>(null)

  useEffect(() => {
    setDetail(null)
    fetchPlant(plant.id).then(setDetail).catch(() => {})
  }, [plant.id])
  ```

- [ ] **Step 2: Add care schedule rows**

  Find where `most_urgent` is currently displayed (look for references to `plant.most_urgent` or `most_urgent`). Replace that section with a full care schedule list:

  ```tsx
  {/* Care schedules */}
  {detail?.care_schedules && detail.care_schedules.length > 0 ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {detail.care_schedules.map(sched => {
        const nextDue = new Date(sched.next_due)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const diffMs = nextDue.getTime() - today.getTime()
        const daysUntil = Math.round(diffMs / 86400000)
        const isOverdue = daysUntil < 0
        const isDueToday = daysUntil === 0

        const CARE_ICONS: Record<string, string> = {
          water: '💧', fertilize: '🌿', prune: '✂️', repot: '🪴',
        }
        const CARE_LABELS: Record<string, string> = {
          water: 'Gieten', fertilize: 'Bemesten', prune: 'Snoeien', repot: 'Verpotten',
        }
        const icon = CARE_ICONS[sched.care_type] ?? '📋'
        const label = CARE_LABELS[sched.care_type] ?? sched.care_type

        let statusText: string
        let statusColor: string
        if (isOverdue) {
          statusText = `${Math.abs(daysUntil)} dag${Math.abs(daysUntil) === 1 ? '' : 'en'} te laat`
          statusColor = 'var(--color-overdue)'
        } else if (isDueToday) {
          statusText = 'vandaag'
          statusColor = 'var(--color-due)'
        } else {
          statusText = `over ${daysUntil} dag${daysUntil === 1 ? '' : 'en'}`
          statusColor = 'var(--color-text-muted)'
        }

        return (
          <div
            key={sched.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              background: 'var(--color-bg)',
              borderRadius: 10,
              border: `1px solid ${isOverdue ? 'var(--color-overdue)' : 'var(--color-border-soft)'}`,
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text)' }}>
              {label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: statusColor }}>
              {statusText}
            </span>
          </div>
        )
      })}
    </div>
  ) : (
    // Fallback: show most_urgent if detail not yet loaded
    plant.most_urgent && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', fontSize: 13 }}>
        <span>💧</span>
        <span>{plant.most_urgent.care_type} · {plant.most_urgent.days_overdue > 0 ? `${plant.most_urgent.days_overdue}d te laat` : 'vandaag'}</span>
      </div>
    )
  )}
  ```

- [ ] **Step 3: Remove the redundant care_status badge**

  Find and remove the `care_status` colored badge near the top of the sheet (the one showing "Overdue" / "Due today" / "All good" in a colored pill). With the care schedule rows doing that job, this badge is redundant.

- [ ] **Step 4: Verify in browser**

  Open the map, tap a plant. The sheet should show:
  - All active care schedules as rows (💧 Gieten · 3 dagen te laat, 🌿 Bemesten · over 15 dagen, etc.)
  - No separate care status badge at the top
  - Falls back to showing `most_urgent` before the full detail loads (loading state)

- [ ] **Step 5: Commit**

  ```bash
  git add groei/frontend/src/components/sheets/PlantQuickSheet.tsx
  git commit -m "feat: plant quick sheet shows all care schedules with days overdue/until"
  ```

---

## Self-review

**Spec coverage:**
- ✅ Plant status halo — now severity-based (Task 9)
- ✅ Alert badge icon on marker — Task 9
- ✅ Legend shows plant issues — Task 10 (split sections + icons)
- ✅ PlantQuickSheet shows what's wrong — Task 11 (all care schedules)
- ✅ Home/Dashboard shows care tasks — Task 7 (backfill seeds schedules, dashboard now populates)
- ✅ Indoor vs outdoor alert filtering — Task 3 (`_INDOOR_SKIP` in alert_service)
- ✅ water_interval_days from species — Tasks 1 + 2
- ✅ top_alert embedded in map payload — Tasks 4 + 5
- ✅ Auto-seed on plant creation — Task 6

**Type consistency check:**
- `TopAlert.alert_type` (Python) ↔ `TopAlert.alert_type` (TypeScript) ✅
- `MapPlantOut.top_alert` (Python) ↔ `MapPlant.top_alert` (TypeScript) ✅
- `enrich_plants(..., rain_data=, last_watered=, map_type=)` used consistently in maps.py ✅
- `_seed_care_schedules` defined in `plants.py`, imported in `admin.py` ✅
- `getHaloColor` from `usePlantStatus` used in `PlantMarker`, not `getHaloStatus` ✅
- `SEVERITY_HALO_COLORS` exported from `usePlantStatus`, imported in `MapLegend` ✅
- `heatmapCells` prop removed from `MapLegend` — verify call sites don't break ✅ (noted in Task 10 Step 2)

# Dashboard To-Do Regroup & Weather-Driven Tasks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the dashboard to-do grid (fertilise → Water column, add weather-driven ephemeral tasks to Aandacht) and wire cold/heat alerts as actionable tasks.

**Architecture:** A new `weather_task_service.py` creates/deletes ephemeral `care_schedules` rows (flagged with `is_ephemeral=1`) before each dashboard query, keyed off per-plant `care_thresholds_json` and cached open-meteo weather. The existing `markCareDone` flow handles ephemeral tasks by setting `next_due = tomorrow` so they re-trigger while the condition persists. Cleanup deletes them when weather passes or plant moves indoors.

**Tech Stack:** Python/FastAPI backend, SQLite (aiosqlite), React/TypeScript/Zustand frontend, open-meteo weather API (already integrated).

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `groei/backend/database/schema.py` | Modify | Add `is_ephemeral` column to `care_schedules` |
| `groei/backend/models.py` | Modify | Add `is_ephemeral`, `map_type` to response models |
| `groei/backend/services/weather_task_service.py` | **Create** | Create/delete ephemeral schedules from weather + thresholds |
| `groei/backend/routers/dashboard.py` | Modify | Call weather service; include `map_type` + `is_ephemeral` in query |
| `groei/backend/routers/care.py` | Modify | Ephemeral done → `next_due = tomorrow` |
| `groei/frontend/src/types/index.ts` | Modify | Add `protect_cold`, `protect_heat` to CareType; add `is_ephemeral` to CareTask |
| `groei/frontend/src/i18n/nl.ts` | Modify | New labels |
| `groei/frontend/src/i18n/en.ts` | Modify | English equivalents |
| `groei/frontend/src/pages/Dashboard.tsx` | Modify | Regroup columns; weather indicator in task rows |

---

### Task 1: Add `is_ephemeral` column to care_schedules

**Files:**
- Modify: `groei/backend/database/schema.py` (add column in `_ensure_schema`)

- [ ] **Step 1: Add column migration**

In `groei/backend/database/schema.py`, after the `care_schedules` CREATE TABLE block (around line 49), add an ALTER TABLE migration:

```python
# In the _ensure_schema function or a new migration section, add:
await db.execute("""
    ALTER TABLE care_schedules ADD COLUMN is_ephemeral INTEGER DEFAULT 0
""")
```

Actually, since the schema.py uses `CREATE TABLE IF NOT EXISTS`, add the column as a migration right after the care_schedules table creation. In the `_ensure_schema` function, after line 49 (`);`), add:

```python
        # Migration: add is_ephemeral column to care_schedules
        try:
            await db.execute("ALTER TABLE care_schedules ADD COLUMN is_ephemeral INTEGER DEFAULT 0")
        except Exception:
            pass  # column already exists
```

Read the schema.py `_ensure_schema` function first to place this correctly.

- [ ] **Step 2: Verify migration**

Run the backend and check the schema:

```
cd groei && npx tsx ../scripts/check-schema.ts
```

Or just start the backend and verify it doesn't crash:

```
cd groei && python -m uvicorn backend.main:app --port 8000
```

- [ ] **Step 3: Commit**

```bash
git add groei/backend/database/schema.py
git commit -m "feat: add is_ephemeral column to care_schedules"
```

---

### Task 2: Update backend models with is_ephemeral and map_type

**Files:**
- Modify: `groei/backend/models.py`

- [ ] **Step 1: Add `is_ephemeral` to CareScheduleOut**

In `groei/backend/models.py`, update `CareScheduleOut` (line 75-86):

```python
class CareScheduleOut(BaseModel):
    id: int
    plant_id: int
    care_type: str
    interval_days: int
    season_adjust: str | None = None
    next_due: str
    last_done: str | None = None
    last_done_by: int | None = None
    last_done_by_name: str | None = None
    notes: str | None = None
    is_active: bool = True
    is_ephemeral: bool = False
```

- [ ] **Step 2: Add `is_ephemeral` and `map_type` to CareTask**

Update `CareTask` (line 157-167):

```python
class CareTask(BaseModel):
    plant_id: int
    plant_name: str
    plant_photo: str | None = None
    location: str | None = None
    map_type: str | None = None
    care_type: str
    days_overdue: int
    last_done_by: str | None = None
    last_done_at: str | None = None
    schedule_id: int
    is_ephemeral: bool = False
```

(Already had `map_type` — just ensure `is_ephemeral` is added.)

- [ ] **Step 3: Verify the backend starts clean**

```bash
cd groei && python -c "from backend.models import CareTask, CareScheduleOut; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add groei/backend/models.py
git commit -m "feat: add is_ephemeral to CareTask and CareScheduleOut models"
```

---

### Task 3: Create weather_task_service.py

**Files:**
- Create: `groei/backend/services/weather_task_service.py`

This service queries outdoor plants with temperature thresholds, fetches cached weather data, and creates/deletes ephemeral care_schedule rows.

- [ ] **Step 1: Create the service file**

```python
"""Ephemeral care schedule generation from weather + plant thresholds.

Called before the dashboard query to ensure weather-driven tasks
(protect_cold, protect_heat) exist when conditions are met.
"""
import json
from datetime import date

from database import get_db


async def _get_cached_weather(db) -> dict:
    """Return {temp_days: [...], min_24h: float, max_24h: float}.
    Uses temp data from plant_care module's open-meteo cache.
    """
    from routers.plant_care import _get_temp_data
    temp_data = await _get_temp_data()
    days = temp_data.get("days", [])
    today_idx = -1
    if not days:
        return {"temp_days": [], "min_24h": None, "max_24h": None}

    today = days[today_idx]
    return {
        "temp_days": days,
        "min_24h": today["min"],
        "max_24h": today["max"],
    }


async def sync_ephemeral_schedules() -> dict:
    """Create/delete ephemeral care_schedules based on weather + plant thresholds.

    Returns summary: {created: int, deleted: int}
    """
    created = 0
    deleted = 0
    today = date.today().isoformat()

    async with get_db() as db:
        weather = await _get_cached_weather(db)
        min_24h = weather["min_24h"]
        max_24h = weather["max_24h"]

        if min_24h is None and max_24h is None:
            return {"created": 0, "deleted": 0}

        # Fetch outdoor plants with care_thresholds
        threshold_rows = await db.execute_fetchall("""
            SELECT p.id, p.care_thresholds, p.map_id
            FROM plants p
            JOIN maps m ON p.map_id = m.id
            WHERE p.is_active = 1
              AND m.map_type = 'outdoor'
              AND p.care_thresholds IS NOT NULL
              AND p.care_thresholds != ''
        """)
        threshold_rows = [dict(r) for r in threshold_rows]

        for plant in threshold_rows:
            try:
                thresholds = json.loads(plant["care_thresholds"])
            except (json.JSONDecodeError, TypeError):
                continue

            plant_id = plant["id"]
            bring_inside = thresholds.get("bring_inside_below_c")
            min_temp = thresholds.get("min_temp_c")
            max_temp = thresholds.get("max_temp_c")

            # Check cold thresholds
            cold_trigger = None
            cold_label = None
            if bring_inside is not None and min_24h is not None and min_24h < bring_inside:
                cold_trigger = "bring_inside"
                cold_label = f"Min {min_24h}°C (grens {bring_inside}°C)"
            elif min_temp is not None and min_24h is not None and min_24h < min_temp:
                cold_trigger = "protect_cold"
                cold_label = f"Min {min_24h}°C (grens {min_temp}°C)"

            if cold_trigger:
                # Check if ephemeral schedule already exists
                existing = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_cold'
                       AND is_ephemeral = 1 AND is_active = 1""",
                    (plant_id,),
                )
                if not existing:
                    await db.execute(
                        """INSERT INTO care_schedules
                           (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
                           VALUES (?, 'protect_cold', 1, ?, 1, ?)""",
                        (plant_id, today, cold_label),
                    )
                    created += 1

            else:
                # No cold trigger active — delete any stale ephemeral cold task
                stale = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_cold'
                       AND is_ephemeral = 1 AND is_active = 1""",
                    (plant_id,),
                )
                for s in stale:
                    await db.execute(
                        "UPDATE care_schedules SET is_active = 0 WHERE id = ?",
                        (s["id"],),
                    )
                    deleted += 1

            # Check heat threshold
            heat_trigger = None
            heat_label = None
            if max_temp is not None and max_24h is not None and max_24h > max_temp:
                heat_trigger = True
                heat_label = f"Max {max_24h}°C (grens {max_temp}°C)"

            if heat_trigger:
                existing = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_heat'
                       AND is_ephemeral = 1 AND is_active = 1""",
                    (plant_id,),
                )
                if not existing:
                    await db.execute(
                        """INSERT INTO care_schedules
                           (plant_id, care_type, interval_days, next_due, is_ephemeral, notes)
                           VALUES (?, 'protect_heat', 1, ?, 1, ?)""",
                        (plant_id, today, heat_label),
                    )
                    created += 1
            else:
                stale = await db.execute_fetchall(
                    """SELECT id FROM care_schedules
                       WHERE plant_id = ? AND care_type = 'protect_heat'
                       AND is_ephemeral = 1 AND is_active = 1""",
                    (plant_id,),
                )
                for s in stale:
                    await db.execute(
                        "UPDATE care_schedules SET is_active = 0 WHERE id = ?",
                        (s["id"],),
                    )
                    deleted += 1

        # Also clean up ephemeral tasks for plants moved indoors
        indoor_ephemeral = await db.execute_fetchall("""
            SELECT cs.id FROM care_schedules cs
            JOIN plants p ON cs.plant_id = p.id
            JOIN maps m ON p.map_id = m.id
            WHERE cs.is_ephemeral = 1 AND cs.is_active = 1
              AND m.map_type = 'indoor'
        """)
        for s in indoor_ephemeral:
            await db.execute(
                "UPDATE care_schedules SET is_active = 0 WHERE id = ?",
                (s["id"],),
            )
            deleted += 1

        await db.commit()

    return {"created": created, "deleted": deleted}
```

- [ ] **Step 2: Verify the module imports correctly**

```bash
cd groei && python -c "from backend.services.weather_task_service import sync_ephemeral_schedules; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add groei/backend/services/weather_task_service.py
git commit -m "feat: add weather_task_service for ephemeral schedule generation"
```

---

### Task 4: Wire weather service into dashboard endpoint

**Files:**
- Modify: `groei/backend/routers/dashboard.py`

- [ ] **Step 1: Add weather sync call and extend queries**

In `groei/backend/routers/dashboard.py`:

At the top, add the import (after line 8):
```python
from services.weather_task_service import sync_ephemeral_schedules
```

In `get_dashboard_v2`, before the main query (before line 110), add:
```python
    # Sync weather-driven ephemeral tasks
    await sync_ephemeral_schedules()
```

Update the main query (lines 110-128) to include `m.map_type` and `cs.is_ephemeral`:
```python
    cursor = await db.execute("""
        SELECT
            cs.id as schedule_id,
            cs.plant_id,
            p.name as plant_name,
            p.photo_path as plant_photo,
            l.name as location,
            m.map_type,
            cs.care_type,
            cs.next_due,
            cs.last_done_by,
            u.name as last_done_by_name,
            cs.last_done as last_done_at,
            cs.is_ephemeral
        FROM care_schedules cs
        JOIN plants p ON cs.plant_id = p.id
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN maps m ON p.map_id = m.id
        LEFT JOIN users u ON cs.last_done_by = u.id
        WHERE cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?
        ORDER BY cs.next_due ASC
    """, (account["household_id"],))
```

Update the `CareTask` construction (lines 134-144) to include the new fields:
```python
        task = CareTask(
            plant_id=row["plant_id"],
            plant_name=row["plant_name"],
            plant_photo=row["plant_photo"],
            location=row["location"],
            map_type=row["map_type"],
            care_type=row["care_type"],
            days_overdue=-days_diff,
            last_done_by=row["last_done_by_name"],
            last_done_at=row["last_done_at"],
            schedule_id=row["schedule_id"],
            is_ephemeral=bool(row["is_ephemeral"]) if row["is_ephemeral"] is not None else False,
        )
```

- [ ] **Step 2: Verify backend starts and endpoint works**

```bash
cd groei && python -m uvicorn backend.main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/api/dashboard/v2 | python -m json.tool | head -40
```

- [ ] **Step 3: Commit**

```bash
git add groei/backend/routers/dashboard.py
git commit -m "feat: wire weather_task_service into dashboard v2, include map_type and is_ephemeral"
```

---

### Task 5: Update care done handler for ephemeral tasks

**Files:**
- Modify: `groei/backend/routers/care.py`

- [ ] **Step 1: Add ephemeral next_due logic**

In `groei/backend/routers/care.py`, update the `mark_care_done` function. After fetching the schedule (line 18), add ephemeral handling. Replace lines 32-41:

```python
    # Calculate next_due: ephemeral = tomorrow, normal = interval calc
    if schedule["is_ephemeral"]:
        next_due = date.today() + timedelta(days=1)
    else:
        next_due = calculate_next_due(
            today, schedule["interval_days"], schedule["season_adjust"]
        )

    await db.execute(
        """UPDATE care_schedules
           SET last_done = ?, last_done_by = ?, next_due = ?
           WHERE id = ?""",
        (now, action.user_id, str(next_due), schedule["id"]),
    )
```

Add the import at the top:
```python
from datetime import date, datetime, timedelta
```

(currently is `from datetime import date, datetime` — change to add `timedelta`)

Also update the `SELECT` query (line 13-16) to fetch `is_ephemeral`:
```python
    cursor = await db.execute(
        """SELECT id, interval_days, season_adjust, is_ephemeral FROM care_schedules
           WHERE plant_id = ? AND care_type = ? AND is_active = 1""",
        (action.plant_id, action.care_type),
    )
```

Apply the same changes to `skip_care` (lines 47-78) — update its SELECT to include `is_ephemeral` and its next_due calculation with the same ephemeral logic.

- [ ] **Step 2: Verify**

```bash
cd groei && python -c "from backend.routers.care import router; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add groei/backend/routers/care.py
git commit -m "feat: ephemeral schedules set next_due to tomorrow when marked done"
```

---

### Task 6: Update frontend types

**Files:**
- Modify: `groei/frontend/src/types/index.ts`

- [ ] **Step 1: Add new care types and is_ephemeral**

Update `CareType` union (line 116):
```typescript
export type CareType = 'water' | 'fertilize' | 'mist' | 'rotate' | 'repot_check' | 'prune' | 'protect_cold' | 'protect_heat'
```

Update `CareTask` interface (around line 93-100):
```typescript
export interface CareTask {
  plant_id: number
  plant_name: string
  plant_photo: string | null
  location: string | null
  map_type: string | null
  care_type: string
  days_overdue: number
  last_done_by: string | null
  last_done_at: string | null
  schedule_id: number
  is_ephemeral: boolean
}
```

Update `CARE_TYPE_INFO` (line 409) — add the two new types:
```typescript
export const CARE_TYPE_INFO: Record<CareType, { label: string; icon: string; defaultIndoor: number; defaultOutdoor: number }> = {
  water:         { label: 'Water',         icon: '💧', defaultIndoor: 7,   defaultOutdoor: 3 },
  fertilize:     { label: 'Fertilize',     icon: '🧪', defaultIndoor: 21,  defaultOutdoor: 14 },
  mist:          { label: 'Mist',          icon: '🌫️', defaultIndoor: 3,   defaultOutdoor: 0 },
  rotate:        { label: 'Rotate',        icon: '🔄', defaultIndoor: 14,  defaultOutdoor: 0 },
  repot_check:   { label: 'Repot check',   icon: '🪴', defaultIndoor: 180, defaultOutdoor: 365 },
  prune:         { label: 'Prune',         icon: '✂️', defaultIndoor: 90,  defaultOutdoor: 30 },
  protect_cold:  { label: 'Protect Cold',  icon: '🥶', defaultIndoor: 0,   defaultOutdoor: 0 },
  protect_heat:  { label: 'Protect Heat',  icon: '🌡️', defaultIndoor: 0,   defaultOutdoor: 0 },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd groei/frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/types/index.ts
git commit -m "feat: add protect_cold and protect_heat care types, is_ephemeral to CareTask"
```

---

### Task 7: Update i18n labels

**Files:**
- Modify: `groei/frontend/src/i18n/nl.ts`
- Modify: `groei/frontend/src/i18n/en.ts`

- [ ] **Step 1: Add Dutch labels**

In `groei/frontend/src/i18n/nl.ts`, update the `care` section (line 75-82):
```typescript
  care: {
    water: 'Water',
    fertilize: 'Bemesten',
    mist: 'Sproeien',
    rotate: 'Draaien',
    repot_check: 'Verpotten',
    prune: 'Snoeien',
    protect_cold: 'Beschermen tegen kou',
    protect_heat: 'Beschermen tegen hitte',
  },
```

In the `dashboard.tasks` section (line 52-61), replace `attention` with the new column labels:
```typescript
    tasks: {
      overdue: 'Te laat',
      dueToday: 'Vandaag',
      upcoming: 'Op komst',
      today: 'Vandaag',
      calm: 'Een rustige dag in de tuin.',
      noTasks: 'Geen taken op dit moment',
      waterFeed: 'Water & Voeding',
      attention: 'Aandacht',
      daysLate: (n) => `${n} ${n === 1 ? 'dag' : 'dagen'} te laat`,
      inDays: (n) => `over ${n} ${n === 1 ? 'dag' : 'dagen'}`,
    },
```

Add a weather context label in dashboard.tasks:
```typescript
      weatherTrigger: 'Weer',
```

- [ ] **Step 2: Add English labels in en.ts**

In `groei/frontend/src/i18n/en.ts`, update the `care` section (line 75-82):
```typescript
  care: {
    water: 'Water',
    fertilize: 'Fertilize',
    mist: 'Mist',
    rotate: 'Rotate',
    repot_check: 'Repot',
    prune: 'Prune',
    protect_cold: 'Cold protection',
    protect_heat: 'Heat protection',
  },
```

In the `dashboard.tasks` section (line 52-61), add `waterFeed` and `weatherTrigger`:
```typescript
    tasks: {
      overdue: 'Overdue',
      dueToday: 'Today',
      upcoming: 'Upcoming',
      today: 'Today',
      calm: 'A quiet day in the garden.',
      noTasks: 'No tasks right now',
      waterFeed: 'Water & Feed',
      attention: 'Attention',
      daysLate: (n) => `${n} ${n === 1 ? 'day' : 'days'} late`,
      inDays: (n) => `in ${n} ${n === 1 ? 'day' : 'days'}`,
      weatherTrigger: 'Weather',
    },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd groei/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/i18n/nl.ts groei/frontend/src/i18n/en.ts
git commit -m "feat: add i18n labels for new care types and Water & Voeding column"
```

---

### Task 8: Regroup dashboard columns and add weather indicators

**Files:**
- Modify: `groei/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Update TodayGrid to regroup columns**

In `TodayGrid` (line 835), change the split logic and column header. Replace lines 835-857:

```typescript
function TodayGrid({ overdue, dueToday, t }: { overdue: CareTask[]; dueToday: CareTask[]; t: Translations }) {
  const allDue = [...overdue, ...dueToday]
  const waterFeedTypes = new Set(['water', 'fertilize'])
  const waterFeedTasks = allDue.filter(task => waterFeedTypes.has(task.care_type))
  const attnTasks  = allDue.filter(task => !waterFeedTypes.has(task.care_type))

  function groupByLocation(tasks: CareTask[]) {
    const buiten = tasks.filter(task => classifyTaskLocation(task) === 'buiten')
    const binnen  = tasks.filter(task => classifyTaskLocation(task) === 'binnen')
    return { buiten, binnen }
  }

  const waterFeedGroups = groupByLocation(waterFeedTasks)
  const attnGroups  = groupByLocation(attnTasks)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      border: '1px solid var(--color-border)', borderRadius: 14,
      overflow: 'hidden', marginBottom: 24,
    }}>
      {/* Column headers */}
      <TodayColHead label={t.dashboard.tasks.waterFeed} count={waterFeedTasks.length} pip="overdue" />
      <TodayColHead label={t.dashboard.tasks.attention} count={attnTasks.length} pip="due" borderLeft />

      {/* Water & Voeding column */}
      <div style={{ borderRight: '1px solid var(--color-border-soft)' }}>
        {waterFeedTasks.length === 0 ? <EmptyCol t={t} /> : (
          <>
            <LocationGroup label={t.dashboard.actions.mapTypeOutdoor} icon={LOCATION_ICON.buiten} tasks={waterFeedGroups.buiten} tone="due" t={t} />
            <LocationGroup label={t.dashboard.actions.mapTypeIndoor} icon={LOCATION_ICON.binnen} tasks={waterFeedGroups.binnen} tone="due" t={t} />
          </>
        )}
      </div>

      {/* Aandacht column */}
      <div>
        {attnTasks.length === 0 ? <EmptyCol t={t} /> : (
          <>
            <LocationGroup label={t.dashboard.actions.mapTypeOutdoor} icon={LOCATION_ICON.buiten} tasks={attnGroups.buiten} tone="due" t={t} />
            <LocationGroup label={t.dashboard.actions.mapTypeIndoor} icon={LOCATION_ICON.binnen} tasks={attnGroups.binnen} tone="due" t={t} />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add weather indicator to TodayTaskRow**

In `TodayTaskRow` (line 918), after the care type label line (around line 961 `{careLabel}{task.location ? ...}`), add weather context for ephemeral tasks:

After line 961 (the `{careLabel}...` paragraph), add:

```tsx
          {task.is_ephemeral && (
            <p style={{
              margin: '1px 0 0', fontFamily: 'var(--font-mono)', fontSize: 8,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-primary)',
            }}>
              {task.care_type === 'protect_cold' ? '🥶' : '🌡️'} {t.dashboard.tasks.weatherTrigger}
            </p>
          )}
```

Also add the weather icon before the care type label in the care type + location paragraph. Replace:
```tsx
          {careLabel}{task.location ? ` · ${task.location}` : ''}
```
With:
```tsx
          {task.is_ephemeral && (task.care_type === 'protect_cold' ? '🥶 ' : '🌡️ ')}
          {careLabel}{task.location ? ` · ${task.location}` : ''}
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd groei/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/pages/Dashboard.tsx
git commit -m "feat: regroup dashboard columns (Water & Voeding / Aandacht), add weather indicators for ephemeral tasks"
```

---

### Task 9: End-to-end smoke test

- [ ] **Step 1: Start the full stack**

```bash
cd groei && npm run dev
```

- [ ] **Step 2: Verify dashboard loads**

Open `http://localhost:5173/dashboard` and check:
- "Water & Voeding" and "Aandacht" column headers appear
- Fertilise tasks appear in the Water & Voeding column
- Other care types (mist, rotate, repot_check, prune) remain in Aandacht
- Buiten/Binnen dropdowns work as before
- If any plant has cold/heat thresholds and weather triggers them, those appear with weather icons

- [ ] **Step 3: Verify mark-done on ephemeral task**

Click "Gedaan" on a weather-driven task (if one exists) and verify:
- Task disappears from the list
- Log entry appears in the logbook section
- Task does NOT immediately re-appear (next_due is tomorrow)

- [ ] **Step 4: Check no regressions**

Verify the rest of the dashboard works:
- Status counts still show correctly
- Recent log still shows recent actions
- Plant fact section still works
- Weather section still loads
- Maps list still displays

- [ ] **Step 5: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: smoke test adjustments for dashboard regroup"
```

# Calendar Magazine Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/calendar` with a magazine-style day-grid calendar showing care tasks per day, matching the mockup at `c:\Users\leon_\Downloads\Floreren Kalender.html`. Existing phenology UI is preserved as the "Agenda" tab inside the new view-toggle.

**Architecture:** New `MonthView` becomes the default. Backend gains one read-only endpoint (`GET /calendar/events`) that returns `next_due` dates from `care_schedules` within a date range. Frontend builds a desktop 2-column layout (grid + side panel) with a mobile fallback (list-style agenda). All magazine-aesthetic CSS is scoped under `.cal-page` so it doesn't leak into other pages.

**Tech Stack:** React 19 / TypeScript / Tailwind v4 (`@theme` in `index.css`) / Vite / FastAPI / SQLite (`care_schedules`)

## Decisions (locked 2026-05-16)

| Q | Choice |
|---|---|
| Q1 — keep phenology UI? | Yes — moved behind "Agenda" tab inside view-toggle |
| Q2 — data source? | Care schedules (`next_due`) only for first pass. Bloom/rain/scan/repot/sow/harvest types live in the type taxonomy but stay empty until later phases |
| Q3 — aesthetic scope? | `/calendar` only — CSS scoped under `.cal-page` |
| Q4 — mobile? | Desktop grid below 1200px collapses to mobile agenda-list view |

## Source-of-truth references

- **Mockup**: `c:\Users\leon_\Downloads\Floreren Kalender.html` — single self-contained HTML/CSS/JS file. Copy CSS values from this verbatim where called out.
- **Existing page**: `groei/frontend/src/pages/PlanningCalendar.tsx` — becomes the view-toggle wrapper; current body is extracted into `PhenologyView` (unchanged behaviour).

## File Structure

**New files:**
- `groei/backend/routers/calendar.py` — `GET /calendar/events`
- `groei/backend/tests/test_calendar_events.py` — endpoint tests
- `groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx` — view-toggle wrapper (replaces `PlanningCalendar.tsx` body)
- `groei/frontend/src/pages/calendar/PhenologyView.tsx` — extracted from old `PlanningCalendar.tsx`
- `groei/frontend/src/pages/calendar/MonthView.tsx` — new default; orchestrates grid + side panel
- `groei/frontend/src/pages/calendar/MobileAgendaList.tsx` — phone fallback for MonthView
- `groei/frontend/src/pages/calendar/CalendarMasthead.tsx` — title, month switcher, view toggle, lede
- `groei/frontend/src/pages/calendar/CalendarLegend.tsx` — filter chips with per-type counts
- `groei/frontend/src/pages/calendar/CalendarGrid.tsx` — 7×N day grid, week-number column
- `groei/frontend/src/pages/calendar/CalendarDayCell.tsx` — single day cell
- `groei/frontend/src/pages/calendar/CalendarEvent.tsx` — single event pill
- `groei/frontend/src/pages/calendar/CalendarAgendaCard.tsx` — agenda for selected day
- `groei/frontend/src/pages/calendar/CalendarAlmanac.tsx` — month quote + seasonal data
- `groei/frontend/src/pages/calendar/CalendarUpcoming.tsx` — next 5 events
- `groei/frontend/src/pages/calendar/CalendarMoon.tsx` — week moon strip
- `groei/frontend/src/pages/calendar/calendar.css` — scoped magazine CSS (imported once)
- `groei/frontend/src/pages/calendar/useCalendarEvents.ts` — fetch hook
- `groei/frontend/src/pages/calendar/calendarTypes.ts` — `CalendarEvent`, `EventType`, etc.
- `groei/frontend/src/pages/calendar/dateUtils.ts` — Dutch month/day names, week-of-year, day-of-week
- `groei/frontend/src/pages/calendar/moon.ts` — moon-phase math
- `groei/frontend/src/pages/calendar/almanacContent.ts` — month → quote + seasonal lines

**Modified files:**
- `groei/frontend/src/App.tsx` — import path for the calendar page (component renamed)
- `groei/frontend/src/api/client.ts` — add `fetchCalendarEvents(from, to)`
- `groei/frontend/src/types.ts` (or wherever shared types live) — export `CalendarEventOut`
- `groei/backend/main.py` — include the new calendar router
- `groei/backend/models.py` — add `CalendarEventOut` Pydantic
- `groei/frontend/index.html` — ensure Google Fonts link (Fraunces + JetBrains Mono + Inter) exists

**Removed files:**
- `groei/frontend/src/pages/PlanningCalendar.tsx` — replaced (content moves to `calendar/PhenologyView.tsx` + `calendar/PlanningCalendarPage.tsx`)

---

## Section A — Backend: calendar events endpoint

### Task A1: Add `CalendarEventOut` Pydantic model

**Files:**
- Modify: `groei/backend/models.py`

- [ ] **Step 1: Locate where existing Pydantic models live**

Run: `grep -n "class.*BaseModel\|class.*Out" groei/backend/models.py | head -30`
You'll see the file's existing structure — append to the end.

- [ ] **Step 2: Add the new model**

Append to `groei/backend/models.py`:

```python
class CalendarEventOut(BaseModel):
    id: str                  # composite e.g. "schedule:42:water"
    date: str                # ISO date YYYY-MM-DD
    type: str                # 'water' | 'fertilize' | (more later)
    plant_id: int | None
    plant_name: str | None
    plant_icon_variant: str | None
    schedule_id: int | None
    overdue: bool
```

- [ ] **Step 3: Commit**

```bash
git add groei/backend/models.py
git commit -m "feat(calendar): CalendarEventOut model"
```

---

### Task A2: Write the failing endpoint test

**Files:**
- Create: `groei/backend/tests/test_calendar_events.py`

- [ ] **Step 1: Inspect existing test patterns**

Run: `ls groei/backend/tests/ && cat groei/backend/tests/test_db_seam.py 2>/dev/null | head -40`
This shows how tests bootstrap the test DB. Reuse the same fixture style.

- [ ] **Step 2: Write the failing tests**

```python
# groei/backend/tests/test_calendar_events.py
import pytest
from httpx import AsyncClient
from main import app


@pytest.fixture
async def client(seeded_db):  # use existing seeded_db fixture if present
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_calendar_events_returns_schedules_in_range(client, seeded_db, auth_header):
    """A care_schedule with next_due in range becomes a calendar event."""
    db = seeded_db
    # Create a plant + an active water schedule due tomorrow.
    plant_id = (await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Test', 1)"
    )).lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, date('now', '+1 day'), 1)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert r.status_code == 200
    events = r.json()
    waters = [e for e in events if e["type"] == "water" and e["plant_id"] == plant_id]
    assert len(waters) == 1
    assert waters[0]["plant_name"] == "Test"
    assert waters[0]["overdue"] is False


@pytest.mark.asyncio
async def test_calendar_events_marks_overdue(client, seeded_db, auth_header):
    """A schedule with next_due before today is marked overdue=True."""
    db = seeded_db
    plant_id = (await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Late', 1)"
    )).lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, '2026-05-01', 1)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert r.status_code == 200
    waters = [e for e in r.json() if e["plant_id"] == plant_id]
    assert len(waters) == 1
    assert waters[0]["overdue"] is True


@pytest.mark.asyncio
async def test_calendar_events_excludes_inactive(client, seeded_db, auth_header):
    """Inactive schedules don't appear."""
    db = seeded_db
    plant_id = (await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Off', 1)"
    )).lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, '2026-05-10', 0)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert all(e["plant_id"] != plant_id for e in r.json())


@pytest.mark.asyncio
async def test_calendar_events_filters_by_range(client, seeded_db, auth_header):
    """A schedule with next_due outside the requested range is excluded."""
    db = seeded_db
    plant_id = (await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Far', 1)"
    )).lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, '2026-08-15', 1)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert all(e["plant_id"] != plant_id for e in r.json())
```

**Note on fixtures:** if `seeded_db` and `auth_header` fixtures do not exist yet in `groei/backend/tests/conftest.py`, add them based on the pattern in `test_db_seam.py`. Reuse the JWT helper from `groei/backend/auth.py` to build an auth_header.

- [ ] **Step 3: Run; verify failure**

Run: `cd groei/backend && pytest tests/test_calendar_events.py -v`
Expected: 404s (router not registered) or ModuleNotFoundError.

- [ ] **Step 4: Commit**

```bash
git add groei/backend/tests/test_calendar_events.py
git commit -m "test(calendar): failing tests for /calendar/events endpoint"
```

---

### Task A3: Implement the endpoint

**Files:**
- Create: `groei/backend/routers/calendar.py`
- Modify: `groei/backend/main.py`

- [ ] **Step 1: Write the router**

```python
# groei/backend/routers/calendar.py
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db_dep
from auth import get_current_account
from models import CalendarEventOut

router = APIRouter(tags=["calendar"])


@router.get("/calendar/events", response_model=list[CalendarEventOut])
async def list_calendar_events(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    account = Depends(get_current_account),
    db = Depends(db_dep),
):
    try:
        date.fromisoformat(from_)
        date.fromisoformat(to)
    except ValueError:
        raise HTTPException(400, "Invalid date — expected YYYY-MM-DD")

    rows = await db.execute_fetchall(
        """
        SELECT
            cs.id           AS schedule_id,
            cs.plant_id     AS plant_id,
            cs.care_type    AS type,
            cs.next_due     AS due_date,
            p.name          AS plant_name,
            p.icon_variant  AS plant_icon_variant
        FROM care_schedules cs
        JOIN plants p ON p.id = cs.plant_id
        WHERE cs.is_active = 1
          AND p.household_id = ?
          AND cs.next_due BETWEEN ? AND ?
        ORDER BY cs.next_due, cs.care_type
        """,
        (account["household_id"], from_, to),
    )

    today = date.today().isoformat()
    return [
        CalendarEventOut(
            id=f"schedule:{r['schedule_id']}:{r['type']}",
            date=r["due_date"],
            type=r["type"],
            plant_id=r["plant_id"],
            plant_name=r["plant_name"],
            plant_icon_variant=r["plant_icon_variant"],
            schedule_id=r["schedule_id"],
            overdue=r["due_date"] < today,
        )
        for r in rows
    ]
```

**Note:** the `icon_variant` column may not exist on `plants` — check first with `sqlite3 groei/backend/floreren.db ".schema plants"`. If absent, drop that column from the SELECT and set `plant_icon_variant=None` in the response.

- [ ] **Step 2: Register the router in main.py**

In `groei/backend/main.py`, find the existing `from routers import ...` block and add `calendar`, then add `app.include_router(calendar.router, prefix="/api")` alongside the others.

- [ ] **Step 3: Run tests; verify they pass**

Run: `cd groei/backend && pytest tests/test_calendar_events.py -v`
Expected: all 4 tests pass.

- [ ] **Step 4: Smoke-test by hand**

Start the backend (`npm run dev:backend`). Open Swagger at `http://localhost:8000/docs`, find `GET /api/calendar/events`, try with `from=2026-05-01&to=2026-05-31` and a valid JWT.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/routers/calendar.py groei/backend/main.py
git commit -m "feat(calendar): GET /calendar/events from care_schedules"
```

---

## Section B — Frontend foundation

### Task B1: Verify Google Fonts are loaded

**Files:**
- Modify (if needed): `groei/frontend/index.html`

- [ ] **Step 1: Inspect**

Run: `grep -n "Fraunces\|JetBrains\|fonts.googleapis" groei/frontend/index.html`

- [ ] **Step 2: If absent, add the font link inside `<head>`**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Verify in browser**

Start dev: `npm run dev`. Open `http://localhost:5173`. In DevTools → Network → filter `font` — confirm Fraunces and JetBrains Mono request 200s. Or in Console: `getComputedStyle(document.querySelector('h1')).fontFamily` → expect `"Fraunces", serif`.

- [ ] **Step 4: Commit (only if you changed index.html)**

```bash
git add groei/frontend/index.html
git commit -m "chore(fonts): load Fraunces + JetBrains Mono"
```

---

### Task B2: Calendar type definitions

**Files:**
- Create: `groei/frontend/src/pages/calendar/calendarTypes.ts`

- [ ] **Step 1: Write the types**

```typescript
// groei/frontend/src/pages/calendar/calendarTypes.ts
export type EventTypeId =
  | 'water'
  | 'fertilize'
  | 'prune'
  | 'bloom'
  | 'sow'
  | 'repot'
  | 'harvest'
  | 'scan'
  | 'rain'

export interface EventTypeDef {
  id: EventTypeId
  labelNl: string
  labelEn: string
  color: string  // CSS color literal
  cssClass: string  // used as `ev.{cssClass}` for border-left/background overrides
}

export const EVENT_TYPES: EventTypeDef[] = [
  { id: 'water',     labelNl: 'Water',        labelEn: 'Water',     color: '#6B8FCA', cssClass: 'water' },
  { id: 'fertilize', labelNl: 'Voeden',       labelEn: 'Feed',      color: '#D9A418', cssClass: 'feed' },
  { id: 'prune',     labelNl: 'Snoeien',      labelEn: 'Prune',     color: '#B2664A', cssClass: 'prune' },
  { id: 'bloom',     labelNl: 'Bloei',        labelEn: 'Bloom',     color: '#2F5D3A', cssClass: 'bloom' },
  { id: 'sow',       labelNl: 'Zaaien',       labelEn: 'Sow',       color: '#4A7C4E', cssClass: 'sow' },
  { id: 'repot',     labelNl: 'Verpotten',    labelEn: 'Repot',     color: '#8E4A33', cssClass: 'repot' },
  { id: 'harvest',   labelNl: 'Oogsten',      labelEn: 'Harvest',   color: '#1F3F26', cssClass: 'harvest' },
  { id: 'scan',      labelNl: 'Plaag · scan', labelEn: 'Pest scan', color: '#4A6BA8', cssClass: 'scan' },
  { id: 'rain',      labelNl: 'Neerslag',     labelEn: 'Rain',      color: '#8A9482', cssClass: 'rain' },
]

export const EVENT_TYPE_BY_ID: Record<string, EventTypeDef | undefined> =
  Object.fromEntries(EVENT_TYPES.map(t => [t.id, t]))

export interface CalendarEvent {
  id: string
  date: string             // YYYY-MM-DD
  type: EventTypeId
  plant_id: number | null
  plant_name: string | null
  plant_icon_variant: string | null
  schedule_id: number | null
  overdue: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/calendarTypes.ts
git commit -m "feat(calendar): event type taxonomy + CalendarEvent type"
```

---

### Task B3: API client function

**Files:**
- Modify: `groei/frontend/src/api/client.ts`

- [ ] **Step 1: Add the fetch function**

Append after the `fetchAlertSummary` line (around line 149):

```typescript
import type { CalendarEvent } from '../pages/calendar/calendarTypes'

// ── Calendar ──
export const fetchCalendarEvents = (from: string, to: string) =>
  api<CalendarEvent[]>('GET', '/calendar/events', { params: { from, to } })
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/api/client.ts
git commit -m "feat(calendar): fetchCalendarEvents API client"
```

---

### Task B4: Date utilities

**Files:**
- Create: `groei/frontend/src/pages/calendar/dateUtils.ts`

- [ ] **Step 1: Write the utilities**

```typescript
// groei/frontend/src/pages/calendar/dateUtils.ts
export const MONTH_LONG_NL = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
]
export const MONTH_SHORT_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
export const DAY_LONG_NL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag']
export const DAY_LETTERS_NL = ['M','D','W','D','V','Z','Z']
export const WEEKDAY_FULL_NL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag']

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/** Mon=0..Sun=6 */
export function dowMon(year: number, month1: number, day: number): number {
  const js = new Date(year, month1 - 1, day).getDay()
  return (js + 6) % 7
}

/** ISO-week-number for a given Y/M/D using Mon-start, Thursday rule. */
export function isoWeek(year: number, month1: number, day: number): number {
  const target = new Date(Date.UTC(year, month1 - 1, day))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThu = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diff = target.getTime() - firstThu.getTime()
  return 1 + Math.round(((diff / 86400000) - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
}

/** Format a Date as YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** First-day of month (used for the calendar window). */
export function firstOfMonth(year: number, month1: number): string {
  return isoDate(new Date(year, month1 - 1, 1))
}

/** Last-day of month. */
export function lastOfMonth(year: number, month1: number): string {
  return isoDate(new Date(year, month1, 0))
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/dateUtils.ts
git commit -m "feat(calendar): date utilities for grid layout"
```

---

### Task B5: Moon-phase utility

**Files:**
- Create: `groei/frontend/src/pages/calendar/moon.ts`

- [ ] **Step 1: Write the moon math**

```typescript
// groei/frontend/src/pages/calendar/moon.ts
// Synodic month ~29.5306 days. Reference new moon: 2000-01-06 18:14 UTC.
const SYNODIC = 29.530588853
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0)

export interface MoonPhase {
  /** 0..1 illuminated fraction */
  lit: number
  /** true if waxing (lit side grows toward full) */
  waxing: boolean
  /** label key */
  phase: 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous'
       | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent'
}

export function moonPhaseFor(date: Date): MoonPhase {
  const diffDays = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000
  const age = ((diffDays % SYNODIC) + SYNODIC) % SYNODIC
  const lit = 0.5 * (1 - Math.cos((2 * Math.PI * age) / SYNODIC))
  const waxing = age < SYNODIC / 2
  let phase: MoonPhase['phase']
  if (age < 1.85) phase = 'new'
  else if (age < 5.54) phase = 'waxing-crescent'
  else if (age < 9.23) phase = 'first-quarter'
  else if (age < 12.91) phase = 'waxing-gibbous'
  else if (age < 16.61) phase = 'full'
  else if (age < 20.30) phase = 'waning-gibbous'
  else if (age < 23.99) phase = 'last-quarter'
  else if (age < 27.68) phase = 'waning-crescent'
  else phase = 'new'
  return { lit, waxing, phase }
}

export const MOON_PHASE_LABEL_NL: Record<MoonPhase['phase'], string> = {
  'new': 'Nieuwe maan',
  'waxing-crescent': 'Wassende sikkel',
  'first-quarter': 'Eerste kwartier',
  'waxing-gibbous': 'Wassende gibbeuze',
  'full': 'Volle maan',
  'waning-gibbous': 'Afnemende gibbeuze',
  'last-quarter': 'Laatste kwartier',
  'waning-crescent': 'Afnemende sikkel',
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/moon.ts
git commit -m "feat(calendar): moon-phase math (synodic, illumination fraction)"
```

---

### Task B6: Almanac content

**Files:**
- Create: `groei/frontend/src/pages/calendar/almanacContent.ts`

The mockup's almanac is editorial copy. We seed Dutch month-specific text. Later this could come from the DB.

- [ ] **Step 1: Write the content**

```typescript
// groei/frontend/src/pages/calendar/almanacContent.ts
// Editorial almanac copy per month. Dutch only for now (matches mockup).
export interface AlmanacRow { key: string; value: string; emphasis?: string }
export interface AlmanacEntry {
  eye: string         // small caps eyebrow
  title: string       // headline
  emphasis: string    // italic word in headline
  quote: string       // long-form intro paragraph
  rows: AlmanacRow[]  // key-value lines
}

export const ALMANAC_NL: AlmanacEntry[] = [
  { eye: 'Januari', title: 'Stille tijd', emphasis: 'rust',
    quote: 'Januari is de maand van plannen — bestel zaad, snoei wat slaapt, en geef de kamerplanten meer licht dan water.',
    rows: [
      { key: 'Daglengte', value: '8 u 30 min' },
      { key: 'Bodemtemp', value: '2 °C — wachten' },
    ]},
  { eye: 'Februari', title: 'Eerste tekenen', emphasis: 'ontwaken',
    quote: 'De grond is nog koud, maar krokus en sneeuwklokje wijzen de weg. Tijd om zaaiplannen te maken.',
    rows: [
      { key: 'Daglengte', value: '10 u 00 min' },
      { key: 'Bodemtemp', value: '3 °C' },
    ]},
  { eye: 'Maart', title: 'De start', emphasis: 'zaaien',
    quote: 'Maart laat zich zien — eerste zaadjes binnen, en buiten de eerste narcissen.',
    rows: [
      { key: 'Daglengte', value: '11 u 50 min' },
      { key: 'Bodemtemp', value: '6 °C' },
    ]},
  { eye: 'April', title: 'Voorjaar breekt door', emphasis: 'groei',
    quote: 'April doet wat hij wil — zon en regen wisselen elkaar af, en alles begint te lopen.',
    rows: [
      { key: 'Daglengte', value: '13 u 30 min' },
      { key: 'Bodemtemp', value: '9 °C' },
    ]},
  { eye: 'Mei in jouw tuin', title: 'Wat de maand brengt', emphasis: 'brengt',
    quote: 'Mei is de scharniermaand — na de IJsheiligen mag alles naar buiten, en de pioenroos staat klaar om met één warme dag tegelijk te ontluiken.',
    rows: [
      { key: 'IJsheiligen', value: '11 — 15 mei', emphasis: 'nu' },
      { key: 'Laatste vorst', value: 'verwacht 16 mei' },
      { key: 'Daglengte', value: '15 u 24 min' },
      { key: 'Bodemtemp', value: '12,1 °C · zaaien kan' },
    ]},
  { eye: 'Juni', title: 'Volle bloei', emphasis: 'overvloed',
    quote: 'Juni is licht en geur — rozen en pioen, eerste oogst van sla en aardbei.',
    rows: [
      { key: 'Daglengte', value: '16 u 40 min' },
      { key: 'Zomerzonnewende', value: '21 juni' },
    ]},
  { eye: 'Juli', title: 'Zomerhoogte', emphasis: 'water',
    quote: 'Juli vraagt water en oog voor schaduw. Wat nu gezaaid wordt komt in de herfst tot bloei.',
    rows: [
      { key: 'Daglengte', value: '16 u 20 min' },
      { key: 'Bodemtemp', value: '19 °C' },
    ]},
  { eye: 'Augustus', title: 'Late zomer', emphasis: 'oogst',
    quote: 'Augustus is oogst en delen. Tomaat, courgette, bonen — laat niet liggen.',
    rows: [
      { key: 'Daglengte', value: '14 u 40 min' },
      { key: 'Bodemtemp', value: '20 °C' },
    ]},
  { eye: 'September', title: 'Overgang', emphasis: 'zaaien',
    quote: 'September is herstart — winterhard zaaien, bollen poten, en de tuin opmaken voor wat komt.',
    rows: [
      { key: 'Daglengte', value: '12 u 40 min' },
      { key: 'Bodemtemp', value: '17 °C' },
    ]},
  { eye: 'Oktober', title: 'Goud en val', emphasis: 'opruimen',
    quote: 'Oktober kleurt en valt. Plant nu wat in het voorjaar moet bloeien.',
    rows: [
      { key: 'Daglengte', value: '10 u 50 min' },
      { key: 'Bodemtemp', value: '12 °C' },
    ]},
  { eye: 'November', title: 'Tot rust', emphasis: 'sluit',
    quote: 'November dekt af. Mulch, snoei, en geef de bodem rust.',
    rows: [
      { key: 'Daglengte', value: '9 u 00 min' },
      { key: 'Bodemtemp', value: '6 °C' },
    ]},
  { eye: 'December', title: 'Lege bladzijden', emphasis: 'plannen',
    quote: 'December is leeg en helder — een goed moment om volgend jaar te tekenen.',
    rows: [
      { key: 'Daglengte', value: '7 u 50 min' },
      { key: 'Wintersolstice', value: '21 december' },
    ]},
]
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/almanacContent.ts
git commit -m "feat(calendar): per-month almanac copy (Dutch)"
```

---

### Task B7: useCalendarEvents hook

**Files:**
- Create: `groei/frontend/src/pages/calendar/useCalendarEvents.ts`

- [ ] **Step 1: Write the hook**

```typescript
// groei/frontend/src/pages/calendar/useCalendarEvents.ts
import { useEffect, useState } from 'react'
import { fetchCalendarEvents } from '../../api/client'
import type { CalendarEvent } from './calendarTypes'
import { firstOfMonth, lastOfMonth } from './dateUtils'

export function useCalendarEvents(year: number, month1: number) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCalendarEvents(firstOfMonth(year, month1), lastOfMonth(year, month1))
      .then(data => { if (!cancelled) { setEvents(data); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(String(e?.message ?? e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [year, month1])

  return { events, loading, error }
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/useCalendarEvents.ts
git commit -m "feat(calendar): useCalendarEvents fetch hook"
```

---

## Section C — Page restructure (preserve phenology)

### Task C1: Extract existing UI into PhenologyView

**Files:**
- Create: `groei/frontend/src/pages/calendar/PhenologyView.tsx`

- [ ] **Step 1: Copy the existing `PlanningCalendar.tsx` body verbatim into a new component named `PhenologyView`**

Take the entire current contents of `groei/frontend/src/pages/PlanningCalendar.tsx` (the function body inside `export default function PlanningCalendar()` plus `function ActionCard(...)`) and place it in the new file:

```typescript
// groei/frontend/src/pages/calendar/PhenologyView.tsx
import { useState, useEffect, useMemo } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { fetchAlertSummary } from '../../api/client'
import type { Plant, Phenology, MonthPhenology } from '../../types'

// [paste the entire body of the existing PlanningCalendar export, plus ActionCard,
//  rename the default export to `PhenologyView`, and update import paths
//  from `'../store/...'` → `'../../store/...'`, `'../api/...'` → `'../../api/...'`,
//  `'../types'` → `'../../types'`.]
```

**Implementer note:** This is a verbatim move. Do not change any behaviour. Only adjust the relative import paths (one level deeper) and rename the default export.

- [ ] **Step 2: Smoke-test by visiting `/calendar` after Task C2**

(See C2 for the wiring.)

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/pages/calendar/PhenologyView.tsx
git commit -m "refactor(calendar): extract existing UI as PhenologyView"
```

---

### Task C2: Create the view-toggle wrapper

**Files:**
- Create: `groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx`
- Modify: `groei/frontend/src/App.tsx`
- Delete: `groei/frontend/src/pages/PlanningCalendar.tsx`

For Task C2 only, the wrapper renders **only the PhenologyView** so the URL works while we build MonthView in Section D. After D11 we'll flip the default to MonthView.

- [ ] **Step 1: Write the wrapper**

```typescript
// groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx
import { useState } from 'react'
import PhenologyView from './PhenologyView'

export type CalendarViewMode = 'month' | 'agenda'

export default function PlanningCalendarPage() {
  const [view, setView] = useState<CalendarViewMode>('agenda')

  // For now only 'agenda' (phenology) renders. MonthView is wired in Task D11.
  void view
  void setView

  return <PhenologyView />
}
```

- [ ] **Step 2: Update App.tsx import**

In `groei/frontend/src/App.tsx`:
- Replace `import PlanningCalendar from './pages/PlanningCalendar'`
- With:    `import PlanningCalendarPage from './pages/calendar/PlanningCalendarPage'`
- Update the JSX inside the `/calendar` route from `<PlanningCalendar />` to `<PlanningCalendarPage />`.

- [ ] **Step 3: Delete the old file**

```bash
git rm groei/frontend/src/pages/PlanningCalendar.tsx
```

- [ ] **Step 4: Verify**

Run `npm run dev`. Visit `http://localhost:5173/calendar`. Confirm the page looks identical to before (still the phenology UI).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(calendar): wrap page in view-toggle scaffold"
```

---

## Section D — MonthView (the magazine layout)

### Task D1: Scoped CSS file

**Files:**
- Create: `groei/frontend/src/pages/calendar/calendar.css`

All rules in this file are scoped under `.cal-page` so they don't affect other pages.

- [ ] **Step 1: Create the CSS file**

Source: `c:\Users\leon_\Downloads\Floreren Kalender.html` lines 11–784 (the `<style>` block). Translate each rule by prefixing with `.cal-page `.

```css
/* groei/frontend/src/pages/calendar/calendar.css
   All rules scoped under .cal-page. Magazine aesthetic — do not use these classes elsewhere.
   Source-of-truth: c:\Users\leon_\Downloads\Floreren Kalender.html (lines 11–784). */

.cal-page {
  /* Local design tokens — overlap with index.css @theme but kept local for safety. */
  --cal-bg:        #FBF7EE;
  --cal-paper:     #FFFEF9;
  --cal-paper-dim: #F5EFE0;
  --cal-ink:       #1F2A1E;
  --cal-ink-soft:  #4A5A47;
  --cal-ink-faint: #8A9482;
  --cal-rule:      #D6CDB6;
  --cal-rule-soft: #E6DEC9;
  --cal-accent:    #2F5D3A;
  --cal-accent-hl: #4A7C4E;
  --cal-accent-dk: #1F3F26;
  --cal-terra:     #B2664A;
  --cal-terra-dk:  #8E4A33;
  --cal-gold:      #D9A418;
  --cal-gold-dk:   #B0840F;
  --cal-sky:       #6B8FCA;
  --cal-sky-dk:    #4A6BA8;
  --cal-shadow:    0 1px 0 rgba(31,42,30,.04), 0 4px 14px rgba(31,42,30,.05);

  font-family: 'Inter', system-ui, sans-serif;
  background: var(--cal-bg);
  color: var(--cal-ink);
  font-size: 14px;
  line-height: 1.5;
  background-image:
    radial-gradient(circle at 8% 6%, rgba(178,102,74,.05), transparent 40%),
    radial-gradient(circle at 92% 92%, rgba(47,93,58,.05), transparent 45%);
  min-height: 100dvh;
}

/* Implementer note: copy the rules from the mockup's <style> block into the
   sections below. Prefix each selector with `.cal-page ` (e.g. `.masthead` →
   `.cal-page .masthead`). Replace the mockup's CSS variable names (`--bg`,
   `--paper`, `--accent`, etc.) with the `--cal-*` equivalents declared above.
   The full block to copy spans lines 46–778 of the mockup file:
     * .masthead, .top-rail, .avatar, .title-row, .title-block, .month-switch
     * .legend-strip, .legend-inner, .legend-chip, .legend-search
     * main grid (`.cal-page main { ... }`)
     * .cal-card, .week-header, .cal-grid, .wk-num
     * .day, .day-head, .day-num, .day-meta, .ev-list, .ev, .ev-more
     * .col-side, .side-card, .sc-head, .sc-eye, .sc-title, .sc-sub
     * .agenda-list, .agenda-item, .agenda-icon, .agenda-meta, .agenda-time, .agenda-empty
     * .agenda-foot
     * .up-list, .up-item, .up-date, .up-meta, .up-pip
     * .moon-strip, .moon-row, .moon-cell, .moon-phase-label
     * .almanac-side, .almanac-body, .almanac-rows, .alm-line
     * footer rules
     * the @media (max-width: 1200px) block at the bottom
*/
```

**Implementer note:** This task is a verbatim copy with two mechanical substitutions:
1. Prefix every selector with `.cal-page ` (e.g. `.day {...}` → `.cal-page .day {...}`).
2. Substitute every CSS variable name (`var(--bg)` → `var(--cal-bg)`, `var(--accent)` → `var(--cal-accent)`, etc.). The full mapping:
   - `--bg` → `--cal-bg`
   - `--paper` → `--cal-paper`
   - `--paper-dim` → `--cal-paper-dim`
   - `--ink` → `--cal-ink`
   - `--ink-soft` → `--cal-ink-soft`
   - `--ink-faint` → `--cal-ink-faint`
   - `--rule` → `--cal-rule`
   - `--rule-soft` → `--cal-rule-soft`
   - `--accent` → `--cal-accent`
   - `--accent-hl` → `--cal-accent-hl`
   - `--accent-dk` → `--cal-accent-dk`
   - `--terra` → `--cal-terra`
   - `--terra-dk` → `--cal-terra-dk`
   - `--gold` → `--cal-gold`
   - `--gold-dk` → `--cal-gold-dk`
   - `--sky` → `--cal-sky`
   - `--sky-dk` → `--cal-sky-dk`
   - `--shadow` → `--cal-shadow`

Do **not** copy the `body { ... }` rule from the mockup (it's already scoped by `.cal-page`).
Do **not** copy the `:root` block (we declared local tokens above).
Do **not** copy the `*, *::before, *::after { box-sizing }` rule (Tailwind's preflight already does this).

- [ ] **Step 2: Import in PlanningCalendarPage**

In `groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx`, add at top:

```typescript
import './calendar.css'
```

- [ ] **Step 3: Smoke-test**

`npm run dev`, visit `/calendar` — page should still look like the phenology view (no `.cal-page` element wraps it yet), but no console errors.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/pages/calendar/calendar.css groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx
git commit -m "feat(calendar): scoped magazine CSS"
```

---

### Task D2: CalendarMasthead

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarMasthead.tsx`

Renders the title row (eyebrow, "Kalender." headline, lede) + month switcher + view-toggle pill.

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarMasthead.tsx
import { MONTH_LONG_NL, isoWeek } from './dateUtils'
import type { CalendarViewMode } from './PlanningCalendarPage'

interface Props {
  year: number
  month1: number
  viewMode: CalendarViewMode
  onPrev(): void
  onNext(): void
  onSetView(v: CalendarViewMode): void
  taskCount: number
  bloomCount: number
  openCount: number
}

export default function CalendarMasthead({
  year, month1, viewMode, onPrev, onNext, onSetView,
  taskCount, bloomCount, openCount,
}: Props) {
  const monthName = MONTH_LONG_NL[month1 - 1]
  const wkFirst = isoWeek(year, month1, 1)
  const wkLast = isoWeek(year, month1, new Date(year, month1, 0).getDate())

  return (
    <header className="masthead">
      <div className="top-rail">
        <div className="nav-placeholder" />
        <div className="me">
          <span>{monthName} · {year}</span>
        </div>
      </div>

      <div className="title-row">
        <div className="title-block">
          <div className="eyebrow">
            <span>§ Kalender</span>
            <span>Tuinjaar {year}</span>
          </div>
          <h1>Kalender<em>.</em></h1>
          <p className="lede">Alles wat jouw tuin vraagt — en alles wat zij belooft — geordend per dag.</p>
        </div>

        <div className="month-switch">
          <div className="ms-row">
            <div>
              <div className="ms-year">Week {wkFirst} — {wkLast}</div>
              <div className="ms-month">{monthName} <em>{year}</em></div>
            </div>
            <div className="ms-arrows">
              <button className="ms-btn" aria-label="Vorige maand" onClick={onPrev}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="ms-btn" aria-label="Volgende maand" onClick={onNext}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
          <div className="ms-row">
            <div className="view-toggle">
              <button className={viewMode === 'month' ? 'on' : ''} onClick={() => onSetView('month')}>Maand</button>
              <button className={viewMode === 'agenda' ? 'on' : ''} onClick={() => onSetView('agenda')}>Agenda</button>
            </div>
          </div>
          <div className="ms-meta">
            <span>Deze maand <span className="v">{taskCount} <em>taken</em></span></span>
            <span>Bloei <span className="v">{bloomCount}</span></span>
            <span>Open <span className="v">{openCount}</span></span>
          </div>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarMasthead.tsx
git commit -m "feat(calendar): CalendarMasthead"
```

---

### Task D3: CalendarLegend

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarLegend.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarLegend.tsx
import { EVENT_TYPES, type EventTypeId } from './calendarTypes'
import type { CalendarEvent } from './calendarTypes'

interface Props {
  events: CalendarEvent[]
  activeTypes: Set<EventTypeId>
  onToggle(id: EventTypeId): void
}

export default function CalendarLegend({ events, activeTypes, onToggle }: Props) {
  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })

  return (
    <section className="legend-strip">
      <div className="legend-inner">
        <span className="legend-label">Filter</span>
        {EVENT_TYPES.map(t => (
          <span
            key={t.id}
            className={`legend-chip ${activeTypes.has(t.id) ? '' : 'off'}`}
            onClick={() => onToggle(t.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(t.id) }}
          >
            <span className="dot" style={{ background: t.color }} />
            {t.labelNl}
            <span className="ct">{counts[t.id] || 0}</span>
          </span>
        ))}
        <span className="legend-spacer" />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarLegend.tsx
git commit -m "feat(calendar): CalendarLegend filter chips"
```

---

### Task D4: CalendarEvent pill

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarEvent.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarEvent.tsx
import type { CalendarEvent as Ev } from './calendarTypes'
import { EVENT_TYPE_BY_ID } from './calendarTypes'

export default function CalendarEvent({ ev }: { ev: Ev }) {
  const def = EVENT_TYPE_BY_ID[ev.type]
  const css = def?.cssClass ?? 'water'
  const iconSrc = ev.plant_icon_variant
    ? `/icons/${ev.plant_icon_variant}.svg`
    : ev.plant_id
      ? '/icons/seed.svg'
      : null

  return (
    <div className={`ev ${css}`}>
      {iconSrc && <span className="ev-icon"><img src={iconSrc} alt="" /></span>}
      <span className="ev-label">{ev.plant_name ?? def?.labelNl ?? ev.type}</span>
    </div>
  )
}
```

**Note:** `ev-icon` in the mockup uses inline SVG bodies. We use `<img>` for simplicity. If the visual differs noticeably from the mockup, swap to an `<svg>` that loads via `fetch` — defer that polish to Task E3.

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarEvent.tsx
git commit -m "feat(calendar): CalendarEvent pill"
```

---

### Task D5: CalendarDayCell

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarDayCell.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarDayCell.tsx
import CalendarEvent from './CalendarEvent'
import type { CalendarEvent as Ev } from './calendarTypes'
import { moonPhaseFor } from './moon'

interface Props {
  day: number
  month0: number             // 0..11
  year: number
  otherMonth: boolean
  weekend: boolean
  isToday: boolean
  isSelected: boolean
  events: Ev[]               // already filtered
  maxVisible: number
  onClick(): void
}

export default function CalendarDayCell({
  day, month0, year, otherMonth, weekend, isToday, isSelected, events, maxVisible, onClick,
}: Props) {
  const classes = [
    'day',
    otherMonth ? 'other-month' : '',
    weekend ? 'weekend' : '',
    isToday ? 'today' : '',
    isSelected && !isToday ? 'selected' : '',
  ].filter(Boolean).join(' ')

  const shown = events.slice(0, maxVisible)
  const moreCount = events.length - shown.length

  let metaHtml: React.ReactNode = null
  if (!otherMonth) {
    const { lit, waxing } = moonPhaseFor(new Date(year, month0, day))
    const quarterDay = lit < 0.04 || lit > 0.96 || Math.abs(lit - 0.5) < 0.04
    if (quarterDay) {
      const pct = Math.round(lit * 100)
      const grad = waxing
        ? `linear-gradient(90deg, #2A2A2A ${100 - pct}%, #F0E4C8 ${100 - pct}%)`
        : `linear-gradient(90deg, #F0E4C8 ${pct}%, #2A2A2A ${pct}%)`
      const label = lit > 0.96 ? 'vol' : lit < 0.04 ? 'nieuw' : 'kwart'
      metaHtml = <div className="day-meta">{label} <span className="moon" style={{ background: grad }} /></div>
    }
  }

  return (
    <div className={classes} onClick={onClick}>
      <div className="day-head">
        <span className="day-num">{day}</span>
        {metaHtml}
      </div>
      <div className="ev-list">
        {shown.map(e => <CalendarEvent key={e.id} ev={e} />)}
        {moreCount > 0 && <div className="ev-more">+ {moreCount} meer</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarDayCell.tsx
git commit -m "feat(calendar): CalendarDayCell"
```

---

### Task D6: CalendarGrid

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarGrid.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarGrid.tsx
import CalendarDayCell from './CalendarDayCell'
import type { CalendarEvent } from './calendarTypes'
import { daysInMonth, dowMon, isoWeek, isoDate } from './dateUtils'

interface Props {
  year: number
  month1: number
  events: CalendarEvent[]    // already filtered by type
  todayIso: string
  selectedIso: string
  onSelect(iso: string): void
}

const WEEKDAY_HEADER = [
  { label: 'Maandag', weekend: false },
  { label: 'Dinsdag', weekend: false },
  { label: 'Woensdag', weekend: false },
  { label: 'Donderdag', weekend: false },
  { label: 'Vrijdag', weekend: false },
  { label: 'Zaterdag', weekend: true },
  { label: 'Zondag', weekend: true },
]

export default function CalendarGrid({
  year, month1, events, todayIso, selectedIso, onSelect,
}: Props) {
  const month0 = month1 - 1
  const dim = daysInMonth(year, month1)
  const firstDow = dowMon(year, month1, 1)
  const lastDow = dowMon(year, month1, dim)
  const leading = firstDow
  const trailing = 6 - lastDow
  const totalCells = leading + dim + trailing
  const rows = totalCells / 7

  const prevMonth1 = month1 === 1 ? 12 : month1 - 1
  const prevYear = month1 === 1 ? year - 1 : year
  const prevDim = daysInMonth(prevYear, prevMonth1)
  const nextMonth1 = month1 === 12 ? 1 : month1 + 1
  const nextYear = month1 === 12 ? year + 1 : year

  // Index events by ISO date for O(1) lookup
  const byDate = new Map<string, CalendarEvent[]>()
  events.forEach(e => {
    const arr = byDate.get(e.date) ?? []
    arr.push(e)
    byDate.set(e.date, arr)
  })

  function cellInfo(idx: number) {
    if (idx < leading) {
      const d = prevDim - leading + 1 + idx
      return { d, otherMonth: true, m: prevMonth1, y: prevYear }
    }
    if (idx < leading + dim) {
      return { d: idx - leading + 1, otherMonth: false, m: month1, y: year }
    }
    const d = idx - leading - dim + 1
    return { d, otherMonth: true, m: nextMonth1, y: nextYear }
  }

  const cells: React.ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    const firstIdx = r * 7
    const firstCell = cellInfo(firstIdx)
    const wk = isoWeek(firstCell.y, firstCell.m, firstCell.d)
    cells.push(
      <div className="wk-num" key={`wk-${r}`}>
        <span className="wk-no">{wk}</span><span>week</span>
      </div>,
    )
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c
      const { d, otherMonth, m, y } = cellInfo(idx)
      const iso = isoDate(new Date(y, m - 1, d))
      const isToday = iso === todayIso
      const isSelected = iso === selectedIso
      const weekend = c >= 5
      const dayEvents = (byDate.get(iso) ?? [])
      const maxVisible = isToday ? 5 : 3
      cells.push(
        <CalendarDayCell
          key={`d-${iso}`}
          day={d}
          month0={m - 1}
          year={y}
          otherMonth={otherMonth}
          weekend={weekend}
          isToday={isToday}
          isSelected={isSelected}
          events={otherMonth ? [] : dayEvents}
          maxVisible={maxVisible}
          onClick={() => { if (!otherMonth) onSelect(iso) }}
        />,
      )
    }
  }

  return (
    <section className="cal-card">
      <div className="week-header">
        <div className="wh-cell wh-num">wk</div>
        {WEEKDAY_HEADER.map(h => (
          <div key={h.label} className={`wh-cell ${h.weekend ? 'weekend' : ''}`}>{h.label}</div>
        ))}
      </div>
      <div className="cal-grid">{cells}</div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarGrid.tsx
git commit -m "feat(calendar): CalendarGrid (7 cols + week-number)"
```

---

### Task D7: CalendarAgendaCard

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarAgendaCard.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarAgendaCard.tsx
import type { CalendarEvent } from './calendarTypes'
import { EVENT_TYPE_BY_ID } from './calendarTypes'
import { DAY_LONG_NL, MONTH_SHORT_NL, dowMon } from './dateUtils'

interface Props {
  selectedIso: string
  events: CalendarEvent[]   // already filtered to selected day
}

export default function CalendarAgendaCard({ selectedIso, events }: Props) {
  const [y, m, d] = selectedIso.split('-').map(Number)
  const dayName = DAY_LONG_NL[dowMon(y, m, d)]
  const monthShort = MONTH_SHORT_NL[m - 1]

  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })
  const summary = Object.entries(counts).map(([k, v]) => {
    const lbl = EVENT_TYPE_BY_ID[k]?.labelNl ?? k
    return `${v} ${lbl.toLowerCase()}`
  }).join(' · ')

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">§ Agenda — geselecteerde dag</div>
        <h2 className="sc-title">{dayName} <em>{d} {monthShort}</em></h2>
        <p className="sc-sub">
          {events.length
            ? `${events.length} ta${events.length === 1 ? 'ak' : 'ken'} · ${summary}.`
            : 'Geen taken — rust.'}
        </p>
      </div>
      <div className="agenda-list">
        {events.length === 0 && (
          <div className="agenda-empty">
            <span className="em">Vrije dag</span>
            De tuin redt zich vandaag zelf.
          </div>
        )}
        {events.map(e => {
          const def = EVENT_TYPE_BY_ID[e.type]
          const iconSrc = e.plant_icon_variant ? `/icons/${e.plant_icon_variant}.svg`
            : e.plant_id ? '/icons/seed.svg' : null
          return (
            <div key={e.id} className="agenda-item">
              <div className={`agenda-icon ${def?.cssClass ?? ''}`}>
                {iconSrc && <img src={iconSrc} alt="" />}
              </div>
              <div className="agenda-meta">
                <p className="what">{def?.labelNl ?? e.type} · <em>{e.plant_name ?? '—'}</em></p>
                <p className="who">{e.overdue ? 'Overtijd' : ''}</p>
              </div>
              <div className="agenda-time">
                —<span className="dur">{def?.labelNl ?? e.type}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="agenda-foot">
        <span>Bewerken</span>
        <span>—</span>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarAgendaCard.tsx
git commit -m "feat(calendar): CalendarAgendaCard"
```

---

### Task D8: CalendarAlmanac

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarAlmanac.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarAlmanac.tsx
import { ALMANAC_NL } from './almanacContent'

export default function CalendarAlmanac({ month1 }: { month1: number }) {
  const a = ALMANAC_NL[month1 - 1]
  return (
    <section className="side-card almanac-side">
      <div className="sc-head">
        <div className="sc-eye">§ {a.eye}</div>
        <h2 className="sc-title">{a.title} <em>{a.emphasis}</em>.</h2>
      </div>
      <div className="almanac-body">
        <p className="alm-q">{a.quote}</p>
        <div className="almanac-rows">
          {a.rows.map((r, i) => (
            <div key={i} className="alm-line">
              <span className="k">{r.key}</span>
              <span>{r.value}{r.emphasis && <> · <em>{r.emphasis}</em></>}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarAlmanac.tsx
git commit -m "feat(calendar): CalendarAlmanac"
```

---

### Task D9: CalendarUpcoming

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarUpcoming.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarUpcoming.tsx
import type { CalendarEvent } from './calendarTypes'
import { EVENT_TYPE_BY_ID } from './calendarTypes'
import { MONTH_SHORT_NL } from './dateUtils'

interface Props {
  todayIso: string
  events: CalendarEvent[]   // full month, filtered
}

export default function CalendarUpcoming({ todayIso, events }: Props) {
  const future = events
    .filter(e => e.date > todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">§ Op komst</div>
        <h2 className="sc-title">Wat <em>komt</em>.</h2>
        <p className="sc-sub">De komende dagen — gesorteerd op datum.</p>
      </div>
      <div className="up-list">
        {future.length === 0 && (
          <div className="agenda-empty" style={{ padding: '18px 22px' }}>— stilte —</div>
        )}
        {future.map(e => {
          const [, m, d] = e.date.split('-').map(Number)
          const def = EVENT_TYPE_BY_ID[e.type]
          return (
            <div key={e.id} className="up-item">
              <div className="up-date">
                <span className="d">{d}</span>
                <span className="m">{MONTH_SHORT_NL[m - 1]}</span>
              </div>
              <div className="up-meta">
                <p className="what">{e.plant_name ?? def?.labelNl ?? e.type}</p>
                <p className="who">{def?.labelNl ?? e.type}</p>
              </div>
              <span className="up-pip" style={{ background: def?.color ?? '#2F5D3A' }} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarUpcoming.tsx
git commit -m "feat(calendar): CalendarUpcoming"
```

---

### Task D10: CalendarMoon

**Files:**
- Create: `groei/frontend/src/pages/calendar/CalendarMoon.tsx`

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/CalendarMoon.tsx
import { DAY_LETTERS_NL, isoWeek, dowMon } from './dateUtils'
import { moonPhaseFor, MOON_PHASE_LABEL_NL } from './moon'

interface Props { year: number; month1: number; todayDay: number }

export default function CalendarMoon({ year, month1, todayDay }: Props) {
  // Show the week (Mon-Sun) containing `todayDay`.
  const dow = dowMon(year, month1, todayDay) // 0..6
  const monStart = new Date(year, month1 - 1, todayDay - dow)
  const cells = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monStart)
    d.setDate(monStart.getDate() + i)
    return d
  })
  const wk = isoWeek(monStart.getFullYear(), monStart.getMonth() + 1, monStart.getDate())
  const todayIso = new Date(year, month1 - 1, todayDay).toDateString()
  const center = moonPhaseFor(new Date(year, month1 - 1, todayDay))

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">§ Maanstand</div>
        <h2 className="sc-title">Week <em>{wk}</em>.</h2>
        <p className="sc-sub">{MOON_PHASE_LABEL_NL[center.phase]}.</p>
      </div>
      <div className="moon-strip">
        <div className="moon-row">
          {cells.map((d, i) => {
            const { lit, waxing } = moonPhaseFor(d)
            const pct = Math.round(lit * 100)
            const grad = waxing
              ? `linear-gradient(90deg, #2A2A2A ${100 - pct}%, #F0E4C8 ${100 - pct}%)`
              : `linear-gradient(90deg, #F0E4C8 ${pct}%, #2A2A2A ${pct}%)`
            const isNow = d.toDateString() === todayIso
            return (
              <div key={i} className={`moon-cell ${isNow ? 'now' : ''}`}>
                <div className="day-letter">{DAY_LETTERS_NL[i]}</div>
                <div className="moon-dot" style={{ background: grad }} />
                <div className="moon-date">{d.getDate()}</div>
              </div>
            )
          })}
        </div>
        <p className="moon-phase-label">{MOON_PHASE_LABEL_NL[center.phase]}.</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/CalendarMoon.tsx
git commit -m "feat(calendar): CalendarMoon week strip"
```

---

### Task D11: MonthView — assemble everything and make it default

**Files:**
- Create: `groei/frontend/src/pages/calendar/MonthView.tsx`
- Modify: `groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx`

- [ ] **Step 1: Write MonthView**

```typescript
// groei/frontend/src/pages/calendar/MonthView.tsx
import { useMemo, useState } from 'react'
import CalendarMasthead from './CalendarMasthead'
import CalendarLegend from './CalendarLegend'
import CalendarGrid from './CalendarGrid'
import CalendarAgendaCard from './CalendarAgendaCard'
import CalendarAlmanac from './CalendarAlmanac'
import CalendarUpcoming from './CalendarUpcoming'
import CalendarMoon from './CalendarMoon'
import { useCalendarEvents } from './useCalendarEvents'
import { EVENT_TYPES, type EventTypeId } from './calendarTypes'
import { isoDate } from './dateUtils'
import type { CalendarViewMode } from './PlanningCalendarPage'

interface Props {
  viewMode: CalendarViewMode
  onSetView(v: CalendarViewMode): void
}

export default function MonthView({ viewMode, onSetView }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month1, setMonth1] = useState(now.getMonth() + 1)
  const todayIso = isoDate(now)
  const [selectedIso, setSelectedIso] = useState(todayIso)
  const [activeTypes, setActiveTypes] = useState<Set<EventTypeId>>(
    () => new Set(EVENT_TYPES.map(t => t.id)),
  )

  const { events, loading, error } = useCalendarEvents(year, month1)

  const filtered = useMemo(
    () => events.filter(e => activeTypes.has(e.type)),
    [events, activeTypes],
  )
  const selectedEvents = useMemo(
    () => filtered.filter(e => e.date === selectedIso),
    [filtered, selectedIso],
  )
  const bloomCount = filtered.filter(e => e.type === 'bloom').length
  const openCount = filtered.filter(e => e.overdue).length

  function prev() {
    if (month1 === 1) { setYear(y => y - 1); setMonth1(12) }
    else setMonth1(m => m - 1)
  }
  function next() {
    if (month1 === 12) { setYear(y => y + 1); setMonth1(1) }
    else setMonth1(m => m + 1)
  }
  function toggle(id: EventTypeId) {
    setActiveTypes(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <>
      <CalendarMasthead
        year={year} month1={month1} viewMode={viewMode}
        onPrev={prev} onNext={next} onSetView={onSetView}
        taskCount={filtered.length} bloomCount={bloomCount} openCount={openCount}
      />
      <CalendarLegend events={events} activeTypes={activeTypes} onToggle={toggle} />
      <main>
        <CalendarGrid
          year={year} month1={month1}
          events={filtered}
          todayIso={todayIso}
          selectedIso={selectedIso}
          onSelect={setSelectedIso}
        />
        <aside className="col-side">
          <CalendarAgendaCard selectedIso={selectedIso} events={selectedEvents} />
          <CalendarAlmanac month1={month1} />
          <CalendarUpcoming todayIso={todayIso} events={filtered} />
          <CalendarMoon year={year} month1={month1} todayDay={now.getDate()} />
        </aside>
      </main>
      {loading && <div style={{ padding: 16, opacity: 0.6 }}>Laden…</div>}
      {error && <div style={{ padding: 16, color: 'crimson' }}>Fout: {error}</div>}
    </>
  )
}
```

- [ ] **Step 2: Update PlanningCalendarPage to route on viewMode**

When the user toggles to "Agenda" view, PhenologyView has no masthead — so we must render a small standalone toggle bar above it, otherwise the user is stuck. Replace the body of `PlanningCalendarPage.tsx`:

```typescript
// groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx
import { useState } from 'react'
import MonthView from './MonthView'
import PhenologyView from './PhenologyView'
import './calendar.css'

export type CalendarViewMode = 'month' | 'agenda'

function StandaloneToggle({ view, onSet }: { view: CalendarViewMode; onSet(v: CalendarViewMode): void }) {
  return (
    <div style={{
      maxWidth: 1480, margin: '0 auto', padding: '24px 48px 0',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div className="view-toggle">
        <button className={view === 'month' ? 'on' : ''} onClick={() => onSet('month')}>Maand</button>
        <button className={view === 'agenda' ? 'on' : ''} onClick={() => onSet('agenda')}>Agenda</button>
      </div>
    </div>
  )
}

export default function PlanningCalendarPage() {
  const [view, setView] = useState<CalendarViewMode>('month')
  return (
    <div className="cal-page">
      {view === 'month' ? (
        <MonthView viewMode={view} onSetView={setView} />
      ) : (
        <>
          <StandaloneToggle view={view} onSet={setView} />
          <PhenologyView />
        </>
      )}
    </div>
  )
}
```

**Why a standalone toggle:** `MonthView` renders its own masthead (which includes the toggle), but `PhenologyView` doesn't. Rather than retrofit PhenologyView with the magazine masthead (would change its appearance), we render a minimal top-right toggle when in agenda mode. The `view-toggle` CSS class is defined in `calendar.css` (from Task D1).

- [ ] **Step 3: Smoke-test**

`npm run dev`, visit `/calendar`. Expect the magazine layout to render at desktop width (>1200px). Today is highlighted, side panel shows agenda for today, almanac for current month. Click another day → side panel updates. Click "Agenda" in the view toggle → falls back to phenology view. Click "Maand" → back to grid.

Likely first-iteration issues:
- Day cells may overflow if there are too many events: the `.ev-list` should already truncate via the `+ N meer` row.
- Icons may 404 if `plant_icon_variant` doesn't match an actual icon file — fallback `/icons/seed.svg` should cover that.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/pages/calendar/MonthView.tsx \
        groei/frontend/src/pages/calendar/PlanningCalendarPage.tsx
git commit -m "feat(calendar): MonthView default, viewmode toggle wired"
```

---

## Section E — Mobile fallback + polish

### Task E1: MobileAgendaList

**Files:**
- Create: `groei/frontend/src/pages/calendar/MobileAgendaList.tsx`

A simple day-grouped list of events for the current month. Used when viewport is narrower than the grid can support.

- [ ] **Step 1: Write the component**

```typescript
// groei/frontend/src/pages/calendar/MobileAgendaList.tsx
import { useMemo } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_BY_ID } from './calendarTypes'
import { DAY_LONG_NL, MONTH_SHORT_NL, dowMon } from './dateUtils'

interface Props { events: CalendarEvent[]; todayIso: string }

export default function MobileAgendaList({ events, todayIso }: Props) {
  const grouped = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    events.forEach(e => {
      const arr = m.get(e.date) ?? []
      arr.push(e)
      m.set(e.date, arr)
    })
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [events])

  if (grouped.length === 0) {
    return <p style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>Geen taken deze maand.</p>
  }

  return (
    <div style={{ padding: '0 12px 32px' }}>
      {grouped.map(([iso, list]) => {
        const [y, m, d] = iso.split('-').map(Number)
        const isToday = iso === todayIso
        return (
          <section key={iso} style={{ marginTop: 18 }}>
            <h3 style={{
              fontFamily: 'Fraunces, serif', fontSize: 18, margin: '0 0 6px',
              color: isToday ? '#2F5D3A' : '#1F2A1E',
            }}>
              {DAY_LONG_NL[dowMon(y, m, d)]} {d} {MONTH_SHORT_NL[m - 1]}
              {isToday && <em style={{ marginLeft: 8, fontSize: 12, color: '#B2664A' }}>vandaag</em>}
            </h3>
            {list.map(e => {
              const def = EVENT_TYPE_BY_ID[e.type as EventTypeId]
              return (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: '#FFFEF9',
                  borderLeft: `3px solid ${def?.color ?? '#2F5D3A'}`,
                  borderRadius: 4, marginBottom: 6,
                }}>
                  <span style={{ fontSize: 12, color: '#8A9482', minWidth: 64 }}>{def?.labelNl ?? e.type}</span>
                  <span style={{ fontFamily: 'Fraunces, serif', fontSize: 14 }}>{e.plant_name ?? '—'}</span>
                  {e.overdue && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#B2664A' }}>overtijd</span>}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/pages/calendar/MobileAgendaList.tsx
git commit -m "feat(calendar): MobileAgendaList fallback"
```

---

### Task E2: Viewport-based switch in MonthView

**Files:**
- Modify: `groei/frontend/src/pages/calendar/MonthView.tsx`

- [ ] **Step 1: Add a viewport hook**

Create `groei/frontend/src/pages/calendar/useIsNarrow.ts`:

```typescript
// groei/frontend/src/pages/calendar/useIsNarrow.ts
import { useEffect, useState } from 'react'

export function useIsNarrow(breakpoint = 1200): boolean {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return narrow
}
```

- [ ] **Step 2: Wire MobileAgendaList in MonthView**

In `MonthView.tsx`, add imports and a conditional render:

```typescript
import MobileAgendaList from './MobileAgendaList'
import { useIsNarrow } from './useIsNarrow'

// inside the component, after the hooks:
const isNarrow = useIsNarrow(1200)

// then change the return to:
return (
  <>
    <CalendarMasthead {...} />
    <CalendarLegend {...} />
    {isNarrow
      ? <MobileAgendaList events={filtered} todayIso={todayIso} />
      : (
        <main>
          <CalendarGrid {...} />
          <aside className="col-side">
            <CalendarAgendaCard {...} />
            <CalendarAlmanac {...} />
            <CalendarUpcoming {...} />
            <CalendarMoon {...} />
          </aside>
        </main>
      )}
    {loading && <div style={{ padding: 16, opacity: 0.6 }}>Laden…</div>}
    {error && <div style={{ padding: 16, color: 'crimson' }}>Fout: {error}</div>}
  </>
)
```

(Keep the spreads as they were in the previous version of MonthView.)

- [ ] **Step 3: Smoke-test**

`npm run dev`, visit `/calendar`. Resize the browser below 1200px → expect the agenda list. Resize above → grid returns.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/pages/calendar/useIsNarrow.ts groei/frontend/src/pages/calendar/MonthView.tsx
git commit -m "feat(calendar): mobile fallback under 1200px"
```

---

### Task E3: Visual review against the mockup

This is the polish task. Open the mockup and your local `/calendar` side by side.

- [ ] **Step 1: Compare visually**

Open `c:\Users\leon_\Downloads\Floreren Kalender.html` in one browser tab and `http://localhost:5173/calendar` in another. Check, top to bottom:

- [ ] Masthead — eyebrow alignment, headline weight, lede font/italic
- [ ] Month switcher — pill toggle styling matches, arrows are circular
- [ ] Legend strip — chip dots are correct colors, "off" state is dimmed
- [ ] Calendar grid — week column rotated text reads vertically, today has 2px green inset shadow, selected has 1px terra inset
- [ ] Day cell — `vandaag` mini-label appears under today's number
- [ ] Event pill — left border-color matches event type, no overflow
- [ ] Side cards — paper background, shadow, dashed separators between agenda items
- [ ] Almanac — dark green panel, gold italic emphasis, leading quote mark
- [ ] Moon strip — half-moon clipping correct (waxing fills from right, waning from left)
- [ ] Footer — italic line + uppercase colophon

- [ ] **Step 2: Fix the top 3 discrepancies**

For each gap, edit `calendar.css` or the relevant component. Common likely fixes:
- `box-sizing: border-box` may need adding to `.cal-page *` if Tailwind preflight is being overridden.
- The `<img>` plant icons in `.ev-icon` may need `width: 100%; height: 100%; object-fit: contain` to fill the slot.
- Body background gradient may not show — verify `.cal-page` has `min-height: 100dvh` and the gradient is set on `.cal-page` rather than `body`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "polish(calendar): visual alignment with mockup"
```

---

### Task E4: i18n decision — accept Dutch-only for now

The mockup is fully Dutch. Existing app supports `useT()` for English fallback. For this iteration we ship Dutch strings hardcoded (matches mockup) and document the gap.

- [ ] **Step 1: Add a note in the i18n source file**

Append to `groei/frontend/src/i18n/translations.ts`:

```typescript
// Note: as of 2026-05-16, the new /calendar MonthView ships Dutch-only strings
// (matching the mockup at c:\Users\leon_\Downloads\Floreren Kalender.html).
// English translations are pending — see docs/plans/in-progress/2026-05-16-calendar-magazine-redesign.md
// section E4 for the gap list. Phenology view (the "Agenda" tab) is already bilingual.
```

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/i18n/translations.ts
git commit -m "docs(i18n): note calendar MonthView is Dutch-only for now"
```

---

## Self-review checklist

Run through these before declaring the feature done.

- [ ] `cd groei/backend && pytest tests/test_calendar_events.py -v` → 4 tests pass.
- [ ] `cd groei/frontend && npm run build` → no TypeScript errors.
- [ ] Visit `/calendar` on desktop — magazine layout renders.
- [ ] Today highlighted in green; clicking another day moves the orange "selected" border.
- [ ] Side panel agenda updates when you click a different day.
- [ ] View toggle: "Maand" shows new grid; "Agenda" shows the old phenology UI; both work.
- [ ] Filter chips toggle event types; counts reflect the current month.
- [ ] Prev/next month arrows update the grid + almanac + side panel.
- [ ] Resize browser below 1200px → mobile agenda list renders.
- [ ] No magazine styles leak into other pages — visit `/dashboard`, `/plants`, `/map/:slug`, confirm nothing changed.
- [ ] Phenology view (in the Agenda tab) renders identically to the old `/calendar` page.
- [ ] Create a new care_schedule with `next_due` next week → confirm it appears in MonthView and in CalendarUpcoming.
- [ ] No console errors on first load.
- [ ] `git log --oneline` shows ~20+ small commits across Sections A, B, C, D, E.

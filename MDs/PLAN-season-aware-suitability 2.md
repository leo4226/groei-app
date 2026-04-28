# PLAN: Season-Aware Suitability & Plant Lifecycle Panel

## Goal
Replace the current always-on sun comparison ("Te weinig" in April for a bean) with a growing-season-aware suitability system. Add a 12-month lifecycle bar to the plant detail panel showing what the plant is doing each month, overlaid with your garden's actual sun at that spot. Make the suitability badge contextual and useful year-round.

**Depends on:** `PLAN-plant-phenology-schema.md` being fully implemented and backfilled.

---

## What Changes, Conceptually

### Current behaviour
- Suitability compares today's sun hours at the plant's position against a fixed threshold
- Shows "Te weinig" in April for bruine boon even though it shouldn't even be planted yet
- Shows the same badge year-round regardless of what the plant is doing

### New behaviour
- **Suitability is evaluated against the growing season only** — the months where `phase` is not `dormant` / `dying_back`
- **Badge text becomes contextual:**
  - Outside growing season → show current lifecycle phase ("Rustperiode" / "Opkomst") instead of a warning
  - During growing season → compare actual sun to `sun_hours_needed` for this month → "Goed", "Te weinig", "Te veel"
  - For trees/perennials with `evergreen` phase → always evaluate
- **Plant detail panel gets a lifecycle Gantt bar** — 12 month strips, colored by phase, with a sun-need indicator and your garden's actual sun overlaid per month

---

## Data Flow

```
plant → species_id → phenology.months[currentMonth]
                           ↓
                    phase + sun_hours_needed
                           ↓
              compare to heatmap sun at plant's (x,y)
                           ↓
                    contextual badge + panel data
```

The frontend already has the monthly sun heatmap data available. The new logic just needs to pick the right month's data and the right threshold.

---

## Backend Changes

### 1. `backend/routers/plants.py` — enrich plant list endpoint

The `GET /plants` endpoint (used to render the map) should include `species_id` and a summary of the current month's phenology phase so the frontend doesn't need a second call:

```python
@router.get("/plants")
def list_plants(db = Depends(get_db)):
    rows = db.execute("""
        SELECT 
            p.*,
            s.id as species_id,
            s.common_name_nl as species_name,
            s.phenology_json
        FROM plants p
        LEFT JOIN plant_species s ON p.species_id = s.id
    """).fetchall()
    
    result = []
    for row in rows:
        plant = dict(row)
        if plant.get("phenology_json"):
            phenology = json.loads(plant.pop("phenology_json"))
            plant["phenology"] = phenology
        else:
            plant["phenology"] = None
        result.append(plant)
    
    return result
```

### 2. `backend/routers/plants.py` — suitability endpoint

Add a dedicated endpoint that computes suitability for a plant at its current position, given a month:

```python
@router.get("/plants/{plant_id}/suitability")
def get_plant_suitability(
    plant_id: int,
    month: int = None,  # 1-12, defaults to current month
    db = Depends(get_db)
):
    from datetime import date
    if month is None:
        month = date.today().month
    
    row = db.execute("""
        SELECT p.x, p.y, p.map_id, s.phenology_json
        FROM plants p
        LEFT JOIN plant_species s ON p.species_id = s.id
        WHERE p.id = ?
    """, (plant_id,)).fetchone()
    
    if not row:
        raise HTTPException(404)
    
    if not row["phenology_json"]:
        return {"status": "unknown", "reason": "no_species_data"}
    
    phenology = json.loads(row["phenology_json"])
    month_data = next((m for m in phenology["months"] if m["month"] == month), None)
    
    if not month_data:
        return {"status": "unknown", "reason": "no_month_data"}
    
    phase = month_data["phase"]
    sun_needed = month_data["sun_hours_needed"]
    
    # Return the phase info — frontend compares against its heatmap data
    return {
        "month": month,
        "phase": phase,
        "phase_label_nl": month_data["phase_label_nl"],
        "sun_hours_needed": sun_needed,
        "description_nl": month_data["description_nl"],
        "actions_nl": month_data["actions_nl"],
        "is_active_growing": phase in ("growing", "flowering", "fruiting", "harvest", "establishing", "evergreen"),
    }
```

---

## Frontend Changes

### 3. `src/utils/suitability.ts` (NEW)

Central suitability logic — keeps it testable and out of components.

```typescript
export type SuitabilityStatus = 
  | "good"           // enough sun during active phase
  | "too_little"     // not enough sun during active phase  
  | "too_much"       // too much sun during active phase (shade lovers)
  | "dormant"        // plant is resting, no evaluation needed
  | "not_planted"    // outside sow/transplant window, informational
  | "unknown";       // no species data

export interface SuitabilityResult {
  status: SuitabilityStatus;
  badgeLabel: string;        // Short Dutch label for map badge
  detailLabel: string;       // Longer Dutch text for detail panel
  sunNeeded: number;         // hours/day needed this month
  sunActual: number;         // hours/day available at this spot this month
  phaseLabel: string;        // e.g. "Actieve groei"
  actions: string[];         // what to do this month
}

interface MonthPhenology {
  month: number;
  phase: string;
  phase_label_nl: string;
  sun_hours_needed: number;
  description_nl: string;
  actions_nl: string[];
}

interface Phenology {
  months: MonthPhenology[];
  sow_window: number[];
  transplant_window: number[];
  harvest_window: number[];
  frost_sensitive: boolean;
}

const ACTIVE_PHASES = new Set([
  "growing", "flowering", "fruiting", "harvest", "establishing", "evergreen"
]);

export function computeSuitability(
  phenology: Phenology | null | undefined,
  sunHoursAtSpot: number,   // from heatmap for this month
  month: number             // 1-12
): SuitabilityResult {
  if (!phenology) {
    return {
      status: "unknown",
      badgeLabel: "?",
      detailLabel: "Geen soortdata beschikbaar",
      sunNeeded: 0,
      sunActual: sunHoursAtSpot,
      phaseLabel: "",
      actions: [],
    };
  }

  const monthData = phenology.months.find(m => m.month === month);
  if (!monthData) {
    return {
      status: "unknown",
      badgeLabel: "?",
      detailLabel: "Geen maanddata",
      sunNeeded: 0,
      sunActual: sunHoursAtSpot,
      phaseLabel: "",
      actions: [],
    };
  }

  const { phase, phase_label_nl, sun_hours_needed, description_nl, actions_nl } = monthData;
  const isActive = ACTIVE_PHASES.has(phase);

  if (!isActive) {
    return {
      status: "dormant",
      badgeLabel: phase_label_nl,
      detailLabel: description_nl,
      sunNeeded: 0,
      sunActual: sunHoursAtSpot,
      phaseLabel: phase_label_nl,
      actions: actions_nl,
    };
  }

  // Active growing phase — evaluate sun
  const diff = sunHoursAtSpot - sun_hours_needed;

  if (diff >= -0.5) {
    // Within 0.5h tolerance = good
    return {
      status: "good",
      badgeLabel: "Goed",
      detailLabel: `${description_nl} Dit punt heeft genoeg zon.`,
      sunNeeded: sun_hours_needed,
      sunActual: sunHoursAtSpot,
      phaseLabel: phase_label_nl,
      actions: actions_nl,
    };
  } else {
    return {
      status: "too_little",
      badgeLabel: "Te weinig zon",
      detailLabel: `${description_nl} Dit punt heeft ~${sunHoursAtSpot.toFixed(1)}u zon, maar de plant heeft ${sun_hours_needed}u nodig.`,
      sunNeeded: sun_hours_needed,
      sunActual: sunHoursAtSpot,
      phaseLabel: phase_label_nl,
      actions: actions_nl,
    };
  }
}

/** 
 * Get the months where a plant is actively growing (for spot-inspector use).
 * Returns month numbers 1-12.
 */
export function getActiveMonths(phenology: Phenology): number[] {
  return phenology.months
    .filter(m => ACTIVE_PHASES.has(m.phase))
    .map(m => m.month);
}

/**
 * Compute peak sun need — the max sun_hours_needed across all active months.
 * Used for rough spot matching in Plan 3.
 */
export function getPeakSunNeed(phenology: Phenology): number {
  const active = phenology.months.filter(m => ACTIVE_PHASES.has(m.phase));
  if (!active.length) return 0;
  return Math.max(...active.map(m => m.sun_hours_needed));
}
```

### 4. `src/components/PlantMarker.tsx` — update badge logic

Replace the current hardcoded suitability comparison with `computeSuitability`:

```typescript
import { computeSuitability } from "../utils/suitability";

// Inside the component, where the badge is rendered:
const currentMonth = new Date().getMonth() + 1; // 1-12
const sunAtSpot = getSunHoursAtPosition(plant.x, plant.y, currentMonth); 
// ^ this already exists in your heatmap logic — use it

const suitability = computeSuitability(plant.phenology, sunAtSpot, currentMonth);

// Badge rendering:
const badgeColor = {
  good: "bg-green-500",
  too_little: "bg-red-500", 
  too_much: "bg-orange-500",
  dormant: "bg-gray-400",
  not_planted: "bg-blue-400",
  unknown: "bg-gray-300",
}[suitability.status];

// Replace current badge text with suitability.badgeLabel
// For dormant plants: show phase label instead of sun warning
```

### 5. `src/components/PlantDetailPanel.tsx` — lifecycle Gantt bar (NEW SECTION)

Add a lifecycle section below the existing plant info. This is the main UI addition in this plan.

```typescript
import { computeSuitability, getActiveMonths } from "../utils/suitability";

// Month labels
const MONTH_LABELS = ["J","F","M","A","M","J","J","A","S","O","N","D"];

const PHASE_COLORS: Record<string, string> = {
  dormant:     "#94a3b8",   // slate-400
  dying_back:  "#cbd5e1",   // slate-300
  establishing:"#86efac",  // green-300
  growing:     "#22c55e",   // green-500
  flowering:   "#f472b6",   // pink-400
  fruiting:    "#fb923c",   // orange-400
  harvest:     "#eab308",   // yellow-500
  evergreen:   "#16a34a",   // green-600
  unknown:     "#e2e8f0",   // slate-200
};

// Inside render, after plant name/info:
function LifecycleBar({ phenology, sunByMonth, plantX, plantY }) {
  const currentMonth = new Date().getMonth() + 1;
  
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-2">Jaarkalender</h3>
      
      {/* Month strips */}
      <div className="flex gap-0.5 mb-1">
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1;
          const monthData = phenology?.months?.find(m => m.month === month);
          const phase = monthData?.phase ?? "unknown";
          const isCurrentMonth = month === currentMonth;
          
          return (
            <div
              key={month}
              className="flex-1 flex flex-col items-center"
              title={monthData?.phase_label_nl ?? ""}
            >
              <div
                className={`w-full h-6 rounded-sm ${isCurrentMonth ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}
                style={{ backgroundColor: PHASE_COLORS[phase] }}
              />
              <span className="text-[9px] text-gray-500 mt-0.5">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Sun overlay bar — actual vs needed */}
      <div className="flex gap-0.5 mt-2">
        {MONTH_LABELS.map((_, i) => {
          const month = i + 1;
          const monthData = phenology?.months?.find(m => m.month === month);
          const sunNeeded = monthData?.sun_hours_needed ?? 0;
          const sunActual = sunByMonth[month] ?? 0;
          
          if (sunNeeded === 0) return <div key={month} className="flex-1" />;
          
          const ratio = Math.min(sunActual / sunNeeded, 1.5);
          const color = ratio >= 0.9 ? "#22c55e" : ratio >= 0.6 ? "#f59e0b" : "#ef4444";
          
          return (
            <div key={month} className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: color }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1">
        Groen = genoeg zon · Oranje = bijna genoeg · Rood = te weinig
      </p>

      {/* Current month callout */}
      {phenology && (
        <CurrentMonthCallout
          phenology={phenology}
          sunActual={sunByMonth[currentMonth] ?? 0}
          month={currentMonth}
        />
      )}

      {/* Sowing / harvest windows */}
      {phenology && (
        <PlantingWindows phenology={phenology} />
      )}

      {/* Interesting fact */}
      {phenology?.interesting_facts_nl && (
        <p className="text-xs text-gray-500 italic mt-3 border-t pt-2">
          💡 {phenology.interesting_facts_nl}
        </p>
      )}
    </div>
  );
}

function CurrentMonthCallout({ phenology, sunActual, month }) {
  const suitability = computeSuitability(phenology, sunActual, month);
  const monthNames = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  
  return (
    <div className="mt-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
      <p className="text-xs font-medium text-gray-700">
        Nu ({monthNames[month - 1]}): {suitability.phaseLabel}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{suitability.detailLabel}</p>
      {suitability.actions.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {suitability.actions.map((action, i) => (
            <li key={i} className="text-xs text-gray-600">→ {action}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlantingWindows({ phenology }) {
  const monthNames = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const fmt = (months: number[]) => months.map(m => monthNames[m-1]).join(", ");
  
  return (
    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
      {phenology.sow_window?.length > 0 && (
        <div className="bg-green-50 rounded p-1">
          <p className="text-[9px] font-medium text-green-700">Zaaien</p>
          <p className="text-[9px] text-green-600">{fmt(phenology.sow_window)}</p>
        </div>
      )}
      {phenology.transplant_window?.length > 0 && (
        <div className="bg-blue-50 rounded p-1">
          <p className="text-[9px] font-medium text-blue-700">Uitplanten</p>
          <p className="text-[9px] text-blue-600">{fmt(phenology.transplant_window)}</p>
        </div>
      )}
      {phenology.harvest_window?.length > 0 && (
        <div className="bg-yellow-50 rounded p-1">
          <p className="text-[9px] font-medium text-yellow-700">Oogst</p>
          <p className="text-[9px] text-yellow-600">{fmt(phenology.harvest_window)}</p>
        </div>
      )}
    </div>
  );
}
```

### 6. `src/hooks/usePlantData.ts` (or equivalent data hook)

Make sure the plants query returns phenology data. If you're using React Query:

```typescript
const { data: plants } = useQuery({
  queryKey: ["plants"],
  queryFn: () => fetch("/api/plants").then(r => r.json()),
  // phenology is now included in each plant object from the enriched endpoint
});
```

### 7. `src/components/PlantSidebar.tsx` — sidebar list badge update

The sidebar plant list also shows suitability indicators. Apply the same `computeSuitability` logic there so the list and map badges are consistent:

```typescript
// For each plant in sidebar list:
const suitability = computeSuitability(plant.phenology, sunAtSpot, currentMonth);

// Replace existing dot/badge with:
<span className={`text-xs px-1.5 py-0.5 rounded-full ${
  suitability.status === "good" ? "bg-green-100 text-green-700" :
  suitability.status === "too_little" ? "bg-red-100 text-red-700" :
  suitability.status === "dormant" ? "bg-gray-100 text-gray-500" :
  "bg-gray-100 text-gray-400"
}`}>
  {suitability.badgeLabel}
</span>
```

---

## What This Does NOT Change

- Heatmap rendering — still works exactly as before
- Shadow/sun calculation — unchanged
- Plant drag/drop — unchanged
- Database IDs, plant positions — unchanged

---

## Verification Checklist

After implementation:

1. **Bruine boon in April** → badge shows "Opkomst" or "Rustperiode", not "Te weinig zon"
2. **Bruine boon in July** → badge correctly evaluates sun and shows "Goed" or "Te weinig zon"
3. **Camellia in January** → shows "Rustperiode" badge (dormant)
4. **English Oak year-round** → shows correct phase per month (dormant in winter, growing in summer)
5. **Lifecycle bar** renders in plant detail panel with colored month strips
6. **Sun overlay bars** show green/orange/red based on actual vs needed sun per month
7. **Planting windows** show correctly for plants that have them (bruine boon: zaaien mrt-apr, uitplanten mei)

---

## Session Starter Prompt for Claude Code

```
I'm working on the Groei garden planning app (React + TypeScript + FastAPI).

Please implement PLAN-season-aware-suitability.md from the project files.

Key steps:
1. Create src/utils/suitability.ts with the computeSuitability function
2. Update the GET /plants endpoint to include phenology data (join with plant_species)
3. Update PlantMarker badge logic to use computeSuitability instead of hardcoded comparison
4. Add the LifecycleBar section to PlantDetailPanel (12-month Gantt + sun overlay + windows)
5. Update sidebar plant list badges to use the same suitability logic

Important context:
- phenology data is already generated (PLAN-plant-phenology-schema.md was implemented first)
- The heatmap sun data is already computed per position per month — reuse that same function for sunAtSpot
- Do not change heatmap rendering, shadow calculation, or plant positioning logic
- All badge text should be in Dutch

After implementing, verify:
- A bruine boon in April should NOT show "Te weinig zon" — it should show its dormant/establishing phase label
- The plant detail panel should show a colored 12-month lifecycle bar
```

# PLAN: Spot Inspector — "What Can Grow Here?" + Planting Calendar

## Goal
Add two major planning features:

1. **Spot Inspector** — tap any point on the garden map to see its sun profile and get a ranked list of plants that would thrive there, drawn from all species in the database. Answers "where should I put my bruine boon?" and "what can I plant in this shady corner?"

2. **Planting Calendar** — a monthly overview across all your plants showing what needs attention this month (planting, harvesting, pruning windows) and whether any plants are currently misplaced sun-wise during their active season.

**Depends on:** Both previous plans implemented. `plant_species` table populated, `computeSuitability` util exists.

---

## Feature 1: Spot Inspector

### Interaction Design

- **Trigger:** Long-press (500ms) on empty map space, or tap a dedicated "Inspecteer plek" toggle button in the toolbar
- **Result:** A panel slides up from the bottom (mobile) or appears as a sidebar section (desktop) showing:
  - Sun hours for this spot across all 12 months (small bar chart)
  - "Geschikt voor:" — ranked list of species from the DB whose growing-season sun needs match this spot
  - "Minder geschikt:" — species that need more sun than this spot can provide
  - Option to place a plant directly from the list

### Matching Logic

A spot is **suitable** for a species if, for every active growing month, `sunAtSpot[month] >= sunNeeded[month] - 0.5` (same 0.5h tolerance as suitability.ts).

A spot is **marginal** if the average shortfall across active months is between 0.5h and 1.5h.

---

## Backend Changes

### 1. `backend/routers/spots.py` (NEW)

```python
from fastapi import APIRouter, Depends, Query
from database import get_db
import json

router = APIRouter(prefix="/spots", tags=["spots"])

@router.get("/suitability")
def get_spot_suitability(
    x: float = Query(...),
    y: float = Query(...),
    map_id: int = Query(1),
    db = Depends(get_db)
):
    """
    Given a garden coordinate, return all species ranked by suitability.
    Sun hours per month are computed by the frontend heatmap — we receive
    them as a query param array and match against species phenology.
    
    sun_by_month is passed as repeated params: ?sun=2.1&sun=2.3&...&sun=6.1
    (12 values, index 0 = January)
    """
    # Note: sun_by_month is passed from frontend since sun calculation lives there
    # This endpoint just does the species matching
    pass

@router.post("/suitability")
def get_spot_suitability_post(
    payload: dict,
    db = Depends(get_db)
):
    """
    POST version: { x, y, map_id, sun_by_month: [float x 12] }
    Returns species ranked by suitability for this spot.
    """
    sun_by_month = payload.get("sun_by_month", [0] * 12)  # index 0 = Jan
    
    species_rows = db.execute(
        "SELECT id, slug, common_name_nl, common_name_en, latin_name, phenology_json "
        "FROM plant_species WHERE phenology_json IS NOT NULL"
    ).fetchall()
    
    results = []
    
    for row in species_rows:
        phenology = json.loads(row["phenology_json"])
        months = phenology.get("months", [])
        
        ACTIVE_PHASES = {"growing", "flowering", "fruiting", "harvest", "establishing", "evergreen"}
        active_months = [m for m in months if m["phase"] in ACTIVE_PHASES]
        
        if not active_months:
            continue
        
        shortfalls = []
        for m in active_months:
            month_idx = m["month"] - 1  # 0-indexed
            sun_actual = sun_by_month[month_idx] if month_idx < len(sun_by_month) else 0
            sun_needed = m["sun_hours_needed"]
            shortfall = max(0, sun_needed - sun_actual)
            shortfalls.append(shortfall)
        
        avg_shortfall = sum(shortfalls) / len(shortfalls)
        max_shortfall = max(shortfalls)
        
        if avg_shortfall <= 0.5:
            tier = "suitable"
        elif avg_shortfall <= 1.5:
            tier = "marginal"
        else:
            tier = "unsuitable"
        
        results.append({
            "species_id": row["id"],
            "common_name_nl": row["common_name_nl"],
            "common_name_en": row["common_name_en"],
            "latin_name": row["latin_name"],
            "tier": tier,
            "avg_shortfall_hours": round(avg_shortfall, 2),
            "max_shortfall_hours": round(max_shortfall, 2),
            "sow_window": phenology.get("sow_window", []),
            "transplant_window": phenology.get("transplant_window", []),
            "harvest_window": phenology.get("harvest_window", []),
            "frost_sensitive": phenology.get("frost_sensitive", False),
            "interesting_facts_nl": phenology.get("interesting_facts_nl", ""),
            "active_months": [m["month"] for m in active_months],
        })
    
    # Sort: suitable first, then marginal, then by shortfall ascending
    tier_order = {"suitable": 0, "marginal": 1, "unsuitable": 2}
    results.sort(key=lambda r: (tier_order[r["tier"]], r["avg_shortfall_hours"]))
    
    return {
        "x": payload.get("x"),
        "y": payload.get("y"),
        "sun_by_month": sun_by_month,
        "species": results,
    }
```

Register in `main.py`:
```python
from routers import spots
app.include_router(spots.router)
```

---

## Frontend Changes

### 2. `src/hooks/useSpotInspector.ts` (NEW)

```typescript
import { useState, useCallback } from "react";
import { getSunHoursAtPosition } from "./useSunHeatmap"; // existing function

export interface SpeciesSuggestion {
  species_id: number;
  common_name_nl: string;
  common_name_en: string | null;
  latin_name: string | null;
  tier: "suitable" | "marginal" | "unsuitable";
  avg_shortfall_hours: number;
  sow_window: number[];
  transplant_window: number[];
  harvest_window: number[];
  frost_sensitive: boolean;
  interesting_facts_nl: string;
  active_months: number[];
}

export interface SpotInspectorResult {
  x: number;
  y: number;
  sunByMonth: number[];  // 12 values
  species: SpeciesSuggestion[];
  loading: boolean;
  error: string | null;
}

export function useSpotInspector() {
  const [result, setResult] = useState<SpotInspectorResult | null>(null);
  const [loading, setLoading] = useState(false);

  const inspect = useCallback(async (x: number, y: number) => {
    setLoading(true);
    
    // Compute sun for all 12 months at this position using existing heatmap logic
    const sunByMonth = Array.from({ length: 12 }, (_, i) =>
      getSunHoursAtPosition(x, y, i + 1)
    );
    
    try {
      const response = await fetch("/api/spots/suitability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y, sun_by_month: sunByMonth }),
      });
      const data = await response.json();
      
      setResult({
        x, y,
        sunByMonth,
        species: data.species,
        loading: false,
        error: null,
      });
    } catch (e) {
      setResult({ x, y, sunByMonth, species: [], loading: false, error: "Kon niet laden" });
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setResult(null), []);

  return { result, loading, inspect, clear };
}
```

### 3. `src/components/SpotInspectorPanel.tsx` (NEW)

```typescript
import { SpotInspectorResult, SpeciesSuggestion } from "../hooks/useSpotInspector";

const MONTH_LABELS = ["J","F","M","A","M","J","J","A","S","O","N","D"];

interface Props {
  result: SpotInspectorResult;
  onClose: () => void;
  onPlantHere: (speciesId: number, x: number, y: number) => void;
}

export function SpotInspectorPanel({ result, onClose, onPlantHere }: Props) {
  const suitable = result.species.filter(s => s.tier === "suitable");
  const marginal = result.species.filter(s => s.tier === "marginal");
  
  const maxSun = Math.max(...result.sunByMonth, 1);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 
                    max-h-[70vh] overflow-y-auto md:left-auto md:right-4 md:bottom-4 
                    md:w-96 md:rounded-2xl md:max-h-[80vh]">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
        <div>
          <h2 className="font-semibold text-gray-800">Plek inspectie</h2>
          <p className="text-xs text-gray-500">
            {result.sunByMonth[new Date().getMonth()].toFixed(1)}u zon nu
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
      </div>

      {/* Sun bar chart — all 12 months */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs font-medium text-gray-500 mb-1">Zon per maand op deze plek</p>
        <div className="flex items-end gap-0.5 h-12">
          {result.sunByMonth.map((sun, i) => {
            const height = (sun / maxSun) * 100;
            const isNow = i === new Date().getMonth();
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                <div
                  className={`w-full rounded-sm ${isNow ? "bg-amber-400" : "bg-amber-200"}`}
                  style={{ height: `${height}%`, minHeight: "2px" }}
                  title={`${MONTH_LABELS[i]}: ${sun.toFixed(1)}u`}
                />
                <span className="text-[8px] text-gray-400">{MONTH_LABELS[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Suitable species */}
      <div className="px-4 py-3">
        {suitable.length > 0 && (
          <>
            <p className="text-xs font-semibold text-green-700 mb-2">
              ✓ Geschikt ({suitable.length})
            </p>
            <div className="space-y-2">
              {suitable.map(s => (
                <SpeciesCard key={s.species_id} species={s} 
                  x={result.x} y={result.y}
                  onPlantHere={onPlantHere} />
              ))}
            </div>
          </>
        )}

        {marginal.length > 0 && (
          <>
            <p className="text-xs font-semibold text-amber-600 mt-4 mb-2">
              ~ Marginaal ({marginal.length})
            </p>
            <div className="space-y-2">
              {marginal.map(s => (
                <SpeciesCard key={s.species_id} species={s}
                  x={result.x} y={result.y}
                  onPlantHere={onPlantHere} />
              ))}
            </div>
          </>
        )}

        {suitable.length === 0 && marginal.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            Geen geschikte planten gevonden voor deze plek.<br />
            <span className="text-xs">Overweeg schaduwminnende soorten.</span>
          </p>
        )}
      </div>
    </div>
  );
}

function SpeciesCard({ species, x, y, onPlantHere }: {
  species: SpeciesSuggestion;
  x: number; y: number;
  onPlantHere: (speciesId: number, x: number, y: number) => void;
}) {
  const monthNames = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const fmt = (months: number[]) => months.map(m => monthNames[m-1]).join(", ");
  
  return (
    <div className="border border-gray-100 rounded-lg p-2.5 bg-gray-50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{species.common_name_nl}</p>
          {species.latin_name && (
            <p className="text-[10px] text-gray-400 italic">{species.latin_name}</p>
          )}
        </div>
        <button
          onClick={() => onPlantHere(species.species_id, x, y)}
          className="text-xs bg-green-500 text-white px-2 py-1 rounded-md 
                     hover:bg-green-600 whitespace-nowrap shrink-0"
        >
          + Planten
        </button>
      </div>
      
      {/* Windows */}
      <div className="flex gap-2 mt-1.5 flex-wrap">
        {species.sow_window.length > 0 && (
          <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
            Zaai: {fmt(species.sow_window)}
          </span>
        )}
        {species.transplant_window.length > 0 && (
          <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
            Plant: {fmt(species.transplant_window)}
          </span>
        )}
        {species.harvest_window.length > 0 && (
          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
            Oogst: {fmt(species.harvest_window)}
          </span>
        )}
        {species.frost_sensitive && (
          <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">
            ❄️ Vorstgevoelig
          </span>
        )}
      </div>

      {species.avg_shortfall_hours > 0 && (
        <p className="text-[9px] text-amber-600 mt-1">
          ~{species.avg_shortfall_hours.toFixed(1)}u/dag tekort in groeiseizoen
        </p>
      )}
    </div>
  );
}
```

### 4. `src/components/GardenMap.tsx` — wire up long-press + inspector

```typescript
import { useSpotInspector } from "../hooks/useSpotInspector";
import { SpotInspectorPanel } from "./SpotInspectorPanel";

// In component:
const { result: inspectorResult, inspect, clear } = useSpotInspector();
const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const [inspectorMode, setInspectorMode] = useState(false);

// On SVG/map touch/click start:
const handleMapPointerDown = (e: React.PointerEvent, svgX: number, svgY: number) => {
  if (!inspectorMode) return;
  longPressTimer.current = setTimeout(() => {
    inspect(svgX, svgY);
  }, 500);
};

const handleMapPointerUp = () => {
  if (longPressTimer.current) clearTimeout(longPressTimer.current);
};

// Toolbar button (add next to existing Zon button):
<button
  onClick={() => { setInspectorMode(m => !m); clear(); }}
  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
    ${inspectorMode 
      ? "bg-emerald-500 text-white" 
      : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
>
  🔍 Inspecteer
</button>

// Cursor hint when in inspector mode:
{inspectorMode && !inspectorResult && (
  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 
                  bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
    Tik op een plek in de tuin
  </div>
)}

// Panel:
{inspectorResult && (
  <SpotInspectorPanel
    result={inspectorResult}
    onClose={clear}
    onPlantHere={(speciesId, x, y) => {
      // Trigger the existing "add plant" flow, pre-filled with species
      // and coordinates. Implementation depends on existing add-plant modal.
      handleAddPlantAtPosition(speciesId, x, y);
    }}
  />
)}
```

### 5. `src/components/GardenMap.tsx` — handleAddPlantAtPosition

When the user taps "+ Planten" from the inspector, open the existing AddPlant modal pre-filled:

```typescript
const handleAddPlantAtPosition = (speciesId: number, x: number, y: number) => {
  // Set pre-fill state for the add plant modal
  setAddPlantPrefill({ speciesId, x, y });
  setShowAddPlantModal(true);
  clear(); // close inspector
};
```

In the AddPlant modal/form, if `prefill.speciesId` is set, fetch the species name and pre-populate the plant name field. The backend's POST /plants already handles `species_id` linkage.

---

## Feature 2: Planting Calendar

### 6. `src/components/PlanningCalendar.tsx` (NEW)

A monthly view accessible from the main nav. Shows all your plants and what's happening this month.

```typescript
const MONTH_NAMES_NL = [
  "Januari","Februari","Maart","April","Mei","Juni",
  "Juli","Augustus","September","Oktober","November","December"
];

export function PlanningCalendar({ plants }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  
  // Group plants by what they're doing this month
  const grouped = useMemo(() => {
    const needs_action: typeof plants = [];
    const growing: typeof plants = [];
    const dormant: typeof plants = [];
    const no_data: typeof plants = [];
    
    for (const plant of plants) {
      const phenology = plant.phenology;
      if (!phenology) { no_data.push(plant); continue; }
      
      const monthData = phenology.months?.find(m => m.month === selectedMonth);
      if (!monthData) { no_data.push(plant); continue; }
      
      const { phase } = monthData;
      const hasSowAction = phenology.sow_window?.includes(selectedMonth);
      const hasTransplantAction = phenology.transplant_window?.includes(selectedMonth);
      const hasHarvestAction = phenology.harvest_window?.includes(selectedMonth);
      
      if (hasSowAction || hasTransplantAction || hasHarvestAction) {
        needs_action.push({ ...plant, _monthData: monthData, _phenology: phenology });
      } else if (["growing","flowering","fruiting","establishing","evergreen"].includes(phase)) {
        growing.push({ ...plant, _monthData: monthData });
      } else {
        dormant.push({ ...plant, _monthData: monthData });
      }
    }
    
    return { needs_action, growing, dormant, no_data };
  }, [plants, selectedMonth]);
  
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Tuinkalender</h1>
      
      {/* Month selector */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {MONTH_NAMES_NL.map((name, i) => {
          const month = i + 1;
          const isNow = month === new Date().getMonth() + 1;
          return (
            <button
              key={month}
              onClick={() => setSelectedMonth(month)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors
                ${selectedMonth === month 
                  ? "bg-green-500 text-white" 
                  : isNow 
                    ? "bg-green-100 text-green-700 font-medium"
                    : "bg-gray-100 text-gray-600"}`}
            >
              {name.slice(0, 3)}
            </button>
          );
        })}
      </div>
      
      <h2 className="text-lg font-semibold text-gray-700 mb-3">
        {MONTH_NAMES_NL[selectedMonth - 1]}
      </h2>

      {/* Action items */}
      {grouped.needs_action.length > 0 && (
        <section className="mb-4">
          <h3 className="text-sm font-semibold text-amber-700 mb-2">
            📋 Actie vereist ({grouped.needs_action.length})
          </h3>
          <div className="space-y-2">
            {grouped.needs_action.map(plant => (
              <CalendarPlantCard key={plant.id} plant={plant} month={selectedMonth} />
            ))}
          </div>
        </section>
      )}

      {/* Actively growing */}
      {grouped.growing.length > 0 && (
        <section className="mb-4">
          <h3 className="text-sm font-semibold text-green-700 mb-2">
            🌱 Groeit actief ({grouped.growing.length})
          </h3>
          <div className="space-y-1">
            {grouped.growing.map(plant => (
              <CalendarPlantCard key={plant.id} plant={plant} month={selectedMonth} compact />
            ))}
          </div>
        </section>
      )}

      {/* Dormant */}
      {grouped.dormant.length > 0 && (
        <section className="mb-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            💤 Rustperiode ({grouped.dormant.length})
          </h3>
          <div className="flex flex-wrap gap-1">
            {grouped.dormant.map(plant => (
              <span key={plant.id} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                {plant.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CalendarPlantCard({ plant, month, compact = false }) {
  const phenology = plant._phenology ?? plant.phenology;
  const monthData = plant._monthData;
  const monthNames = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  
  const hasSow = phenology?.sow_window?.includes(month);
  const hasTransplant = phenology?.transplant_window?.includes(month);
  const hasHarvest = phenology?.harvest_window?.includes(month);
  
  if (compact) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-sm text-gray-700 flex-1">{plant.name}</span>
        <span className="text-xs text-gray-400">{monthData?.phase_label_nl}</span>
      </div>
    );
  }
  
  return (
    <div className="border border-amber-100 bg-amber-50 rounded-lg p-3">
      <p className="font-medium text-gray-800 text-sm">{plant.name}</p>
      <div className="flex gap-1.5 mt-1.5 flex-wrap">
        {hasSow && (
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
            🌱 Zaai nu
          </span>
        )}
        {hasTransplant && (
          <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">
            🪴 Plant buiten
          </span>
        )}
        {hasHarvest && (
          <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded-full">
            🌾 Oogstperiode
          </span>
        )}
      </div>
      {monthData?.actions_nl?.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {monthData.actions_nl.map((action, i) => (
            <li key={i} className="text-xs text-gray-600">→ {action}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### 7. Add Calendar to navigation

In your main nav/tab bar, add a Calendar tab:

```typescript
// In App.tsx or navigation component:
<NavTab icon="📅" label="Kalender" view="calendar" />

// In the view router:
{currentView === "calendar" && (
  <PlanningCalendar plants={plants} />
)}
```

---

## Verification Checklist

After implementation:

1. **Inspector mode** — tap "🔍 Inspecteer" button, then tap a sunny spot → panel shows sun bars + suitable plants
2. **Shady corner** (under the large tree) → fewer or no suitable species in "Geschikt", more in "Marginaal"
3. **"+ Planten" button** in inspector → opens add plant modal pre-filled with position
4. **Calendar — April** → bruine boon shows under "Actie vereist" with "🌱 Zaai nu" badge
5. **Calendar — December** → most plants in "Rustperiode", evergreen plants in "Groeit actief"
6. **Calendar — July** → harvest plants (bruine boon) show "🌾 Oogstperiode"

---

## Session Starter Prompt for Claude Code

```
I'm working on the Groei garden planning app (React + TypeScript + FastAPI).

Please implement PLAN-spot-inspector.md from the project files.

Key steps:
1. Create backend/routers/spots.py with the POST /spots/suitability endpoint
2. Register the spots router in main.py
3. Create src/hooks/useSpotInspector.ts
4. Create src/components/SpotInspectorPanel.tsx
5. Wire up the inspector mode in GardenMap.tsx (toggle button + long-press/tap handler)
6. Create src/components/PlanningCalendar.tsx
7. Add a Calendar tab/view to the main navigation

Important context:
- Plant phenology data is already in the DB (previous two plans implemented)
- Sun hours per position per month are already computed in the frontend heatmap logic — 
  reuse getSunHoursAtPosition(x, y, month) for the spot inspector
- The inspector posts all 12 months of sun data to the backend for matching
- All UI text in Dutch
- Keep the existing map, heatmap, and plant marker behaviour unchanged

After implementing, verify:
- Tapping "Inspecteer" then a sunny spot shows a ranked plant list
- April calendar shows bruine boon under "Actie vereist" with zaai/uitplant actions
- December calendar shows most plants in "Rustperiode"
```

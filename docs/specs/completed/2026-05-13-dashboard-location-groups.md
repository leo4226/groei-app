# Dashboard: Location-grouped task columns

## Summary

Add collapsible Buiten/Binnen groups inside the Water and Aandacht columns of the "Vandaag" section on the Home page. Reduces visual noise when many tasks are due (e.g., 30+ water tasks) by letting users collapse groups they don't need.

## Motivation

After backfilling care schedules, the Home page shows 30+ "due today" tasks in a flat list. The two-column Water/Aandacht grid is correct but the columns are too long. Grouping by location (Buiten/Binnen) with collapsible headers keeps the design clean without losing information.

## Design

### `TodayGrid` — refactored

Each column (Water, Aandacht) now contains two `LocationGroup` sub-components instead of flat-mapped task rows.

```
┌─ Water ─────────────────────┬─ Aandacht ──────────────────┐
│                             │                             │
│ ▼ 🌿 Buiten           (22) │ ▼ 🌿 Buiten            (1)  │
│   Framboos     water Tuin  │   Avocadoboom  bemesten     │
│   Bamboo       water Tuin  │                             │
│   Laurier      water Tuin  │ ▶ 🏠 Binnen            (0)  │
│   + nog 19 buiten          │   Niets — alles op schema.  │
│                             │                             │
│ ▼ 🏠 Binnen           (8)  │                             │
│   Monstera     water Huis  │                             │
│   + nog 7 binnen           │                             │
└─────────────────────────────┴─────────────────────────────┘
```

### New component: `LocationGroup`

```typescript
function LocationGroup({
  label,      // "Buiten" | "Binnen"
  icon,       // "🌿" | "🏠"
  tasks,      // CareTask[]
  tone,       // "overdue" | "due" | "upcoming"
}: { ... })
```

- Header row: icon + label + count + chevron
- Click toggles expand/collapse via local `useState`
- Expanded by default when `tasks.length > 0`
- Collapsed by default when `tasks.length === 0`
- Empty placeholder: "Niets — alles op schema." (italic, muted)
- Reuses `TodayTaskRow` for individual task rows

### Location classification

Tasks are grouped by the `location` field returned from the API:
- `"Tuin"` → Buiten
- `"Huis"` → Binnen
- `null` → determined by plant's map type (outdoor → Buiten, indoor → Binnen)
- Both `null` → "Buiten" (default)

### Backend change

Add `m.map_type` to the dashboard task query so the frontend can classify plants that lack a location:

```sql
-- Added to existing SELECT in /dashboard and /dashboard/v2:
, m.map_type
-- Added to existing JOIN:
LEFT JOIN maps m ON p.map_id = m.id
```

`map_type` is added to the `CareTask` Pydantic model and TypeScript type.

### Behavior matrix

| State | Behavior |
|---|---|
| Group has tasks | Expanded, shows all task rows |
| Group empty | Collapsed, shows placeholder |
| Column has 0 tasks | Shows existing `EmptyCol` |
| All columns empty | Shows existing `CalmEmptyState` |

### What does NOT change

- Two-column grid layout
- Column headers (Water / Aandacht with pips and counts)
- `TodayTaskRow` component
- "Gedaan" button, halo colors, overdue/due badges
- `StatusBanner` KPI cards
- Dashboard header
- Responsive breakpoints

## Scope

- [ ] Add `map_type` to `CareTask` in backend models and queries
- [ ] Add `map_type` to `CareTask` TypeScript type
- [ ] Create `LocationGroup` component in `Dashboard.tsx`
- [ ] Refactor `TodayGrid` to use `LocationGroup` per column
- [ ] Verify empty states (no tasks, empty group, all empty)
- [ ] Test collapse/expand interaction

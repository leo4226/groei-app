# Plant Detail Page — Editorial Redesign

**Date:** 2026-05-13  
**Spec:** `docs/specs/in-progress/2026-05-13-plant-detail-redesign-design.md`

## Tasks

### 1. Section component — add font-mono (PlantDetail.tsx:15)

Change:
```tsx
<p className="text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">{title}</p>
```
To:
```tsx
<p className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">{title}</p>
```

### 2. Identity card — replace pill layout with four-line editorial hierarchy (PlantDetail.tsx:204-238)

Remove the entire `<div className="flex flex-wrap gap-2 mt-3">` pills block.

Replace the `<div className="flex-1 min-w-0">` name block with:

```tsx
<div className="flex-1 min-w-0">
  {/* Eyebrow */}
  {(plant.location_name || plant.plant_type) && (
    <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1">
      {[plant.location_icon && plant.location_name
          ? `${plant.location_icon} ${plant.location_name}`
          : plant.location_name,
        plant.plant_type,
      ].filter(Boolean).join(' · ')}
    </p>
  )}

  {/* Name */}
  <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight">
    {plant.name}
  </h1>

  {/* Species */}
  {plant.species && (
    <p className="font-heading italic text-sm text-text-muted mt-0.5">{plant.species}</p>
  )}

  {/* Meta line */}
  {(plant.pot_size_cm || plant.acquired_date) && (
    <p className="font-mono text-[10px] text-text-muted mt-1.5">
      {[
        plant.pot_size_cm ? `🪴 ${plant.pot_size_cm} cm` : null,
        plant.acquired_date
          ? `📅 ${new Date(plant.acquired_date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`
          : null,
      ].filter(Boolean).join(' · ')}
    </p>
  )}
</div>
```

Notes field stays below this block, unchanged.

### 3. PlantCareInfo — restyle header (PlantCareInfo.tsx:58-71)

Change outer wrapper:
```tsx
// Before
<div className="mt-4 rounded-xl bg-bg overflow-hidden">

// After
<div className="mt-4">
```

Change internal header:
```tsx
// Before
<div className="px-4 py-3 border-b border-border flex items-center justify-between">
  <span className="text-sm font-semibold text-text">🌱 Verzorgingsinfo</span>
  ...
</div>

// After
<div className="flex items-center justify-between mb-3">
  <p className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted">
    Verzorgingsinfo
  </p>
  ...
</div>
```

Wrap content area in a card:
```tsx
// Before
<div className="px-4 py-3 space-y-2.5">

// After
<div className="card px-4 py-3 space-y-2.5">
```

## Verify

- Plant with all fields: eyebrow shows location + type, meta line shows pot + date
- Plant with missing fields: eyebrow/meta lines are omitted cleanly (no orphaned `·`)
- PlantCareInfo expand/collapse still works
- Section headers (`JAARKALENDER`, `VERZORGING`, etc.) render in monospace

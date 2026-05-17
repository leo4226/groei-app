# Plan: House-editor slimme wandrendering

**Datum:** 2026-05-16
**Status:** Plan (klaar voor implementatie)

## Goal

Laat de House-editor werken zoals de Garden-editor, maar met slimme wandrendering:

1. Kamers (rooms) aan elkaar snappen + aan structuren
2. Buitenmuren dik (30cm), gedeelde binnenmuren dun (15cm) — auto-detect
3. Deuren & ramen plaatsen die gaten in de muren maken
4. Gebruik `RoomWallRenderer.tsx` (bestaat, ongebruikt) i.p.v. `EditorZoneShape.tsx`

---

## Context

De editor is **al unified** — `EditorCanvas.tsx` rendert alle zones via `EditorZoneShape` en gebruikt dezelfde snapping voor garden & house. Wat mist:

- `EditorZoneShape.tsx` tekent rooms/structures met uniforme dikke rand (`wallPx = WALL_THICKNESS_EXTERIOR_CM`), ongeacht of het een binnen- of buitenmuur is
- `RoomWallRenderer.tsx` (455 regels, **dead code**) doet ALLES wat nodig is:
  - Exterieur vs interieur muurdikte
  - Randonderdrukking bij gedeelde muren (structure-flush detectie)
  - deur/raam gaten in muren met propere segment-splitsing
  - Structuur erft deur/raam gaten van aangrenzende kamers
  - Labels + afmetingen dynamisch
- `isInsideStructure()` in `useEditorState.ts` werkt **alleen bij ADD_ZONE** — niet bij herpositioneren via UPDATE_ZONE

---

## Proposed approach

### Fase 1: `RoomWallRenderer` inschakelen in `EditorCanvas`

**Bestand:** `EditorCanvas.tsx` (lijn 500-569)

De `zones.map()` in de SVG loop vervangen door een conditie:

```tsx
{zones.map((zone) => {
  const isIndoorRoomOrStruct = mapType === 'indoor' && (zone.type === 'room' || zone.type === 'structure')
  if (isIndoorRoomOrStruct) {
    return <RoomWallRenderer ... />
  }
  return <EditorZoneShape ... />
})}
```

**Nieuwe prop nodig:** `mapType: 'outdoor' | 'indoor'` op `EditorCanvas` — doorgeven vanuit `LayoutEditorPage.tsx` via de `canvas_data.mapType` of een nieuwe prop.

### Fase 2: `RoomWallRenderer` aanpassen voor editor integratie

**Bestand:** `RoomWallRenderer.tsx`

Deze component is al grotendeels compleet, maar mist 2 dingen voor de editor:

1. **`onLabelUpdate` prop** — zodat de gebruiker een label kan typen via inline editing (of via properties panel — die route werkt al via `ZonePropertiesPanel`)
   - Voor nu is de properties-panel route voldoende, `RoomWallRenderer` toont alleen read-only labels

2. **EditorResizeOverlay compatibiliteit** — het resize overlay werkt op basis van `selectedZone` positie/afmetingen, dat verandert niet, dus die blijft werken

**Geen wijzigingen nodig aan RoomWallRenderer** — het accepteert al dezelfde callbacks als EditorZoneShape.

### Fase 3: Auto-detect wallThickness bij verplaatsing

**Bestand:** `useEditorState.ts`

In de `UPDATE_ZONE` case, als `action.updates` een `x` of `y` wijziging bevat **en** de zone is van type `room`, herbereken dan `wallThickness`:

```ts
case 'UPDATE_ZONE': {
  const zone = state.zones.find(z => z.id === action.id)
  const updates = { ...action.updates }
  if (zone && zone.type === 'room' && ('x' in action.updates || 'y' in action.updates)) {
    const movedZone = { ...zone, ...updates }
    updates.wallThickness = isInsideStructure(movedZone, state.zones)
      ? 'interior'
      : 'exterior'
  }
  return {
    ...state,
    zones: state.zones.map(z => z.id === action.id ? { ...z, ...updates } : z),
    isDirty: true,
  }
}
```

### Fase 4: Snapping optimalisatie voor indoor

**Bestand:** `EditorCanvas.tsx`

De snapping in `getSnapTargets` gebruikt al structuur-inner-faces als snap targets (lijn 56-60). Voor rooms voegen we ook de **binnenmuur-randen** van `room` zones toe, zodat kamers tegen elkaars binnenmuur snappen in plaats van buitenrand:

```ts
// In getSnapTargets — ook voor room zones inner wall faces toevoegen
if (z.type === 'room') {
  const t = wallThicknessPx(z, scalePxPerM)
  xTargets.push(z.x + t, z.x + z.width - t)
  yTargets.push(z.y + t, z.y + z.height - t)
}
```

Dit zorgt dat wanneer je een kamer naast een andere sleept, de binnenmuren tegen elkaar aan komen in plaats van overlappen met de buitenmuur.

### Fase 5: Verwijderen van dode code optioneel

- `import EditorZoneShape from './EditorZoneShape'` blijft nodig voor garden zones
- `RoomWallRenderer.tsx` blijft gewoon bestaan (wordt nu wel geïmporteerd)

---

## Te wijzigen bestanden

| Bestand | Wijziging |
|---|---|
| `frontend/src/components/editor/EditorCanvas.tsx` | Import `RoomWallRenderer`, conditioneel renderen o.b.v. `mapType` & zone type, snap targets uitbreiden voor rooms, `mapType` prop toevoegen+doorgeven |
| `frontend/src/hooks/useEditorState.ts` | `UPDATE_ZONE` case: herbereken `wallThickness` bij positie-wijziging van rooms |
| `frontend/src/pages/LayoutEditorPage.tsx` | `mapType` doorgeven aan `EditorCanvas` (uit state of canvas_data) |

---

## Validatie

1. **Open een indoor map** → schakel naar Huis modus in LegendPanel
2. **Teken een structuur** (buitenmuur/omtrek) → dikke muur (30cm)
3. **Teken een kamer erin** → wordt automatisch `interior` (15cm, dunne muur)
4. **Sleep de kamer naar een hoek** → snap aan structuur binnenrand, muur blijft `interior`
5. **Teken een kamer buiten de structuur** → wordt `exterior` (30cm)
6. **Sleep een exterior kamer tegen een andere** → binnenmuren snappen aan elkaar (geen overlap)
7. **Plaats een deur in een muur** → gat verschijnt, deur-icoon getekend
8. **Plaats een raam** → gat + raam-icoon
9. **Sleep deur/raam** langs de muur → positie update
10. **Teken een kamer met corner-cut** → hoek wordt netjes afgesneden, muren geüpdatet
11. **Schakel terug naar Garden modus** → alles werkt nog hetzelfde

---

## Risico's & open vragen

- **`mapType` in EditorCanvas** — op dit moment heeft EditorCanvas geen `mapType` prop. `mapType` zit in `useEditorState`. Gwoon doorgeven als prop vanaf `LayoutEditorPage`.
- **`RoomWallRenderer` accepteert `onUpdate` niet** — maar label/dimensies worden gezet via `ZonePropertiesPanel`, dus dat is oké.
- **Preview mode** — `RoomWallRenderer` checkt `isSelected` voor selection border; preview mode gebruikt `selectedWallElementId = null`, dat werkt.
- **Resize triggers UPDATE_ZONE** — als je een room resize en de muur wordt daardoor interior/exterior, werkt fase 3 ook (x/y/w/h veranderen).

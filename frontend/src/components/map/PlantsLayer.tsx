import { useMemo } from 'react'
import type { MapPlant } from '../../types'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import PlantMarker, { PLANT_LABEL_FONT_SIZE } from './PlantMarker'
import { canStartPlantDrag, resolveDisplayedDragPosition } from './plantDragPermissions'
import { useT } from '../../context/LanguageContext'
import { plantDisplayName } from '../../utils/plantDisplayName'
import { placeLabels, LABEL_BELOW_OFFSET, LABEL_ABOVE_OFFSET, type LabelCandidate } from '../../utils/labelDeclutter'
import { topLevelPlantIconRadius } from './plantMarkerGeometry'

/** Label display mode (#454). 'off': no persistent labels (selected plant still
 *  labels on tap). 'smart' (default): #451 priority + #453 zoom gate — only
 *  meaningful names, more revealed as you zoom in. 'all': every label,
 *  decluttered, with no zoom priority gate (but still fixed-screen-size text). */
export type LabelMode = 'off' | 'smart' | 'all'

interface Props {
  plants: MapPlant[]
  mapType: 'outdoor' | 'indoor'
  dragPositions: Record<string, { x: number; y: number }>
  draggingKey: string | null
  selectedId: string | null
  moveMode?: boolean
  movePlantId?: number | null
  labelMode?: LabelMode
  showWarnings?: boolean
  /** Current map zoom — drives semantic zoom (fixed-screen-size text + a
   *  priority gate that reveals more names as you zoom in). */
  zoom?: number
  onPointerDown: (e: React.PointerEvent, plant: MapPlant) => void
  heatmapCells?: HeatmapCell[]
}

// Rough average glyph width as a fraction of font size for a 500-weight sans.
const AVG_CHAR_WIDTH_RATIO = 0.55

// Below this zoom only priority ≤ 1 labels (selected + care, from #451) show —
// a calm overview. At/above it, everything else is allowed to compete for space.
const LABEL_DETAIL_ZOOM = 1.5

export default function PlantsLayer({ plants, mapType, dragPositions, draggingKey, selectedId, moveMode = false, movePlantId = null, labelMode = 'smart', showWarnings = true, zoom = 1, onPointerDown, heatmapCells }: Props) {
  const t = useT()

  // 'off' hides persistent labels entirely (selected plant still labels on tap);
  // 'smart' and 'all' both show labels — they differ only in the priority gate.
  const showLabels = labelMode !== 'off'

  // Semantic zoom: text is held at a roughly constant on-screen size by
  // shrinking its SVG-unit font as you zoom in (the viewBox shrinks by `zoom`,
  // so `/zoom` cancels the magnification). Offsets scale the same way so the
  // label keeps a constant screen gap from its icon. The declutter boxes below
  // use these exact same values, so collision geometry matches what's drawn.
  const effFont = PLANT_LABEL_FONT_SIZE / zoom
  const effBelowOffset = LABEL_BELOW_OFFSET / zoom
  const effAboveOffset = LABEL_ABOVE_OFFSET / zoom

  // When labels are on, decide which ones render and whether they sit below or
  // above their plant, so neighbours don't overlap into unreadable mush. The
  // selected plant is forced (a tap always reveals a name). When labels are
  // off, this stays empty and only the selected plant's contextual label shows.
  const labelPlacements = useMemo(() => {
    if (!showLabels) return new Map<number, 'below' | 'above'>()
    // Priority gate (mode-dependent): 'all' shows every label (no gate), so all
    // compete for space; 'smart' gates by zoom — zoomed out shows only meaningful
    // labels, zoom in reveals the rest. Because effective boxes also shrink with
    // zoom, placeLabels then naturally fits more of the allowed ones.
    const maxPriority = labelMode === 'all' ? Infinity : (zoom < LABEL_DETAIL_ZOOM ? 1 : Infinity)
    const candidates: LabelCandidate[] = []
    for (const plant of plants) {
      const pos = resolveDisplayedDragPosition(
        `plant-${plant.id}`, dragPositions, { x: plant.map_x, y: plant.map_y },
      )
      const iconR = topLevelPlantIconRadius(plant)
      const name = plantDisplayName(plant, t.locale)
      const isSel = selectedId === `plant-${plant.id}`
      // Priority so the labels that survive a crowded map are the useful ones:
      // selected plant first, then anything needing care, then everything else.
      // (No flowering/phenology tier — MapPlant doesn't expose a cheap "is
      // flowering now" field; phenology.months[].phase is a loose string that
      // would need a current-month lookup, so it's skipped rather than guessed.)
      const needsCare = Boolean(plant.top_warning) || Boolean(plant.warnings?.length)
      const priority = isSel ? 0 : needsCare ? 1 : 2
      if (priority > maxPriority) continue
      candidates.push({
        id: plant.id,
        cx: pos.x,
        centerY: pos.y,
        iconR,
        width: Math.max(name.length * effFont * AVG_CHAR_WIDTH_RATIO, effFont * 2),
        priority,
        forced: isSel,
      })
    }
    // Tight gap: only drop a label when neither below nor above is free.
    return placeLabels(candidates, { font: effFont, gap: 1, belowOffset: effBelowOffset, aboveOffset: effAboveOffset })
  }, [plants, dragPositions, selectedId, labelMode, showLabels, zoom, effFont, effBelowOffset, effAboveOffset, t.locale])

  return (
    <g>
      {plants.map((plant) => {
        const key = `plant-${plant.id}`
        const pos = resolveDisplayedDragPosition(key, dragPositions, { x: plant.map_x, y: plant.map_y })
        const canDrag = canStartPlantDrag(plant, { moveMode, movePlantId })
        // Contextual labels: when global labels are off, still show the name of
        // the selected plant so tapping reveals it without crowding the canvas.
        const isSelected = selectedId === key
        return (
          <PlantMarker
            key={plant.id}
            plant={plant}
            mapType={mapType}
            x={pos.x}
            y={pos.y}
            isDragging={draggingKey === key}
            canDrag={canDrag}
            isSelected={isSelected}
            showLabel={labelPlacements.has(plant.id) || isSelected}
            labelPlacement={labelPlacements.get(plant.id) ?? 'below'}
            labelFontSize={effFont}
            showWarnings={showWarnings}
            displayName={plantDisplayName(plant, t.locale)}
            onPointerDown={onPointerDown}
            heatmapCells={heatmapCells}
          />
        )
      })}
    </g>
  )
}

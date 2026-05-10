import { useRef, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { MapDetail, MapPlant, MapObject, GroundZone, CanvasData } from '../../types'
import type { SunPosition } from '../../utils/sunCalc'
import type { ShadowPolygon } from '../../utils/shadowGeometry'
import { updatePlantPosition, updatePlantContainer, updatePlantDisplayRadius, updatePlantGroundZone, updateObjectPosition } from '../../api/client'
import { screenToSVG, resolveDropTarget } from '../../utils/svgCoords'
import type { DropTarget } from '../../utils/svgCoords'
import { useMapSelection } from '../../hooks/useMapSelection'
import { useContainerSize } from '../../hooks/useContainerSize'
import { useIsMobile } from '../../hooks/useIsMobile'
import { isInsideGarden } from '../../utils/gardenFromCanvas'
import ObjectsLayer from './ObjectsLayer'
import PlantsLayer from './PlantsLayer'
import PlantResizeOverlay from './PlantResizeOverlay'
import ShadowLayer from './ShadowLayer'
import SunDirectionArrow from './SunDirectionArrow'
import SunHeatmap from '../sun/SunHeatmap'
import PlantSuitabilityLayer from '../sun/PlantSuitabilityLayer'
import FixedPlantsLayer from './FixedPlantsLayer'
import GardenCompass from './GardenCompass'
import CanvasZonesLayer from './CanvasZonesLayer'
import { MapRotationContext } from '../../context/MapRotationContext'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { PLANT_SUN_PROFILES, type PlantSunProfile } from '../../utils/plantSunRequirements'
import type { FixedPlant } from '../../constants/fixedPlants'
import type { HeatmapLayer } from '../../utils/lightQuality'

interface Props {
  map: MapDetail
  plants: MapPlant[]
  objects: MapObject[]
  onPlantTap?: (plant: MapPlant) => void
  onObjectTap?: (object: MapObject) => void
  onMapTap?: () => void
  onPositionUpdate?: () => void
  onOpenDetails?: (type: 'plant' | 'object', id: number) => void
  onRemoveItem?: (type: 'plant' | 'object', id: number) => void
  onFixedPlantTap?: (plant: FixedPlant) => void
  showLabels?: boolean
  sunModeActive?: boolean
  shadows?: ShadowPolygon[]
  sunPosition?: SunPosition | null
  // Heatmap
  heatmapCells?: HeatmapCell[]
  heatmapCalculating?: boolean
  heatmapLayer?: HeatmapLayer
  heatmapProfile?: PlantSunProfile | null
  onHeatmapCellTap?: (cell: HeatmapCell) => void
  /** Arbitrary SVG content rendered on top of everything (used by ?debug=svf). */
  debugOverlay?: ReactNode
  // Dynamic garden geometry
  gardenPerimeter?: [number, number][]
  gardenBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  gardenViewBox?: string
}

type DragItem = { type: 'plant'; id: number } | { type: 'container'; id: number }

export default function MapView({ map, plants, objects, onPlantTap, onObjectTap, onMapTap, onPositionUpdate, onOpenDetails, onRemoveItem, onFixedPlantTap, showLabels = true, sunModeActive, shadows, sunPosition, heatmapCells, heatmapCalculating, heatmapLayer = 'sun_hours', heatmapProfile, onHeatmapCellTap, debugOverlay, gardenPerimeter, gardenBounds, gardenViewBox }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const didDrag = useRef(false)
  const lastTapRef = useRef<{ id: string; time: number } | null>(null)
  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { selection, dispatch } = useMapSelection()
  const { ref: containerRef, width: cw, height: ch } = useContainerSize()
  const isMobile = useIsMobile()

  // Remove-button state: which plant is showing the floating remove button
  const [removeTarget, setRemoveTarget] = useState<{ type: 'plant'; id: number; x: number; y: number } | null>(null)

  // Plant resize state — use a ref to mirror the state so handlePointerUp avoids stale closures
  const [plantResizeRadius, setPlantResizeRadius] = useState<number | null>(null)
  const plantResizeRadiusRef = useRef<number | null>(null)
  const plantResizeRef = useRef<{ plantId: number; initialRadius: number; initialPt: { x: number; y: number }; handle: string } | null>(null)

  const setPlantRadius = (r: number | null) => {
    setPlantResizeRadius(r)
    plantResizeRadiusRef.current = r
  }

  // --- Parse canvas_data for live zone rendering ---
  const canvasData = useMemo<CanvasData | null>(() => {
    if (!map.canvas_data) return null
    try { return JSON.parse(map.canvas_data) as CanvasData } catch { return null }
  }, [map.canvas_data])
  const isHouseMap = !!(canvasData && map.map_type === 'indoor')

  // Derive plantable ground zones from canvas_data soil zones
  const soilGroundZones = useMemo((): GroundZone[] => {
    if (!canvasData) return []
    return canvasData.zones
      .filter(z => z.type === 'soil')
      .map(z => ({
        id: z.id,
        map_id: map.id,
        name: z.label || 'Grond',
        zone_type: 'soil' as const,
        polygon: JSON.stringify([
          [z.x, z.y],
          [z.x + z.width, z.y],
          [z.x + z.width, z.y + z.height],
          [z.x, z.y + z.height],
        ]),
        soil_note: null,
      }))
  }, [canvasData, map.id])

  const dragKey = dragging ? `${dragging.type}-${dragging.id}` : null

  // Derive the profile of the plant being dragged (for the suitability overlay)
  const draggingPlant = dragging?.type === 'plant'
    ? plants.find(p => p.id === dragging.id) ?? null
    : null
  const draggingProfile = draggingPlant?.sun_requirement
    ? PLANT_SUN_PROFILES.find(p => p.id === draggingPlant.sun_requirement) ?? null
    : null

  // Derived from dropTarget for ObjectsLayer (backward-compat prop)
  const hoveredContainerId = dropTarget?.type === 'container' ? dropTarget.target.id : null
  const hoveredZoneId = dropTarget?.type === 'zone' ? dropTarget.target.id : null
  const hoveredZoneName = dropTarget?.type === 'zone' ? dropTarget.target.name : null

  // --- Item tap: single-click opens sheet, double-click selects (plants only, objects are static) ---
  const handleItemSelect = useCallback((itemType: 'plant' | 'object', id: number) => {
    // Objects are static — single tap always opens the sheet immediately
    if (itemType === 'object') {
      const obj = objects.find((o) => o.id === id)
      if (obj) onObjectTap?.(obj)
      onOpenDetails?.('object', id)
      return
    }

    const key = `${itemType}-${id}`
    const now = Date.now()
    const last = lastTapRef.current

    const openDetails = () => {
      lastTapRef.current = null
      pendingTapRef.current = null
      onOpenDetails?.(itemType, id)
      const plant = plants.find((p) => p.id === id)
      if (plant) onPlantTap?.(plant)
    }

    // Double-click detected
    if (last && last.id === key && now - last.time < 300) {
      if (pendingTapRef.current) {
        clearTimeout(pendingTapRef.current)
        pendingTapRef.current = null
      }
      lastTapRef.current = null

      if (selection.selectedId === key) {
        const plant = plants.find((p) => p.id === id)
        const pos = plant ? { x: plant.map_x, y: plant.map_y } : { x: 0, y: 0 }
        setRemoveTarget({ type: 'plant', id, x: pos.x, y: pos.y })
        return
      }

      setRemoveTarget(null)
      dispatch({ type: 'SELECT', id: key, itemType })
      return
    }

    lastTapRef.current = { id: key, time: now }
    setRemoveTarget(null)
    if (pendingTapRef.current) clearTimeout(pendingTapRef.current)
    pendingTapRef.current = setTimeout(openDetails, 280)
  }, [selection.selectedId, dispatch, onOpenDetails, onPlantTap, onObjectTap, plants, objects])

  // --- Drag handlers ---
  const handlePlantPointerDown = useCallback((e: React.PointerEvent, plant: MapPlant) => {
    if (selection.mode === 'resizing') return
    if (plant.is_locked) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const key = `plant-${plant.id}`
    setDragging({ type: 'plant', id: plant.id })
    didDrag.current = false
    setDragPositions((prev) => ({ ...prev, [key]: { x: plant.map_x, y: plant.map_y } }))
  }, [selection.mode])

  const handleContainerPointerDown = useCallback((e: React.PointerEvent, obj: MapObject) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const key = `container-${obj.id}`
    setDragging({ type: 'container', id: obj.id })
    didDrag.current = false
    setDragPositions((prev) => ({ ...prev, [key]: { x: obj.map_x ?? 0, y: obj.map_y ?? 0 } }))
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!svgRef.current) return

    // Resize takes priority (plants only)
    if (selection.mode === 'resizing') {
      const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
      if (!pt) return

      // Plant resize
      if (plantResizeRef.current) {
        const prs = plantResizeRef.current
        const dx = pt.x - prs.initialPt.x
        const dy = pt.y - prs.initialPt.y
        let delta = 0
        if (prs.handle === 'e') delta = dx / 0.46
        else if (prs.handle === 'w') delta = -dx / 0.46
        else if (prs.handle === 's') delta = dy / 0.46
        else if (prs.handle === 'n') delta = -dy / 0.46
        setPlantRadius(Math.max(10, Math.min(400, Math.round(prs.initialRadius + delta))))
        return
      }

      // Object resize disabled — objects are static
      return
    }

    // Drag logic
    if (!dragging) return
    const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
    if (!pt) return
    didDrag.current = true
    const key = `${dragging.type}-${dragging.id}`
    const gb = gardenBounds
    const clampedX = isHouseMap && canvasData
      ? Math.max(0, Math.min(canvasData.canvas_w, pt.x))
      : gb ? Math.max(gb.minX, Math.min(gb.maxX, pt.x))
      : Math.max(0, Math.min(680, pt.x))
    const clampedY = isHouseMap && canvasData
      ? Math.max(0, Math.min(canvasData.canvas_h, pt.y))
      : gb ? Math.max(gb.minY, Math.min(gb.maxY, pt.y))
      : Math.max(0, Math.min(680, pt.y))
    setDragPositions((prev) => ({ ...prev, [key]: { x: clampedX, y: clampedY } }))

    if (dragging.type === 'plant') {
      setDropTarget(resolveDropTarget(pt.x, pt.y, objects, soilGroundZones))
    }
  }, [dragging, selection.mode, dragPositions, objects, soilGroundZones])

  const handlePointerUp = useCallback(async () => {
    // End resize (plants only)
    if (selection.mode === 'resizing') {
      if (plantResizeRef.current && plantResizeRadiusRef.current !== null) {
        const plantId = plantResizeRef.current.plantId
        const finalRadius = plantResizeRadiusRef.current
        plantResizeRef.current = null
        dispatch({ type: 'END_RESIZE' })
        setPlantRadius(null)
        try {
          await updatePlantDisplayRadius(plantId, finalRadius)
          onPositionUpdate?.()
        } catch (err) {
          console.error('Failed to update plant size:', err)
        }
      }
      return
    }

    // End drag (plants only)
    if (!dragging) return
    const key = `${dragging.type}-${dragging.id}`
    const pos = dragPositions[key]
    if (pos && didDrag.current) {
      try {
        if (dragging.type === 'plant') {
          if (dropTarget?.type === 'container') {
            await updatePlantContainer(dragging.id, dropTarget.target.id)
          } else if (dropTarget?.type === 'zone') {
            const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
            await updatePlantGroundZone(dragging.id, dropTarget.target.id, rounded.map_x, rounded.map_y)
          } else {
            const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
            await updatePlantPosition(dragging.id, { map_id: map.id, ...rounded, ground_zone_id: null })
          }
        } else if (dragging.type === 'container') {
          const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
          await updateObjectPosition(dragging.id, rounded)
        }
        onPositionUpdate?.()
      } catch (err) {
        console.error('Failed to update position:', err)
      }
    }
    if (dragging.type === 'container') {
      setDragPositions((prev) => {
        const { [key]: _, ...rest } = prev
        return rest
      })
    }
    setDragging(null)
    setDropTarget(null)
    didDrag.current = false
  }, [dragging, dragPositions, map.id, dropTarget, onPositionUpdate])

  // --- Plant resize handles ---
  const handlePlantResizeDown = useCallback((e: React.PointerEvent, handle: string) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)

    if (!svgRef.current || !selection.selectedId) return
    const plantId = parseInt(selection.selectedId.replace('plant-', ''))
    const plant = plants.find((p) => p.id === plantId)
    if (!plant) return

    const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
    if (!pt) return

    const currentRadius = plant.display_radius_cm ?? 30
    plantResizeRef.current = { plantId, initialRadius: currentRadius, initialPt: pt, handle }
    setPlantRadius(currentRadius)
    dispatch({ type: 'START_RESIZE', handle })
  }, [selection.selectedId, plants, dispatch])

  // --- Background tap: cancel pending single-click, dismiss remove button, deselect ---
  const handleMapClick = useCallback(() => {
    // Cancel any pending single-click-to-open-sheet
    if (pendingTapRef.current) {
      clearTimeout(pendingTapRef.current)
      pendingTapRef.current = null
    }
    lastTapRef.current = null

    if (removeTarget) {
      setRemoveTarget(null)
      return
    }
    if (selection.selectedId) {
      dispatch({ type: 'DESELECT' })
    }
    onMapTap?.()
  }, [selection.selectedId, dispatch, onMapTap, removeTarget])

  // --- Find selected plant for overlay ---
  const selectedPlant = selection.selectedType === 'plant' && selection.selectedId
    ? plants.find((p) => p.id === parseInt(selection.selectedId!.replace('plant-', '')))
    : null

  const selectedPlantPos = selectedPlant
    ? (dragPositions[selection.selectedId!] ?? { x: selectedPlant.map_x, y: selectedPlant.map_y })
    : null

  return (
    <div ref={containerRef} className="relative w-full h-full" onClick={handleMapClick}>
      {!isHouseMap && <GardenCompass bearing={map.bearing ?? 0} />}
      {cw > 0 && ch > 0 && (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: cw,
          height: ch,
          transform: 'translate(-50%, -50%)',
        }}
      >
      {/* Zone name banner — shown during drag over a zone */}
      {hoveredZoneName && dragging?.type === 'plant' && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div className="bg-surface/90 border border-border rounded-full px-3 py-1 text-xs font-semibold text-text shadow-md backdrop-blur-sm whitespace-nowrap">
            Planten in {hoveredZoneName}
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={
          isHouseMap
            ? map.viewbox
            : gardenViewBox || map.viewbox || '0 0 680 680'
        }
        preserveAspectRatio="xMidYMid meet"
        className="absolute"
        style={{
          pointerEvents: 'none',
          top: 0,
          left: 0,
          width:  isMobile ? ch : '100%',
          height: isMobile ? cw : '100%',
          ...(isMobile && {
            transformOrigin: 'top left',
            transform: 'rotate(-90deg) translateX(-100%)',
          }),
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
      <MapRotationContext.Provider value={isMobile ? 90 : 0}>
        {/* Background: static SVG (garden maps) + live canvas zones */}
        {canvasData ? (
          <>
            {!isHouseMap && (() => {
              const [,, w, h] = map.viewbox.split(' ').map(Number)
              return <image href={`/maps/${map.svg_file}`} x="0" y="0" width={w} height={h} />
            })()}
            <CanvasZonesLayer canvasData={canvasData} showBackground={isHouseMap} />
          </>
        ) : (
          (() => {
            const [,, w, h] = map.viewbox.split(' ').map(Number)
            return <image href={`/maps/${map.svg_file}`} x="0" y="0" width={w} height={h} />
          })()
        )}
        <g style={{ pointerEvents: 'all' }}>
          {/* Sun shadow overlay (behind everything interactive) */}
          {sunModeActive && shadows && shadows.length > 0 && (
            <ShadowLayer shadows={shadows} clipPolygon={gardenPerimeter} />
          )}
          {/* Night overlay — sun is below the horizon */}
          {sunModeActive && sunPosition && !sunPosition.isUp && gardenPerimeter && gardenPerimeter.length >= 3 && (
            <polygon
              points={gardenPerimeter.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="rgba(10,15,35,0.72)"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {sunModeActive && sunPosition && sunPosition.isUp && (
            <SunDirectionArrow sunPosition={sunPosition} clipRect={gardenBounds ? { x: gardenBounds.minX, y: gardenBounds.minY, width: gardenBounds.maxX - gardenBounds.minX, height: gardenBounds.maxY - gardenBounds.minY } : undefined} bearing={map.bearing ?? 0} />
          )}

          {/* Heatmap overlay (behind everything interactive) */}
          {heatmapCells && heatmapCells.length > 0 && (
            <SunHeatmap cells={heatmapCells} isCalculating={!!heatmapCalculating} layer={heatmapLayer} onCellTap={onHeatmapCellTap} maskPolygon={gardenPerimeter} bounds={gardenBounds ? { x: gardenBounds.minX, y: gardenBounds.minY, width: gardenBounds.maxX - gardenBounds.minX, height: gardenBounds.maxY - gardenBounds.minY } : undefined} />
          )}
          {heatmapCalculating && !heatmapCells?.length && (
            <SunHeatmap cells={[]} isCalculating={true} layer={heatmapLayer} maskPolygon={gardenPerimeter} bounds={gardenBounds ? { x: gardenBounds.minX, y: gardenBounds.minY, width: gardenBounds.maxX - gardenBounds.minX, height: gardenBounds.maxY - gardenBounds.minY } : undefined} />
          )}
          {heatmapCells && heatmapProfile && (
            <PlantSuitabilityLayer cells={heatmapCells} profile={heatmapProfile} />
          )}
          {/* Drag-time overlay: highlight suitable areas for the plant being dragged */}
          {heatmapCells && draggingProfile && (
            <PlantSuitabilityLayer cells={heatmapCells} profile={draggingProfile} />
          )}

          {/* Fixed plants (e.g. neighbour's tree) — permanent, not draggable */}
          <FixedPlantsLayer onTap={(plant) => onFixedPlantTap?.(plant)} />

          {/* Objects layer behind plants */}
          <ObjectsLayer
            objects={objects}
            hoveredContainerId={hoveredContainerId}
            showLabels={showLabels}
            heatmapCells={heatmapCells}
            onObjectTap={(obj) => handleItemSelect('object', obj.id)}
            onContainerPointerDown={handleContainerPointerDown}
            dragPositions={dragPositions}
          />
          {/* Plants layer on top */}
          <PlantsLayer
            plants={plants}
            dragPositions={dragPositions}
            draggingKey={dragKey}
            selectedId={selection.selectedId}
            showLabels={showLabels}
            onPlantTap={(plant) => handleItemSelect('plant', plant.id)}
            onPointerDown={handlePlantPointerDown}
            heatmapCells={heatmapCells}
          />

          {/* Plant resize overlay */}
          {selectedPlant && selectedPlantPos && (
            <PlantResizeOverlay
              x={selectedPlantPos.x}
              y={selectedPlantPos.y}
              radiusCm={plantResizeRadius ?? selectedPlant.display_radius_cm ?? 30}
              isResizing={selection.mode === 'resizing' && !!plantResizeRef.current}
              activeHandle={plantResizeRef.current ? selection.resizeHandle : null}
              onHandlePointerDown={handlePlantResizeDown}
            />
          )}

          {/* Red outline on remove target + floating Remove button */}
          {removeTarget && (
            <circle
              cx={removeTarget.x} cy={removeTarget.y} r={24}
              fill="none" stroke="#ea0706" strokeWidth={2} strokeDasharray="4 2" opacity={0.7}
            />
          )}
          {removeTarget && (
            <g transform={`translate(${removeTarget.x}, ${removeTarget.y - 28})`}>
              <rect
                x={-32} y={-12} width={64} height={24} rx={12}
                fill="#ea0706" opacity={0.95}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveItem?.(removeTarget.type, removeTarget.id)
                  setRemoveTarget(null)
                }}
              />
              <text
                textAnchor="middle" dominantBaseline="central"
                fill="white" fontSize="10" fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                Remove
              </text>
            </g>
          )}
        </g>

        {/* Debug overlays (e.g. ?debug=svf ray visualisation) */}
        {debugOverlay}

      </MapRotationContext.Provider>
      </svg>
      </div>
      )}
    </div>
  )
}

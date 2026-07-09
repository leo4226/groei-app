import { useRef, useMemo, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { MapDetail, MapPlant, MapObject, GroundZone, CanvasData, SecondaryMarker } from '../../types'
import type { SunPosition } from '../../utils/sunCalc'
import type { ShadowPolygon } from '../../utils/shadowGeometry'
import { screenToSVG } from '../../utils/svgCoords'
import { nearestPlant } from '../../utils/nearestPlant'
import { usePinch } from '@use-gesture/react'
import { useContainerSize } from '../../hooks/useContainerSize'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useLandscapeMobile } from '../../hooks/useLandscapeMobile'
import { useMapInteraction } from '../../hooks/useMapInteraction'
import { resolveDisplayedDragPosition, shouldStartMapPan } from './plantDragPermissions'
import ObjectsLayer from './ObjectsLayer'
import PlantsLayer, { type LabelMode } from './PlantsLayer'
import SecondaryMarkersLayer from './SecondaryMarkersLayer'
import PlantResizeOverlay from './PlantResizeOverlay'
import ShadowLayer from './ShadowLayer'
import SunDirectionArrow from './SunDirectionArrow'
import SunHeatmap from '../sun/SunHeatmap'
import PlantSuitabilityLayer from '../sun/PlantSuitabilityLayer'
import FixedPlantsLayer from './FixedPlantsLayer'
import CanvasZonesLayer from './CanvasZonesLayer'
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
  labelMode?: LabelMode
  showWarnings?: boolean
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
  moveMode?: boolean
  movePlantId?: number | null
  onPlantMoveComplete?: (plantId: number) => void | Promise<void>
  onPlantUpdated?: (plantId: number, patch: Partial<MapPlant>) => void
  /** When set, a map tap reports SVG coords via onPlacementTap (tap-to-place). */
  placingPlantId?: number | null
  onPlacementTap?: (x: number, y: number) => void
  secondaryMarkers?: SecondaryMarker[]
  onSecondaryMarkerTap?: (plantId: number) => void
  // Dynamic garden geometry
  gardenPerimeter?: [number, number][] | null
  gardenBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  gardenViewBox?: string
}

// Nearest-neighbour tap radius (#452): a fixed on-screen touch target, in CSS
// pixels, converted to SVG units at tap time so it feels constant regardless of
// zoom. A tap this close to a plant selects it; a tap farther out deselects.
const TAP_TARGET_PX = 44

export default function MapView({ map, plants, objects, onPlantTap, onObjectTap, onMapTap, onPositionUpdate, onOpenDetails, onRemoveItem, onFixedPlantTap, labelMode = 'smart', showWarnings = true, sunModeActive, shadows, sunPosition, heatmapCells, heatmapCalculating, heatmapLayer = 'sun_hours', heatmapProfile, onHeatmapCellTap, debugOverlay, moveMode = false, movePlantId = null, onPlantMoveComplete, onPlantUpdated, placingPlantId = null, onPlacementTap, secondaryMarkers = [], onSecondaryMarkerTap, gardenPerimeter, gardenBounds, gardenViewBox }: Props) {
  const svgRef = useRef<SVGSVGElement>(null) as React.RefObject<SVGSVGElement>
  // Object labels (containers/pots) follow the same on/off split as plant
  // labels: hidden only in 'off' mode. The smart/all distinction is plant-only.
  const showLabels = labelMode !== 'off'
  const { ref: containerRef, width: cw, height: ch } = useContainerSize()
  const isMobile = useIsMobile()
  const isLandscapeMobile = useLandscapeMobile()

  // Parse canvas_data for live zone rendering
  const canvasData = useMemo<CanvasData | null>(() => {
    if (!map.canvas_data) return null
    try { return JSON.parse(map.canvas_data) as CanvasData } catch { return null }
  }, [map.canvas_data])
  const isHouseMap = !!(canvasData && map.map_type === 'indoor')
  const [zoom, setZoom] = useState(1)
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 4
  // --- Pan + Pinch-zoom state ---
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPinching = useRef(false)

  const baseViewBox = useMemo(() => {
    return isHouseMap ? map.viewbox : gardenViewBox || map.viewbox || '0 0 680 680'
  }, [isHouseMap, map.viewbox, gardenViewBox])

  const baseCenter = useMemo(() => {
    const parts = baseViewBox.trim().split(/\s+/).map(Number)
    if (parts.length !== 4) return { cx: 340, cy: 340, vw: 680, vh: 680 }
    return {
      cx: parts[0] + parts[2] / 2,
      cy: parts[1] + parts[3] / 2,
      vw: parts[2],
      vh: parts[3],
    }
  }, [baseViewBox])

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const panRef = useRef(pan)
  panRef.current = pan

  usePinch(
    ({ origin: [ox, oy], offset: [scale], memo, first, last }) => {
      if (first) isPinching.current = true
      const svg = svgRef.current
      if (!svg) return memo
      const m = first || !memo
        ? (() => {
            const mid = screenToSVG(svg, ox, oy)
            return { startZoom: zoom, startPan: { ...pan }, mx: mid?.x ?? baseCenter.cx, my: mid?.y ?? baseCenter.cy }
          })()
        : memo
      setZoom(+scale.toFixed(3))
      setPan({
        x: (baseCenter.cx - m.mx) * (1 - m.startZoom / scale) + m.startPan.x * (m.startZoom / scale),
        y: (baseCenter.cy - m.my) * (1 - m.startZoom / scale) + m.startPan.y * (m.startZoom / scale),
      })
      if (last) isPinching.current = false
      return m
    },
    {
      // Target the container, NOT svgRef: the <svg> is a pointer-events:none
      // overlay (only its marker children opt back in), so touch events for
      // empty map area never reach it and pinch would silently do nothing.
      // Pan/wheel/tap already live on the container, which has touch-action:none.
      // (The editor keeps target: svgRef because its <svg> IS the event target.)
      target: containerRef,
      eventOptions: { passive: false },
      scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM },
      from: () => [zoom, 0],
    },
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (isPinching.current) return
      e.preventDefault()
      const cz = zoomRef.current
      if (cz <= MIN_ZOOM && e.deltaY > 0) return
      if (cz >= MAX_ZOOM && e.deltaY < 0) return
      const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15
      const newZ = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(cz * delta).toFixed(3)))
      if (newZ === cz) return
      const svg = svgRef.current
      if (svg) {
        const mid = screenToSVG(svg, e.clientX, e.clientY)
        if (mid) {
          const k = newZ / cz
          const cp = panRef.current
          setPan({
            x: (baseCenter.cx - mid.x) * (1 - 1/k) + cp.x / k,
            y: (baseCenter.cy - mid.y) * (1 - 1/k) + cp.y / k,
          })
        }
      }
      setZoom(newZ)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [containerRef.current, baseCenter])

  // --- One-finger / mouse drag-to-pan on the background (#184) ---
  // Plant/object drags never reach these handlers: their pointer-down handlers
  // call stopPropagation() (useMapInteraction), so a pan only starts on the
  // background. A 5px threshold keeps taps (select/deselect) working.
  const panSession = useRef<{ startX: number; startY: number; startPan: { x: number; y: number }; unitsPerPx: number } | null>(null)
  const didPan = useRef(false)
  const baseCenterRef = useRef(baseCenter)
  baseCenterRef.current = baseCenter

  // Document-level move/up listeners (attached for the duration of a pan) so
  // the pan survives the pointer leaving the container — same pattern as the
  // plant-drag code, which avoids setPointerCapture because capture would
  // retarget pointerup/click away from children (heatmap cell taps, markers).
  const onPanDocMove = useCallback((e: PointerEvent) => {
    const s = panSession.current
    if (!s) return
    if (isPinching.current) {
      // Second finger landed — the pinch handler owns pan from here.
      panSession.current = null
      return
    }
    const dxPx = e.clientX - s.startX
    const dyPx = e.clientY - s.startY
    if (!didPan.current && Math.hypot(dxPx, dyPx) < 5) return
    didPan.current = true
    // Clamp so the view center stays within the map bounds — the map can
    // never be flung fully off-screen.
    const maxPanX = baseCenterRef.current.vw / 2
    const maxPanY = baseCenterRef.current.vh / 2
    setPan({
      x: Math.max(-maxPanX, Math.min(maxPanX, s.startPan.x + dxPx * s.unitsPerPx)),
      y: Math.max(-maxPanY, Math.min(maxPanY, s.startPan.y + dyPx * s.unitsPerPx)),
    })
  }, [])

  const onPanDocEnd = useCallback(() => {
    panSession.current = null
    document.removeEventListener('pointermove', onPanDocMove)
    document.removeEventListener('pointerup', onPanDocEnd)
    document.removeEventListener('pointercancel', onPanDocEnd)
  }, [onPanDocMove])

  const handlePanPointerDown = useCallback((e: React.PointerEvent) => {
    if (!shouldStartMapPan({ moveMode, movePlantId })) return
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (isPinching.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const visW = baseCenter.vw / zoomRef.current
    const visH = baseCenter.vh / zoomRef.current
    // px → viewBox-units factor; mirrors the preserveAspectRatio prop on the
    // <svg> below: "meet" (min) normally, landscape-mobile "slice" (max).
    const pick = isLandscapeMobile ? Math.max : Math.min
    const scale = pick(rect.width / visW, rect.height / visH)
    if (!scale || !isFinite(scale)) return
    panSession.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPan: { ...panRef.current },
      unitsPerPx: 1 / scale,
    }
    didPan.current = false
    document.addEventListener('pointermove', onPanDocMove, { passive: true })
    document.addEventListener('pointerup', onPanDocEnd)
    document.addEventListener('pointercancel', onPanDocEnd)
  }, [baseCenter, isLandscapeMobile, svgRef, onPanDocMove, onPanDocEnd, moveMode, movePlantId])

  // Unmount safety: drop listeners if the component dies mid-pan
  useEffect(() => () => {
    document.removeEventListener('pointermove', onPanDocMove)
    document.removeEventListener('pointerup', onPanDocEnd)
    document.removeEventListener('pointercancel', onPanDocEnd)
  }, [onPanDocMove, onPanDocEnd])
  // --- End drag-to-pan ---

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, +(z * 1.25).toFixed(2)))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, +(z / 1.25).toFixed(2)))
  }, [])

  // --- End zoom/pan state ---

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

  const {
    selection,
    dragging,
    dragPositions,
    dragKey,
    hoveredContainerId,
    hoveredZoneName,
    removeTarget,
    setRemoveTarget,
    plantResizeRadius,
    isResizing,
    activeResizeHandle,
    selectedPlant,
    selectedPlantPos,
    handlePlantPointerDown,
    handlePointerMove,
    handlePointerUp,
    handleItemSelect,
    handleMapClick,
    handlePlantResizeDown,
  } = useMapInteraction({
    svgRef,
    plants,
    objects,
    soilGroundZones,
    mapId: map.id,
    isHouseMap,
    canvasData,
    gardenBounds,
    isMobile,
    moveMode,
    movePlantId,
    onPlantMoveComplete,
    onPlantUpdated,
    onPlantTap,
    onObjectTap,
    onOpenDetails,
    onPositionUpdate,
    onRemoveItem,
    onMapTap,
  })

  // A drag-to-pan must not count as a map tap (mouse fires click after a drag;
  // touch usually doesn't, but guard both).
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (didPan.current) {
      didPan.current = false
      return
    }
    // Nearest-neighbour selection (#452): a direct hit on a marker never reaches
    // here (per-marker onClick calls stopPropagation), so this fires only for
    // taps that missed every hit circle. Select the closest plant within a
    // zoom-scaled pick radius so fat-finger taps on a dense phone map still land
    // on something useful; a tap on clearly-empty ground falls through to
    // handleMapClick() and deselects.
    const svg = svgRef.current
    const pt = svg ? screenToSVG(svg, e.clientX, e.clientY) : null
    if (svg && pt) {
      // px → viewBox-units factor, mirroring handlePanPointerDown and the <svg>
      // preserveAspectRatio prop ("meet" = min, landscape-mobile "slice" = max).
      const rect = svg.getBoundingClientRect()
      const visW = baseCenter.vw / zoomRef.current
      const visH = baseCenter.vh / zoomRef.current
      const pick = isLandscapeMobile ? Math.max : Math.min
      const scale = pick(rect.width / visW, rect.height / visH)
      if (scale && isFinite(scale)) {
        const maxDist = TAP_TARGET_PX / scale
        // Locked plants are excluded — they select ONLY via their lock badge, so
        // proximity must not override that. Positions respect an in-flight drag,
        // exactly like PlantsLayer renders them.
        const candidates = plants
          .filter((p) => !p.is_locked)
          .map((p) => {
            const pos = resolveDisplayedDragPosition(`plant-${p.id}`, dragPositions, { x: p.map_x, y: p.map_y })
            return { id: p.id, x: pos.x, y: pos.y }
          })
        // TODO: disambiguation chooser for near-tied plants
        const nearestId = nearestPlant(pt, candidates, maxDist)
        if (nearestId !== null) {
          handleItemSelect('plant', nearestId)
          return
        }
      }
    }
    handleMapClick()
  }, [handleMapClick, handleItemSelect, plants, dragPositions, baseCenter, isLandscapeMobile])

  // Derive the profile of the plant being dragged (for the suitability overlay)
  const draggingPlant = dragging?.type === 'plant'
    ? plants.find(p => p.id === dragging.id) ?? null
    : null
  const draggingProfile = draggingPlant?.sun_requirement
    ? PLANT_SUN_PROFILES.find(p => p.id === draggingPlant.sun_requirement) ?? null
    : null

  function computeZoomViewBox(baseViewBox: string, z: number, px: number, py: number): string {
    if (z === 1 && px === 0 && py === 0) return baseViewBox
    const parts = baseViewBox.trim().split(/\s+/).map(Number)
    if (parts.length !== 4) return baseViewBox
    const [vx, vy, vw, vh] = parts
    const cx = vx + vw / 2
    const cy = vy + vh / 2
    const nw = vw / z
    const nh = vh / z
    const ocx = cx - px
    const ocy = cy - py
    return `${(ocx - nw / 2).toFixed(2)} ${(ocy - nh / 2).toFixed(2)} ${nw.toFixed(2)} ${nh.toFixed(2)}`
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ touchAction: 'none' }}
      onClick={handleContainerClick}
      onPointerDown={handlePanPointerDown}
    >
      {/* Tap-to-place capture: when placing a secondary spot, the next map tap
          reports SVG coords and nothing else (no pan/select/move). */}
      {placingPlantId != null && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 40, cursor: 'crosshair' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            const svg = svgRef.current
            if (!svg) return
            const pt = screenToSVG(svg, e.clientX, e.clientY)
            if (pt) onPlacementTap?.(pt.x, pt.y)
          }}
        />
      )}
      {cw > 0 && ch > 0 && (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: cw,
          height: ch,
          transform: 'translate(-50%, -50%)',
          touchAction: 'none',
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
            maxWidth: 'calc(100% - 2rem)',
          }}
        >
          <div className="bg-surface/90 border border-border rounded-full px-3 py-1 text-xs font-semibold text-text shadow-md backdrop-blur-sm truncate">
            Planten in {hoveredZoneName}
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={computeZoomViewBox(baseViewBox, zoom, pan.x, pan.y)}
        preserveAspectRatio={isLandscapeMobile ? "xMidYMax slice" : "xMidYMid meet"}
        className="absolute"
        style={{
          pointerEvents: 'none',
          touchAction: 'none',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background: static SVG (garden maps) + live canvas zones */}
        {canvasData ? (
          <>
            {!isHouseMap && (() => {
              const [,, w, h] = map.viewbox.split(' ').map(Number)
              return <image href={`/maps/${map.svg_file}`} x="0" y="0" width={w} height={h} />
            })()}
            <CanvasZonesLayer canvasData={canvasData} /* showBackground removed */ />
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
            <SunDirectionArrow sunPosition={sunPosition} clipRect={gardenBounds ? { x: gardenBounds.minX, y: gardenBounds.minY, width: gardenBounds.maxX - gardenBounds.minX, height: gardenBounds.maxY - gardenBounds.minY } : { x: 0, y: 0, width: 0, height: 0 }} bearing={map.bearing ?? 0} />
          )}

          {/* Heatmap overlay (behind everything interactive) */}
          {heatmapCells && heatmapCells.length > 0 && (
            <SunHeatmap cells={heatmapCells} isCalculating={!!heatmapCalculating} layer={heatmapLayer} onCellTap={onHeatmapCellTap} maskPolygon={gardenPerimeter} bounds={gardenBounds ? { x: gardenBounds.minX, y: gardenBounds.minY, width: gardenBounds.maxX - gardenBounds.minX, height: gardenBounds.maxY - gardenBounds.minY } : { x: 0, y: 0, width: 0, height: 0 }} />
          )}
          {heatmapCalculating && !heatmapCells?.length && (
            <SunHeatmap cells={[]} isCalculating={true} layer={heatmapLayer} maskPolygon={gardenPerimeter} bounds={gardenBounds ? { x: gardenBounds.minX, y: gardenBounds.minY, width: gardenBounds.maxX - gardenBounds.minX, height: gardenBounds.maxY - gardenBounds.minY } : { x: 0, y: 0, width: 0, height: 0 }} />
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
            showWarnings={showWarnings}
            heatmapCells={heatmapCells}
            dragPositions={dragPositions}
          />
          {/* Plants layer on top */}
          <PlantsLayer
            plants={plants}
            mapType={map.map_type as 'outdoor' | 'indoor'}
            dragPositions={dragPositions}
            draggingKey={dragKey}
            selectedId={selection.selectedId}
            moveMode={moveMode}
            movePlantId={movePlantId}
            labelMode={labelMode}
            showWarnings={showWarnings}
            zoom={zoom}
            onPlantTap={(plant) => handleItemSelect('plant', plant.id)}
            onPointerDown={handlePlantPointerDown}
            heatmapCells={heatmapCells}
          />

          {/* Secondary placements (extra spots) as light dots */}
          <SecondaryMarkersLayer markers={secondaryMarkers} onTap={onSecondaryMarkerTap} />

          {/* Plant resize overlay */}
          {selectedPlant && selectedPlantPos && (
            <PlantResizeOverlay
              x={selectedPlantPos.x}
              y={selectedPlantPos.y}
              radiusCm={plantResizeRadius ?? selectedPlant.display_radius_cm ?? 30}
              isResizing={isResizing}
              activeHandle={activeResizeHandle}
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

      </svg>

      {/* Zoom controls --- always visible */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-0.5 bg-surface/90 border border-border rounded-lg shadow-md backdrop-blur-sm p-1 z-10">
        <button
          onClick={handleZoomIn}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold"
          title="Zoom in">+</button>
        <button
          onClick={handleZoomReset}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-xs border-y border-border/50"
          title="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button
          onClick={handleZoomOut}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-bg hover:text-text transition-colors text-sm font-bold"
          title="Zoom uit">−</button>
      </div>

      </div>
      )}
    </div>
  )
}

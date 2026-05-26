import { useRef, useMemo, type ReactNode } from 'react'
import type { MapDetail, MapPlant, MapObject, GroundZone, CanvasData } from '../../types'
import type { SunPosition } from '../../utils/sunCalc'
import type { ShadowPolygon } from '../../utils/shadowGeometry'
import { screenToSVG } from '../../utils/svgCoords'
import { useContainerSize } from '../../hooks/useContainerSize'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useMapInteraction } from '../../hooks/useMapInteraction'
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
  gardenPerimeter?: [number, number][] | null
  gardenBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  gardenViewBox?: string
}

export default function MapView({ map, plants, objects, onPlantTap, onObjectTap, onMapTap, onPositionUpdate, onOpenDetails, onRemoveItem, onFixedPlantTap, showLabels = true, sunModeActive, shadows, sunPosition, heatmapCells, heatmapCalculating, heatmapLayer = 'sun_hours', heatmapProfile, onHeatmapCellTap, debugOverlay, gardenPerimeter, gardenBounds, gardenViewBox }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { ref: containerRef, width: cw, height: ch } = useContainerSize()
  const isMobile = useIsMobile()

  // Parse canvas_data for live zone rendering
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
    handleContainerPointerDown,
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
    onPlantTap,
    onObjectTap,
    onOpenDetails,
    onPositionUpdate,
    onRemoveItem,
    onMapTap,
  })

  // Derive the profile of the plant being dragged (for the suitability overlay)
  const draggingPlant = dragging?.type === 'plant'
    ? plants.find(p => p.id === dragging.id) ?? null
    : null
  const draggingProfile = draggingPlant?.sun_requirement
    ? PLANT_SUN_PROFILES.find(p => p.id === draggingPlant.sun_requirement) ?? null
    : null

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ touchAction: 'none' }} onClick={handleMapClick}>
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
            mapType={map.map_type as 'outdoor' | 'indoor'}
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
      </div>
      )}
    </div>
  )
}

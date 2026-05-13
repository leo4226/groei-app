import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { MapPlant, MapObject, CanvasData, GroundZone } from '../types'
import { WaterStatusIcon } from '../components/PlantStatusIcon'
import MapView from '../components/map/MapView'
import MapLegend from '../components/map/MapLegend'
import PlantQuickSheet from '../components/sheets/PlantQuickSheet'
import ObjectQuickSheet from '../components/sheets/ObjectQuickSheet'
import FixedPlantSheet from '../components/sheets/FixedPlantSheet'
import type { FixedPlant } from '../constants/fixedPlants'
import SunControls from '../components/sun/SunControls'
import GrowHereSheet from '../components/sheets/GrowHereSheet'
import SpotInspectorSheet from '../components/sheets/SpotInspectorSheet'
import { useSunVisualization } from '../hooks/useSunVisualization'
import DebugSvfOverlay from '../components/sun/DebugSvfOverlay'
import SunDebugOverlay from '../components/map/SunDebugOverlay'
import { useMapData } from '../hooks/useMapData'
import { useGardenWater } from '../hooks/useGardenWater'
import { useUndoableRemove } from '../hooks/useUndoableRemove'
import { useGroeiStore } from '../store/useGroeiStore'
import { CONTAINER_PRESETS } from '../hooks/useEditorState'
import type { ObjectPreset } from '../hooks/useEditorState'
import { createObject } from '../api/client'

export default function MapPage() {
  const { slug = 'garden' } = useParams()
  const navigate = useNavigate()
  const setShowPlantPicker = useGroeiStore((s) => s.setShowPlantPicker)

  const mapData = useMapData(slug)
  const water = useGardenWater()
  const undo = useUndoableRemove()

  const { map, plants, objects, loading } = mapData

  const [selectedPlant, setSelectedPlant] = useState<MapPlant | null>(null)
  const [selectedObject, setSelectedObject] = useState<MapObject | null>(null)
  const [selectedFixedPlant, setSelectedFixedPlant] = useState<FixedPlant | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [showPotPicker, setShowPotPicker] = useState(false)

  async function handleCreateContainer(preset: ObjectPreset) {
    if (!map) return
    setShowPotPicker(false)
    const parts = map.viewbox.trim().split(/\s+/).map(Number)
    const cx = parts.length === 4 ? parts[0] + parts[2] / 2 : 200
    const cy = parts.length === 4 ? parts[1] + parts[3] / 2 : 200
    await createObject({
      name: preset.label,
      object_type: preset.object_type,
      shape: preset.shape,
      category: preset.category,
      material: preset.material,
      color: preset.color,
      map_id: map.id,
      map_x: Math.round(cx),
      map_y: Math.round(cy),
      ...(preset.diameter_cm != null ? { diameter_cm: preset.diameter_cm } : {}),
      ...(preset.width_cm != null ? { width_cm: preset.width_cm } : {}),
      ...(preset.depth_cm != null ? { depth_cm: preset.depth_cm } : {}),
    })
    await refresh()
  }

  const isOutdoor = !map || map.map_type !== 'indoor'
  const mapLat = map?.lat ?? undefined
  const mapLon = map?.lon ?? undefined
  const mapBearing = map?.bearing ?? undefined

  // Parse canvas_data (must come before any useMemo that references it)
  const canvasData = useMemo((): CanvasData | null => {
    if (!map?.canvas_data) return null
    try { return JSON.parse(map.canvas_data) as CanvasData } catch { return null }
  }, [map?.canvas_data])

  // Derive plantable soil zones from canvas_data
  const soilGroundZones = useMemo((): GroundZone[] => {
    if (!canvasData) return []
    return canvasData.zones
      .filter(z => z.type === 'soil')
      .map(z => ({
        id: z.id,
        map_id: map!.id,
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
  }, [canvasData, map])

  const sun = useSunVisualization({ isOutdoor, lat: mapLat, lon: mapLon, bearing: mapBearing, canvasData })

  const handlePlantTap = (plant: MapPlant) => {
    setSelectedObject(null)
    setSelectedPlant(plant)
  }

  const handleObjectTap = (object: MapObject) => {
    if (object.contained_plants?.length === 1) {
      setSelectedObject(null)
      setSelectedPlant(object.contained_plants[0])
      return
    }
    setSelectedPlant(null)
    setSelectedObject(object)
  }

  const handleCloseSheet = () => {
    setSelectedPlant(null)
    setSelectedObject(null)
  }

  const handleOpenDetails = (type: 'plant' | 'object', id: number) => {
    if (type === 'plant') {
      const plant = plants.find((p) => p.id === id)
      if (plant) handlePlantTap(plant)
    } else {
      const obj = objects.find((o) => o.id === id)
      if (obj) handleObjectTap(obj)
    }
  }

  const { remove: mapRemove, duplicate: mapDuplicate, refresh } = mapData
  const { trigger: undoTrigger } = undo

  const handleCareAction = useCallback(async () => {
    await refresh()
    setSelectedPlant(null)
  }, [refresh])

  const handlePositionUpdate = useCallback(async () => {
    await refresh()
  }, [refresh])

  const handleObjectAction = useCallback(async () => {
    setSelectedObject(null)
    await refresh()
  }, [refresh])

  const handleRemoveItem = useCallback(async (type: 'plant' | 'object', id: number) => {
    const info = await mapRemove(type, id)
    if (info) undoTrigger(info)
  }, [mapRemove, undoTrigger])

  const handleDuplicate = useCallback(async (plantId: number) => {
    await mapDuplicate(plantId)
  }, [mapDuplicate])

  if (loading && !map) {
    return (
      <div className="flex flex-col h-[calc(100dvh-4rem)] p-4 overflow-hidden">
        <div className="h-8 w-32 bg-surface rounded-lg animate-pulse mb-4 shrink-0" />
        <div className="flex-1 bg-surface rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!map) {
    return (
      <div className="p-4 text-center text-text-muted">
        <p>Map not found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] px-4 pt-4 pb-2 overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h1 className="text-xl font-bold text-text">{map.name}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/maps/${map.id}/settings`)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text transition-colors"
            title="Kaart instellingen"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {isOutdoor && (
            <button
              onClick={sun.toggle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                sun.active
                  ? 'bg-pumpkin-swirl/30 text-pumpkin-swirl'
                  : 'bg-pumpkin-swirl/15 text-pumpkin-swirl hover:bg-pumpkin-swirl/25'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <span>Zon</span>
            </button>
          )}
          <button
            onClick={() => setShowLabels(v => !v)}
            title={showLabels ? 'Verberg namen' : 'Toon namen'}
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors ${
              showLabels
                ? 'bg-surface text-text-muted hover:bg-surface/80'
                : 'bg-primary/20 text-primary hover:bg-primary/30'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="4" rx="1" />
              <rect x="3" y="11" width="12" height="4" rx="1" />
              <rect x="3" y="17" width="8" height="4" rx="1" />
            </svg>
          </button>
          <button
            onClick={sun.toggleInspectorMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sun.inspectorMode
                ? 'bg-emerald-green/30 text-emerald-green'
                : 'bg-emerald-green/10 text-emerald-green/70 hover:bg-emerald-green/20'
            }`}
          >
            <span>Inspecteer</span>
          </button>
          <button
            onClick={() => setShowPotPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-700 rounded-full text-sm font-medium hover:bg-amber-500/25 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>Pot</span>
          </button>
          <button
            onClick={() => setShowPlantPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-full text-sm font-medium hover:bg-primary/30 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>Plant</span>
          </button>
        </div>
      </div>

      {(() => {
        const gardenWaterStatus = water.gardenWater?.status ?? 'dry'
        const wateredLabel = water.gardenWater?.watered_at
          ? new Date(water.gardenWater.watered_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
          : null
        const rainLabel = water.gardenWater != null
          ? `${water.gardenWater.rain_7day_mm}mm / ${water.gardenWater.weekly_budget_mm}mm deze week`
          : null

        return (
          <div className="mb-2 shrink-0">
            <div className="flex gap-2 items-stretch">
              <button
                onClick={water.openPicker}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
                  gardenWaterStatus === 'hydrated' ? 'bg-emerald-green/15 text-emerald-green' :
                  gardenWaterStatus === 'thirsty'  ? 'bg-pumpkin-swirl/15 text-pumpkin-swirl' :
                  'bg-fiery-red/10 text-fiery-red hover:bg-fiery-red/15'
                }`}
              >
                <WaterStatusIcon status={gardenWaterStatus} size={18} />
                <span className="flex flex-col items-start leading-tight">
                  <span>{wateredLabel ?? 'Nog niet bewaterd'}</span>
                  {rainLabel && <span className="text-[10px] font-normal opacity-70">{rainLabel}</span>}
                </span>
              </button>
            </div>

            {water.showPicker && (
              <div className="mt-1.5 p-3 bg-surface rounded-xl border border-border flex items-center gap-2">
                <input
                  type="date"
                  value={water.pickerDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => water.setPickerDate(e.target.value)}
                  className="flex-1 text-sm bg-bg border border-border rounded-lg px-2 py-1.5 text-text"
                />
                <button
                  onClick={water.save}
                  disabled={water.watering || !water.pickerDate}
                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {water.watering ? '…' : 'Opslaan'}
                </button>
                {water.gardenWater?.watered_at && (
                  <button
                    onClick={water.deleteLast}
                    disabled={water.watering}
                    className="px-3 py-1.5 bg-overdue/10 text-overdue rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    Wis
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })()}

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 rounded-2xl overflow-hidden border border-border">
          <MapView
            map={map}
            plants={plants}
            objects={objects}
            onPlantTap={handlePlantTap}
            onObjectTap={handleObjectTap}
            onMapTap={handleCloseSheet}
            onPositionUpdate={handlePositionUpdate}
            onOpenDetails={handleOpenDetails}
            onRemoveItem={handleRemoveItem}
            onFixedPlantTap={setSelectedFixedPlant}
            showLabels={showLabels}
            sunModeActive={sun.isLiveActive}
            shadows={sun.shadows}
            sunPosition={sun.sunPosition}
            heatmapCells={sun.isHeatmapActive ? sun.cells : undefined}
            heatmapCalculating={sun.isHeatmapActive ? sun.isCalculating : undefined}
            heatmapLayer={sun.layer}
            heatmapProfile={sun.isHeatmapActive ? sun.profile : undefined}
            onHeatmapCellTap={sun.isHeatmapActive ? sun.handleCellTap : undefined}
            gardenPerimeter={sun.gardenPerimeter}
            gardenBounds={sun.gardenBounds}
            gardenViewBox={sun.gardenViewBox}
            debugOverlay={
              new URLSearchParams(window.location.search).has('debug') &&
              new URLSearchParams(window.location.search).get('debug') === 'sun'
                ? <SunDebugOverlay sunPosition={sun.sunPosition} bearing={mapBearing} />
                : sun.isHeatmapActive && sun.tappedCell
                  ? <DebugSvfOverlay cell={sun.tappedCell} obstructions={sun.gardenObstructions} />
                  : undefined
            }
          />
        </div>

        <div className="hidden sm:flex sm:flex-col shrink-0 min-h-0 overflow-y-auto">
          <MapLegend plants={plants} objects={objects} onPlantTap={handlePlantTap} />
        </div>
      </div>

      {isOutdoor && sun.active && (
        <SunControls sun={sun} />
      )}

      {sun.inspectorMode && !sun.inspectorResult && !sun.inspectorLoading && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-black/70 text-white text-xs px-4 py-2 rounded-full pointer-events-none">
          Zet de zonkaart aan en tik op een plek in de tuin
        </div>
      )}

      {sun.inspectorResult && (
        <SpotInspectorSheet
          result={sun.inspectorResult}
          loading={sun.inspectorLoading}
          onClose={sun.clearInspector}
        />
      )}

      {selectedPlant && (
        <PlantQuickSheet
          plant={selectedPlant}
          objects={objects}
          soilGroundZones={soilGroundZones}
          heatmapCells={sun.isHeatmapActive ? sun.cells : undefined}
          onClose={handleCloseSheet}
          onCareAction={handleCareAction}
          onAction={handleCareAction}
          onDuplicate={handleDuplicate}
          onRemove={(id) => handleRemoveItem('plant', id)}
        />
      )}

      {selectedObject && (
        <ObjectQuickSheet
          object={selectedObject}
          mapPlants={plants}
          onClose={handleCloseSheet}
          onAction={handleObjectAction}
        />
      )}

      {selectedFixedPlant && (
        <FixedPlantSheet
          plant={selectedFixedPlant}
          onClose={() => setSelectedFixedPlant(null)}
        />
      )}

      {showPotPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setShowPotPicker(false)}
        >
          <div
            className="w-full bg-bg rounded-t-2xl border-t border-border p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-text">Pot toevoegen</h2>
              <button
                onClick={() => setShowPotPicker(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {CONTAINER_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleCreateContainer(preset)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface text-left transition-colors"
                >
                  <span
                    className="w-8 h-8 rounded-full shrink-0"
                    style={{ backgroundColor: preset.color ?? '#888' }}
                  />
                  <div>
                    <div className="text-sm font-semibold text-text">{preset.label}</div>
                    <div className="text-xs text-text-muted">
                      {preset.shape === 'circle'
                        ? `⌀ ${preset.diameter_cm} cm`
                        : `${preset.width_cm} × ${preset.depth_cm ?? preset.width_cm} cm`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sun.showGrowHere && sun.tappedCell && (
        <GrowHereSheet
          tappedCell={sun.tappedCell}
          selectedMonth={sun.month}
          mapPlants={plants}
          mapId={map?.id ?? null}
          onClose={sun.closeGrowHere}
        />
      )}

      {undo.toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border rounded-full px-4 py-2.5 flex items-center gap-3 animate-slide-up">
          <span className="text-sm text-text">Verwijderd: <strong>{undo.toast.label}</strong></span>
          {undo.toast.canUndo && (
            <button
              onClick={undo.undo}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Ongedaan maken
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { MapDetail, MapPlant, MapObject } from '../types'
import { fetchMapDetail, fetchMapItems, fetchGroundZones, archiveObject, archivePlant, duplicatePlant, updatePlantPosition, fetchGardenWaterStatus, logGardenWatering, deleteLatestGardenWatering } from '../api/client'
import type { GardenWaterStatus } from '../api/client'
import { aggregatePlantStatuses } from '../hooks/usePlantStatus'
import { WaterStatusIcon, TempStatusIcon } from '../components/PlantStatusIcon'
import type { GroundZone } from '../types'
import MapView from '../components/map/MapView'
import MapLegend from '../components/map/MapLegend'
import PlantQuickSheet from '../components/sheets/PlantQuickSheet'
import ObjectQuickSheet from '../components/sheets/ObjectQuickSheet'
import AddObjectSheet from '../components/sheets/AddObjectSheet'
import FixedPlantSheet from '../components/sheets/FixedPlantSheet'
import type { FixedPlant } from '../constants/fixedPlants'
import SunControls, { type SunViewMode } from '../components/sun/SunControls'
import GrowHereSheet from '../components/sheets/GrowHereSheet'
import SpotInspectorSheet from '../components/sheets/SpotInspectorSheet'
import { useSunPosition } from '../hooks/useSunPosition'
import { useSunHeatmap } from '../hooks/useSunHeatmap'
import { useSpotInspector } from '../hooks/useSpotInspector'
import type { HeatmapCell } from '../utils/heatmapCalc'
import { shadowCastersToObstructions } from '../utils/heatmapCalc'
import type { PlantSunProfile } from '../utils/plantSunRequirements'
import type { HeatmapLayer } from '../utils/lightQuality'
import { SHADOW_CASTERS } from '../utils/gardenStructures'
import DebugSvfOverlay from '../components/sun/DebugSvfOverlay'
import SunDebugOverlay from '../components/map/SunDebugOverlay'

export default function MapPage() {
  const { slug = 'garden' } = useParams()
  const navigate = useNavigate()
  const [map, setMap] = useState<MapDetail | null>(null)
  const [plants, setPlants] = useState<MapPlant[]>([])
  const [objects, setObjects] = useState<MapObject[]>([])
  const [groundZones, setGroundZones] = useState<GroundZone[]>([])
  const [loading, setLoading] = useState(true)
  const [gardenWater, setGardenWater] = useState<GardenWaterStatus | null>(null)
  const [watering, setWatering] = useState(false)
  const [showWaterPicker, setShowWaterPicker] = useState(false)
  const [pickerDate, setPickerDate] = useState('')
  const [selectedPlant, setSelectedPlant] = useState<MapPlant | null>(null)
  const [selectedObject, setSelectedObject] = useState<MapObject | null>(null)
  const [showAddObject, setShowAddObject] = useState(false)
  const [selectedFixedPlant, setSelectedFixedPlant] = useState<FixedPlant | null>(null)
  const {
    sunModeActive, toggleSunMode,
    selectedMonth, setSelectedMonth,
    selectedHour, setSelectedHour,
    sunPosition, shadows, setToNow,
  } = useSunPosition()
  const [sunViewMode, setSunViewMode] = useState<SunViewMode>('live')
  const [heatmapLayer, setHeatmapLayer] = useState<HeatmapLayer>('sun_hours')
  const [selectedProfile, setSelectedProfile] = useState<PlantSunProfile | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [tappedCell, setTappedCell] = useState<HeatmapCell | null>(null)
  const [showGrowHere, setShowGrowHere] = useState(false)
  const [inspectorMode, setInspectorMode] = useState(false)
  const { result: inspectorResult, loading: inspectorLoading, inspect, clear: clearInspector } = useSpotInspector()
  const isHeatmapActive = sunModeActive && sunViewMode === 'heatmap'
  const { cells: heatmapCells, isCalculating: heatmapCalculating } = useSunHeatmap(selectedMonth, isHeatmapActive)

  // Obstructions for debug SVF overlay — stable reference, only changes if geometry changes
  const gardenObstructions = useMemo(() => shadowCastersToObstructions(SHADOW_CASTERS), [])

  const loadData = useCallback(async () => {
    try {
      const [mapData, itemsData, zonesData, waterStatus] = await Promise.all([
        fetchMapDetail(slug),
        fetchMapItems(slug),
        fetchGroundZones(slug),
        fetchGardenWaterStatus().catch(() => null),
      ])
      setMap(mapData)
      setPlants(itemsData.plants)
      setObjects(itemsData.objects)
      setGroundZones(zonesData)
      setGardenWater(waterStatus)
    } catch (err) {
      console.error('Failed to load map data:', err)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [loadData])

  // Double-tap on selected item opens the sheet (via MapView callbacks)
  const handlePlantTap = (plant: MapPlant) => {
    setSelectedObject(null)
    setSelectedPlant(plant)
  }

  const handleObjectTap = (object: MapObject) => {
    // If exactly one plant lives in this container, open the plant directly
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

  const handleCareAction = async () => {
    await loadData()
    setSelectedPlant(null)
  }

  const handlePositionUpdate = async () => {
    await loadData()
  }

  const handleObjectCreated = async () => {
    setShowAddObject(false)
    await loadData()
  }

  const handleObjectAction = async () => {
    setSelectedObject(null)
    await loadData()
  }

  // --- Remove with undo toast ---
  const [removeToast, setRemoveToast] = useState<{ label: string; undoFn: (() => void) | null } | null>(null)
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRemoveItem = useCallback(async (type: 'plant' | 'object', id: number) => {
    const item = type === 'plant'
      ? plants.find((p) => p.id === id)
      : objects.find((o) => o.id === id)
    if (!item) return

    const label = item.name
    const containedCount = type === 'object' ? (item as MapObject).contained_plants?.length ?? 0 : 0

    if (containedCount > 0) {
      const ok = confirm(`Remove "${label}" and ${containedCount} plant${containedCount !== 1 ? 's' : ''} inside?`)
      if (!ok) return
    }

    try {
      if (type === 'plant') {
        await archivePlant(id)
      } else {
        await archiveObject(id)
      }
      await loadData()

      // Show undo toast (undo not implemented on backend — just informational)
      setRemoveToast({ label, undoFn: null })
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
      removeTimerRef.current = setTimeout(() => setRemoveToast(null), 4000)
    } catch (err) {
      console.error('Failed to remove item:', err)
    }
  }, [plants, objects, loadData])

  // --- Duplicate plant ---
  const handleDuplicate = useCallback(async (plantId: number) => {
    try {
      const newPlant = await duplicatePlant(plantId)
      // Place the duplicate at map center
      if (map) {
        const [, , vw, vh] = map.viewbox.split(' ').map(Number)
        await updatePlantPosition(newPlant.id, { map_id: map.id, map_x: vw / 2, map_y: vh / 2 })
      }
      await loadData()
    } catch (err) {
      console.error('Failed to duplicate plant:', err)
    }
  }, [map, loadData])

  if (loading) {
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
            onClick={toggleSunMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sunModeActive
                ? 'bg-amber-500/30 text-amber-300'
                : 'bg-amber-500/15 text-amber-500 hover:bg-amber-500/25'
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
            onClick={() => { setInspectorMode(m => !m); clearInspector() }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              inspectorMode
                ? 'bg-emerald-500/30 text-emerald-400'
                : 'bg-emerald-500/10 text-emerald-500/70 hover:bg-emerald-500/20'
            }`}
          >
            <span>Inspecteer</span>
          </button>
          <button
            onClick={() => navigate('/plants/add')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-full text-sm font-medium hover:bg-primary/30 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>Plant</span>
          </button>
          <button
            onClick={() => setShowAddObject(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-full text-sm font-medium hover:bg-primary/30 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>Object</span>
          </button>
        </div>
      </div>

      {(() => {
        const counts = aggregatePlantStatuses(plants)
        const hasUrgent = counts.freezing > 0 || counts.heatstress > 0
        const hasWarning = counts.chilling > 0

        const gardenWaterStatus = gardenWater?.status ?? 'dry'
        const wateredLabel = gardenWater?.watered_at
          ? new Date(gardenWater.watered_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
          : null
        const rainLabel = gardenWater != null
          ? `${gardenWater.rain_7day_mm}mm / ${gardenWater.weekly_budget_mm}mm deze week`
          : null

        function openPicker() {
          setPickerDate(gardenWater?.watered_at ?? new Date().toISOString().slice(0, 10))
          setShowWaterPicker(v => !v)
        }

        async function handleSave() {
          if (!pickerDate) return
          setWatering(true)
          try {
            await logGardenWatering(pickerDate)
            setGardenWater(await fetchGardenWaterStatus().catch(() => null))
            setShowWaterPicker(false)
          } finally {
            setWatering(false)
          }
        }

        async function handleDelete() {
          setWatering(true)
          try {
            await deleteLatestGardenWatering()
            setGardenWater(await fetchGardenWaterStatus().catch(() => null))
            setShowWaterPicker(false)
          } finally {
            setWatering(false)
          }
        }

        const statusChips: { key: string; label: string; count: number; urgent: boolean }[] = [
          { key: 'freezing',   label: 'Vrieskou', count: counts.freezing,   urgent: true  },
          { key: 'chilling',   label: 'Koud',     count: counts.chilling,   urgent: false },
          { key: 'heatstress', label: 'Hitte',    count: counts.heatstress, urgent: true  },
        ].filter(c => c.count > 0)

        return (
          <div className="mb-2 shrink-0">
            <div className="flex gap-2 items-stretch">
              {/* Status icon row */}
              {statusChips.length > 0 ? (
                <div
                  className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl ${
                    hasUrgent ? 'bg-red-50 border border-red-200' :
                    hasWarning ? 'bg-orange-50 border border-orange-200' :
                    'bg-surface border border-border'
                  }`}
                >
                  {statusChips.map(chip => (
                    <button
                      key={chip.key}
                      onClick={() => navigate('/plants?alerts=1')}
                      className="flex items-center gap-1 shrink-0"
                      title={chip.label}
                    >
                      <TempStatusIcon status={chip.key as 'chilling' | 'freezing' | 'heatstress'} size={18} />
                      <span className={`text-xs font-bold ${chip.urgent ? 'text-red-600' : 'text-orange-500'}`}>
                        {chip.count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border">
                  <span className="text-xs font-medium text-good">Geen temperatuuralerts</span>
                </div>
              )}

              {/* Garden water button — status driven by rainfall + manual watering */}
              <button
                onClick={openPicker}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  gardenWaterStatus === 'hydrated' ? 'bg-green-100 text-green-700' :
                  gardenWaterStatus === 'thirsty'  ? 'bg-amber-100 text-amber-700' :
                  'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
              >
                <WaterStatusIcon status={gardenWaterStatus} size={18} />
                <span className="flex flex-col items-start leading-tight">
                  <span>{wateredLabel ?? 'Nog niet bewaterd'}</span>
                  {rainLabel && <span className="text-[10px] font-normal opacity-70">{rainLabel}</span>}
                </span>
              </button>
            </div>

            {showWaterPicker && (
              <div className="mt-1.5 p-3 bg-surface rounded-xl border border-border flex items-center gap-2">
                <input
                  type="date"
                  value={pickerDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setPickerDate(e.target.value)}
                  className="flex-1 text-sm bg-bg border border-border rounded-lg px-2 py-1.5 text-text"
                />
                <button
                  onClick={handleSave}
                  disabled={watering || !pickerDate}
                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {watering ? '…' : 'Opslaan'}
                </button>
                {gardenWater?.watered_at && (
                  <button
                    onClick={handleDelete}
                    disabled={watering}
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
        {/* Map */}
        <div className="flex-1 min-w-0 min-h-0 rounded-2xl overflow-hidden shadow-lg border border-border">
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
            groundZones={groundZones}
            sunModeActive={sunModeActive && sunViewMode === 'live'}
            shadows={shadows}
            sunPosition={sunPosition}
            heatmapCells={isHeatmapActive ? heatmapCells : undefined}
            heatmapCalculating={isHeatmapActive ? heatmapCalculating : undefined}
            heatmapLayer={heatmapLayer}
            heatmapProfile={isHeatmapActive ? selectedProfile : undefined}
            onHeatmapCellTap={isHeatmapActive ? (cell) => {
              if (inspectorMode) {
                inspect(cell.x + cell.w / 2, cell.y + cell.h / 2)
              } else {
                setTappedCell(cell)
              }
            } : undefined}
            debugOverlay={
              new URLSearchParams(window.location.search).has('debug') &&
              new URLSearchParams(window.location.search).get('debug') === 'sun'
                ? <SunDebugOverlay sunPosition={sunPosition} />
                : isHeatmapActive && tappedCell
                  ? <DebugSvfOverlay cell={tappedCell} obstructions={gardenObstructions} />
                  : undefined
            }
          />
        </div>

        {/* Legend */}
        <div className="hidden sm:flex sm:flex-col shrink-0 min-h-0 overflow-y-auto">
          <MapLegend plants={plants} objects={objects} onPlantTap={handlePlantTap} heatmapCells={isHeatmapActive ? heatmapCells : undefined} />
        </div>
      </div>

      {sunModeActive && (
        <SunControls
          viewMode={sunViewMode}
          onViewModeChange={(mode) => { setSunViewMode(mode); setTappedCell(null); setSelectedProfile(null) }}
          selectedMonth={selectedMonth}
          selectedHour={selectedHour}
          sunPosition={sunPosition}
          onMonthChange={(m) => { setSelectedMonth(m); setTappedCell(null); setShowGrowHere(false) }}
          onHourChange={setSelectedHour}
          onNow={setToNow}
          heatmapLayer={heatmapLayer}
          onHeatmapLayerChange={(layer) => { setHeatmapLayer(layer); setTappedCell(null) }}
          isCalculating={heatmapCalculating}
          tappedCell={tappedCell}
          selectedProfile={selectedProfile}
          onProfileChange={setSelectedProfile}
          onGrowHere={() => setShowGrowHere(true)}
        />
      )}

      {/* Inspector mode hint */}
      {inspectorMode && !inspectorResult && !inspectorLoading && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-black/70 text-white text-xs px-4 py-2 rounded-full pointer-events-none">
          Zet de zonkaart aan en tik op een plek in de tuin
        </div>
      )}

      {inspectorResult && (
        <SpotInspectorSheet
          result={inspectorResult}
          loading={inspectorLoading}
          onClose={() => { clearInspector() }}
        />
      )}

      {selectedPlant && (
        <PlantQuickSheet
          plant={selectedPlant}
          objects={objects}
          groundZones={groundZones}
          heatmapCells={isHeatmapActive ? heatmapCells : undefined}
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

      {showGrowHere && tappedCell && (
        <GrowHereSheet
          tappedCell={tappedCell}
          selectedMonth={selectedMonth}
          mapPlants={plants}
          mapId={map?.id ?? null}
          onClose={() => setShowGrowHere(false)}
        />
      )}

      {showAddObject && map && (
        <AddObjectSheet
          mapId={map.id}
          onClose={() => setShowAddObject(false)}
          onCreated={handleObjectCreated}
        />
      )}

      {/* Remove toast */}
      {removeToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-3 animate-slide-up">
          <span className="text-sm text-text">Removed <strong>{removeToast.label}</strong></span>
        </div>
      )}
    </div>
  )
}

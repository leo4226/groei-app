import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { MapPlant, MapObject } from '../types'
import { aggregatePlantStatuses } from '../hooks/usePlantStatus'
import { WaterStatusIcon, TempStatusIcon } from '../components/PlantStatusIcon'
import MapView from '../components/map/MapView'
import MapLegend from '../components/map/MapLegend'
import PlantQuickSheet from '../components/sheets/PlantQuickSheet'
import ObjectQuickSheet from '../components/sheets/ObjectQuickSheet'
import AddObjectSheet from '../components/sheets/AddObjectSheet'
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

export default function MapPage() {
  const { slug = 'garden' } = useParams()
  const navigate = useNavigate()

  const mapData = useMapData(slug)
  const water = useGardenWater()
  const undo = useUndoableRemove()

  const { map, plants, objects, groundZones, loading } = mapData

  const [selectedPlant, setSelectedPlant] = useState<MapPlant | null>(null)
  const [selectedObject, setSelectedObject] = useState<MapObject | null>(null)
  const [showAddObject, setShowAddObject] = useState(false)
  const [selectedFixedPlant, setSelectedFixedPlant] = useState<FixedPlant | null>(null)
  const [showLabels, setShowLabels] = useState(true)

  const isOutdoor = !map || map.map_type !== 'indoor'
  const mapLat = map?.lat ?? undefined
  const mapLon = map?.lon ?? undefined

  const sun = useSunVisualization({ isOutdoor, lat: mapLat, lon: mapLon })

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

  const handleObjectCreated = useCallback(async () => {
    setShowAddObject(false)
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

        const gardenWaterStatus = water.gardenWater?.status ?? 'dry'
        const wateredLabel = water.gardenWater?.watered_at
          ? new Date(water.gardenWater.watered_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
          : null
        const rainLabel = water.gardenWater != null
          ? `${water.gardenWater.rain_7day_mm}mm / ${water.gardenWater.weekly_budget_mm}mm deze week`
          : null

        const statusChips: { key: string; label: string; count: number; urgent: boolean }[] = [
          { key: 'freezing',   label: 'Vrieskou', count: counts.freezing,   urgent: true  },
          { key: 'chilling',   label: 'Koud',     count: counts.chilling,   urgent: false },
          { key: 'heatstress', label: 'Hitte',    count: counts.heatstress, urgent: true  },
        ].filter(c => c.count > 0)

        return (
          <div className="mb-2 shrink-0">
            <div className="flex gap-2 items-stretch">
              {statusChips.length > 0 ? (
                <div
                  className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-[10px] ${
                    hasUrgent ? 'bg-fiery-red/10 border border-fiery-red/20' :
                    hasWarning ? 'bg-pumpkin-swirl/10 border border-pumpkin-swirl/20' :
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
                      <span className={`text-xs font-bold ${chip.urgent ? 'text-fiery-red' : 'text-pumpkin-swirl'}`}>
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
            groundZones={groundZones}
            sunModeActive={sun.isLiveActive}
            shadows={sun.shadows}
            sunPosition={sun.sunPosition}
            heatmapCells={sun.isHeatmapActive ? sun.cells : undefined}
            heatmapCalculating={sun.isHeatmapActive ? sun.isCalculating : undefined}
            heatmapLayer={sun.layer}
            heatmapProfile={sun.isHeatmapActive ? sun.profile : undefined}
            onHeatmapCellTap={sun.isHeatmapActive ? sun.handleCellTap : undefined}
            debugOverlay={
              new URLSearchParams(window.location.search).has('debug') &&
              new URLSearchParams(window.location.search).get('debug') === 'sun'
                ? <SunDebugOverlay sunPosition={sun.sunPosition} />
                : sun.isHeatmapActive && sun.tappedCell
                  ? <DebugSvfOverlay cell={sun.tappedCell} obstructions={sun.gardenObstructions} />
                  : undefined
            }
          />
        </div>

        <div className="hidden sm:flex sm:flex-col shrink-0 min-h-0 overflow-y-auto">
          <MapLegend plants={plants} objects={objects} onPlantTap={handlePlantTap} heatmapCells={sun.isHeatmapActive ? sun.cells : undefined} />
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
          groundZones={groundZones}
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

      {sun.showGrowHere && sun.tappedCell && (
        <GrowHereSheet
          tappedCell={sun.tappedCell}
          selectedMonth={sun.month}
          mapPlants={plants}
          mapId={map?.id ?? null}
          onClose={sun.closeGrowHere}
        />
      )}

      {showAddObject && map && (
        <AddObjectSheet
          mapId={map.id}
          onClose={() => setShowAddObject(false)}
          onCreated={handleObjectCreated}
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

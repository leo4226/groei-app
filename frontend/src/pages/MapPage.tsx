import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import type { MapPlant, MapObject, CanvasData, GroundZone } from '../types'
import MapView from '../components/map/MapView'
import MapTopBar from '../components/map/MapTopBar'
import MapActionCluster from '../components/map/MapActionCluster'
import MapBottomSheet, { type SheetMode } from '../components/map/MapBottomSheet'
import CareNeedsList from '../components/map/CareNeedsList'
import GardenBiodiversityCard from '../components/GardenBiodiversityCard'
import PlantQuickSheet from '../components/sheets/PlantQuickSheet'
import ObjectQuickSheet from '../components/sheets/ObjectQuickSheet'
import FixedPlantSheet from '../components/sheets/FixedPlantSheet'
import type { FixedPlant } from '../constants/fixedPlants'
import SunControls from '../components/sun/SunControls'
import GrowHereSheet from '../components/sheets/GrowHereSheet'
import SpotInspectorSheet from '../components/sheets/SpotInspectorSheet'
import WaterLogSheet from '../components/sheets/WaterLogSheet'
import { useSunVisualization } from '../hooks/useSunVisualization'
import DebugSvfOverlay from '../components/sun/DebugSvfOverlay'
import SunDebugOverlay from '../components/map/SunDebugOverlay'
import { useMapData } from '../hooks/useMapData'
import { useGardenWater, useGardenFertilize } from '../hooks/useGardenActions'
import { useUndoableRemove } from '../hooks/useUndoableRemove'
import { useFloreren } from '../store/useFloreren'
import { CONTAINER_PRESETS } from '../hooks/useEditorState'
import type { ObjectPreset } from '../hooks/useEditorState'
import * as clientApis from '../api/client'
import { useT } from '../context/LanguageContext'

export default function MapPage() {
  const t = useT()
  const { slug = 'garden' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const maps = useFloreren((s) => s.maps)
  const loadMaps = useFloreren((s) => s.loadMaps)

  const mapData = useMapData(slug)
  const { refresh: refreshMapData } = mapData

  // Force refresh when navigating back (location.key changes on popstate)
  useEffect(() => {
    refreshMapData()
  }, [location.key])
  const water = useGardenWater()
  const fertilize = useGardenFertilize()
  const undo = useUndoableRemove()

  // Load full map list for the indoor/outdoor toggle
  useEffect(() => {
    if (maps.length === 0) loadMaps()
  }, [loadMaps])

  const { map, plants, objects, groundZones, loading } = mapData

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
    await clientApis.objects.create({
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

  // Derive plantable soil zones from canvas_data, merging soil_note from API
  const soilGroundZones = useMemo((): GroundZone[] => {
    if (!canvasData) return []
    return canvasData.zones
      .filter(z => z.type === 'soil')
      .map(z => {
        const apiZone = groundZones.find(gz => gz.id === z.id)
        return {
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
          soil_note: z.soil_note ?? apiZone?.soil_note ?? null,
        }
      })
  }, [canvasData, map, groundZones])

  const sun = useSunVisualization({ isOutdoor, lat: mapLat, lon: mapLon, bearing: mapBearing, canvasData })

  const attentionCount = useMemo(() => {
    const containedPlants = objects.flatMap((o) => o.contained_plants ?? [])
    const all = [...plants, ...containedPlants]
    return all.filter((p) => p.top_warning !== null).length
  }, [plants, objects])

  const sheetMode: SheetMode = sun.active && isOutdoor ? 'sun' : 'care'

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

  const handleWaterSave = useCallback(async () => {
    await water.save()
    await refresh()
  }, [water, refresh])

  const handleWaterDelete = useCallback(async () => {
    await water.deleteLast()
    await refresh()
  }, [water, refresh])

  const handleFertilizeSave = useCallback(async () => {
    await fertilize.save()
    await refresh()
  }, [fertilize, refresh])

  const handleFertilizeDelete = useCallback(async () => {
    await fertilize.deleteLast()
    await refresh()
  }, [fertilize, refresh])

  const handleRemoveItem = useCallback(async (type: 'plant' | 'object', id: number) => {
    const info = await mapRemove(type, id)
    if (info) undoTrigger(info)
  }, [mapRemove, undoTrigger])

  const handleDuplicate = useCallback(async (plantId: number) => {
    await mapDuplicate(plantId)
  }, [mapDuplicate])

  if (loading && !map) {
    return (
      <div className="flex flex-col h-[calc(100dvh-5rem)] p-4 overflow-hidden">
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
    <div className="relative h-[calc(100dvh-5rem)] [@media(orientation:landscape)and(max-height:500px)]:h-dvh overflow-hidden">
      {/* Map fills viewport */}
      <div className="absolute inset-0">
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
          sunModeActive={sun.active}
          shadows={sun.shadows}
          sunPosition={sun.sunPosition}
          heatmapCells={sun.cells}
          heatmapCalculating={sun.isCalculating}
          heatmapLayer="sun_hours"
          heatmapProfile={sun.isHeatmapActive ? sun.profile : undefined}
          onHeatmapCellTap={sun.isHeatmapActive ? sun.handleCellTap : undefined}
          gardenPerimeter={sun.gardenPerimeter}
          gardenBounds={sun.gardenBounds}
          gardenViewBox={sun.gardenViewBox}
          debugOverlay={(() => {
            const gb = sun.gardenBounds
            const boundsRect = gb
              ? { x: gb.minX, y: gb.minY, width: gb.maxX - gb.minX, height: gb.maxY - gb.minY }
              : null
            const debugParam = new URLSearchParams(window.location.search).get('debug')
            if (debugParam === 'sun' && boundsRect && mapLat != null && mapLon != null && mapBearing != null) {
              return (
                <SunDebugOverlay
                  sunPosition={sun.sunPosition}
                  bearing={mapBearing}
                  gardenBounds={boundsRect}
                  lat={mapLat}
                  lon={mapLon}
                  shadowCasters={sun.shadowCasters}
                />
              )
            }
            if (sun.isHeatmapActive && sun.tappedCell && boundsRect) {
              return (
                <DebugSvfOverlay
                  cell={sun.tappedCell}
                  obstructions={sun.gardenObstructions}
                  gardenBounds={boundsRect}
                />
              )
            }
            return undefined
          })()}
        />
      </div>

      {/* Top-left: garden pill */}
      <div className="absolute top-3 left-3 z-20 landscape-mobile-hide">
        <MapTopBar map={map} allMaps={maps} />
      </div>

      {/* Top-right: action cluster + biodiversity pill stacked */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 landscape-mobile-hide">
        <MapActionCluster
          isOutdoor={isOutdoor}
          waterStatus={water.gardenWater?.status ?? 'dry'}
          showLabels={showLabels}
          sunActive={sun.active}
          sunAvailable={sun.available}
          inspectorMode={sun.inspectorMode}
          onWater={water.togglePicker}
          onFertilize={fertilize.togglePicker}
          onToggleSun={sun.toggle}
          onToggleLabels={() => setShowLabels((v) => !v)}
          onToggleInspector={sun.toggleInspectorMode}
          onIdentify={() => navigate('/identify', { state: { mapId: map.id, mapSlug: map.slug } })}
          onAddPot={() => setShowPotPicker(true)}
          onAddPlant={() => navigate('/plants/add', { state: { fromMap: location.pathname } })}
        />
        {isOutdoor && slug && <GardenBiodiversityCard slug={slug} mode="pill" />}
      </div>

      {/* Bottom sheet — care needs OR sun controls */}
      <div className="landscape-mobile-hide">
        <MapBottomSheet
          mode={sheetMode}
          attentionCount={attentionCount}
          autoExpand={sun.active}
          careContent={<CareNeedsList plants={plants} objects={objects} onPlantTap={handlePlantTap} />}
          sunContent={
            <SunControls
              viewMode={sun.viewMode}
              onViewModeChange={sun.setViewMode}
              selectedMonth={sun.month}
              selectedHour={sun.hour}
              sunPosition={sun.sunPosition}
              onMonthChange={sun.setMonth}
              onHourChange={sun.setHour}
              onNow={sun.setToNow}
              isCalculating={sun.isCalculating}
              tappedCell={sun.tappedCell}
              selectedProfile={sun.profile}
              onProfileChange={sun.setProfile}
              onGrowHere={sun.openGrowHere}
            />
          }
        />
      </div>

      {/* Water sheet */}
      {water.showPicker && (
        <WaterLogSheet
          actionType="water"
          pickerDate={water.pickerDate}
          onPickerDateChange={water.setPickerDate}
          busy={water.watering}
          hasExistingLog={!!water.gardenWater?.watered_at}
          onSave={handleWaterSave}
          onDelete={handleWaterDelete}
          onClose={water.closePicker}
        />
      )}

      {/* Fertilize inline picker */}
      {fertilize.showPicker && (
        <div className="absolute bottom-20 left-3 right-3 z-40 p-3 bg-surface rounded-xl border border-border flex items-center gap-2">
          <span className="text-sm shrink-0">🌿</span>
          <input
            type="date"
            value={fertilize.pickerDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => fertilize.setPickerDate(e.target.value)}
            className="flex-1 text-sm bg-bg border border-border rounded-lg px-2 py-1.5 text-text"
          />
          <button
            onClick={handleFertilizeSave}
            disabled={fertilize.fertilizing || !fertilize.pickerDate}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {fertilize.fertilizing ? '…' : t.mapPage.saveLabel}
          </button>
          {fertilize.fertilize?.fertilized_at && (
            <button
              onClick={handleFertilizeDelete}
              disabled={fertilize.fertilizing}
              className="px-3 py-1.5 bg-overdue/10 text-overdue rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {t.mapPage.clearLabel}
            </button>
          )}
        </div>
      )}

      {/* Spot inspector hint */}
      {sun.inspectorMode && !sun.inspectorResult && !sun.inspectorLoading && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-black/70 text-white text-xs px-4 py-2 rounded-full pointer-events-none">
          {t.mapPage.spotInspectorHint}
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
          heatmapCells={sun.cells}
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
              <h2 className="text-base font-bold text-text">{t.mapPage.addPot}</h2>
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
          <span className="text-sm text-text">{t.mapPage.deleted(undo.toast.label)}</span>
          {undo.toast.canUndo && (
            <button
              onClick={undo.undo}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {t.mapPage.undo}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

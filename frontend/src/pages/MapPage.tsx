import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
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
  const [showMoreActions, setShowMoreActions] = useState(false)

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

  // Find indoor/outdoor maps for the toggle
  const indoorMap = maps.find((m) => m.map_type === 'indoor')
  const outdoorMap = maps.find((m) => m.map_type === 'outdoor')
  const isIndoor = map.map_type === 'indoor'

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] [@media(orientation:landscape)and(max-height:500px)]:h-dvh [@media(orientation:landscape)and(max-height:500px)]:p-0 px-4 pt-4 pb-2 overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0 landscape-mobile-hide">
        <div className="flex items-center gap-2 min-w-0 map-header-scroll">
          {indoorMap && outdoorMap && (
            <div className="flex gap-0.5 bg-surface rounded-lg p-0.5 border border-border shrink-0">
              <button
                onClick={() => { if (indoorMap.slug !== slug) navigate(`/map/${indoorMap.slug}`) }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isIndoor
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {indoorMap.name}
              </button>
              <button
                onClick={() => { if (outdoorMap.slug !== slug) navigate(`/map/${outdoorMap.slug}`) }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  !isIndoor
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {outdoorMap.name}
              </button>
            </div>
          )}
          <h1 className="text-xl font-bold text-text truncate whitespace-nowrap">{map.name}</h1>
          <button
            onClick={() => navigate(`/maps/${map.id}/settings`)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text transition-colors"
            title={t.mapPage.mapSettings}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Scrollable toolbar: water + fertilize always visible; desktop-only buttons hidden on mobile */}
          <div className="flex items-center gap-1.5 map-toolbar">
          {/* Bewater */}
          <button
            onClick={water.togglePicker}
            title={water.gardenWater?.watered_at
              ? t.mapPage.lastWatered(new Date(water.gardenWater.watered_at).toLocaleDateString('nl-NL'))
              : t.mapPage.recordWatering}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 text-blue-600 rounded-full text-sm font-medium hover:bg-blue-500/25 transition-colors map-action-primary"
          >
            <WaterStatusIcon status={water.gardenWater?.status ?? 'dry'} size={14} />
            <span>{t.mapPage.water}</span>
          </button>
          {/* Bemest */}
          <button
            onClick={fertilize.togglePicker}
            title={fertilize.fertilize?.fertilized_at
              ? t.mapPage.lastFertilized(new Date(fertilize.fertilize.fertilized_at).toLocaleDateString('nl-NL'))
              : t.mapPage.recordFertilizing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 text-emerald-600 rounded-full text-sm font-medium hover:bg-emerald-500/25 transition-colors map-action-primary"
          >
            <span className="text-sm leading-none">🌿</span>
            <span>{t.mapPage.fertilize}</span>
          </button>

          {/* Desktop: alle overige knoppen zichtbaar als pillen — verborgen op mobiel */}
          <button
            onClick={() => setShowLabels(v => !v)}
            title={showLabels ? t.mapPage.labelHide : t.mapPage.labelShow}
            className="flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors map-action-desktop forced-hidden-mobile"
            style={showLabels ? undefined : { backgroundColor: 'var(--color-primary)', color: 'white' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="4" rx="1" />
              <rect x="3" y="11" width="12" height="4" rx="1" />
              <rect x="3" y="17" width="8" height="4" rx="1" />
            </svg>
          </button>
          {isOutdoor && (
            <button
              onClick={() => navigate('/weeds/identify', { state: { mapId: map.id, mapSlug: map.slug } })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/15 text-green-700 rounded-full text-sm font-medium hover:bg-green-500/25 transition-colors map-action-desktop forced-hidden-mobile"
              title={t.weeds.identifyCard.title}
            >
              <span>🌿</span>
              <span>{t.weeds.identifyCard.title}</span>
            </button>
          )}
          {isOutdoor && (
            <button
              onClick={sun.available ? sun.toggle : undefined}
              title={sun.available
                ? t.mapPage.sun
                : 'Stel GPS-coordinaten in om de zon-modus te gebruiken'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors map-action-desktop forced-hidden-mobile ${
                sun.active
                  ? 'bg-amber-400/30 text-amber-700'
                  : sun.available
                    ? 'bg-amber-400/15 text-amber-600 hover:bg-amber-400/25'
                    : 'bg-amber-400/10 text-amber-600/40 cursor-not-allowed'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <span>{t.mapPage.sun}</span>
            </button>
          )}
          <button
            onClick={sun.toggleInspectorMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors map-action-desktop forced-hidden-mobile ${
              sun.inspectorMode
                ? 'bg-orange-500/30 text-orange-600'
                : 'bg-orange-500/15 text-orange-500 hover:bg-orange-500/25'
            }`}
          >
            <span>{t.mapPage.inspect}</span>
          </button>
          <button
            onClick={() => setShowPotPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700/15 text-amber-800 rounded-full text-sm font-medium hover:bg-amber-700/25 transition-colors map-action-desktop forced-hidden-mobile"
          >
            <span className="text-lg leading-none">+</span>
            <span>{t.mapPage.pot}</span>
          </button>
          <button
            onClick={() => navigate('/plants/add', { state: { fromMap: location.pathname } })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-full text-sm font-medium hover:bg-primary/30 transition-colors map-action-desktop forced-hidden-mobile"
          >
            <span className="text-lg leading-none">+</span>
            <span>{t.mapPage.plant}</span>
          </button>
          </div>

          {/* Mobile: Meer-knop buiten de scrollbare toolbar zodat de dropdown niet afgeknipt wordt */}
          <div className="relative forced-hidden-desktop shrink-0">
            <button
              onClick={() => setShowMoreActions(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-surface text-text-muted rounded-full text-xs font-medium hover:bg-surface/80 transition-colors border border-border map-more-trigger"
            >
              <span className="text-sm leading-none">⋮</span>
              <span className="map-more-label">{t.mapPage.options}</span>
            </button>
            {showMoreActions && (
              <>
                {/* Backdrop om dropdown te sluiten bij klik erbuiten */}
                <div onClick={() => setShowMoreActions(false)} className="fixed inset-0 z-30" />
                <div className="absolute right-0 top-full mt-1 z-40 bg-surface border border-border rounded-xl shadow-lg py-1 min-w-[140px] overflow-hidden map-more-menu">
                  {/* Water */}
                  <button
                    onClick={() => { setShowMoreActions(false); water.togglePicker() }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-bg/60 w-full text-left transition-colors"
                  >
                    <WaterStatusIcon status={water.gardenWater?.status ?? 'dry'} size={14} />
                    {t.mapPage.water}
                  </button>
                  {/* Fertilize */}
                  <button
                    onClick={() => { setShowMoreActions(false); fertilize.togglePicker() }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-bg/60 w-full text-left transition-colors"
                  >
                    <span className="text-sm">🌿</span>
                    {t.mapPage.fertilize}
                  </button>
                  <div className="h-px bg-border mx-3 my-1" />
                  {/* Labels toggle */}
                  <button
                    onClick={() => { setShowMoreActions(false); setShowLabels(v => !v) }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="4" rx="1" />
                      <rect x="3" y="11" width="12" height="4" rx="1" />
                      <rect x="3" y="17" width="8" height="4" rx="1" />
                    </svg>
                    {showLabels ? t.mapPage.labelHide : t.mapPage.labelShow}
                  </button>
                  {isOutdoor && (
                    <button
                      onClick={() => { setShowMoreActions(false); navigate('/weeds/identify', { state: { mapId: map.id, mapSlug: map.slug } }) }}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors"
                    >
                      <span className="text-sm">🌿</span>
                      {t.weeds.identifyCard.title}
                    </button>
                  )}
                  {isOutdoor && (
                    <button
                      onClick={() => { setShowMoreActions(false); if (sun.available) sun.toggle() }}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left transition-colors ${
                        sun.active
                          ? 'text-amber-700 bg-amber-400/10'
                          : sun.available
                            ? 'text-text-muted hover:bg-bg/60'
                            : 'text-text-muted/50 cursor-not-allowed'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                      </svg>
                      {t.mapPage.sun}
                    </button>
                  )}
                  <button
                    onClick={() => { setShowMoreActions(false); sun.toggleInspectorMode() }}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left transition-colors ${
                      sun.inspectorMode
                        ? 'text-orange-600 bg-orange-500/10'
                        : 'text-text-muted hover:bg-bg/60'
                    }`}
                  >
                    {t.mapPage.inspect}
                  </button>
                  <button
                    onClick={() => { setShowMoreActions(false); setShowPotPicker(true) }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors"
                  >
                    <span className="text-sm leading-none">+</span>
                    {t.mapPage.pot}
                  </button>
                  <button
                    onClick={() => { setShowMoreActions(false); navigate('/plants/add', { state: { fromMap: location.pathname } }) }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors"
                  >
                    <span className="text-sm leading-none">+</span>
                    {t.mapPage.plant}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {water.showPicker && (
        <WaterLogSheet
          pickerDate={water.pickerDate}
          onPickerDateChange={water.setPickerDate}
          busy={water.watering}
          hasExistingWatering={!!water.gardenWater?.watered_at}
          onSave={handleWaterSave}
          onDelete={handleWaterDelete}
          onClose={water.closePicker}
        />
      )}

      {fertilize.showPicker && (
        <div className="mb-2 p-3 bg-surface rounded-xl border border-border flex items-center gap-2 shrink-0">
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
            debugOverlay={
              new URLSearchParams(window.location.search).has('debug') &&
              new URLSearchParams(window.location.search).get('debug') === 'sun'
                ? <SunDebugOverlay sunPosition={sun.sunPosition} bearing={mapBearing} shadowCasters={sun.shadowCasters} />
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
      )}

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

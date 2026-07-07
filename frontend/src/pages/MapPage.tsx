import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import type { MapPlant, MapObject, CanvasData, GroundZone } from '../types'
import MapView from '../components/map/MapView'
import Glyph from '../components/ui/Glyph'
import MapTopBar from '../components/map/MapTopBar'
import MapActionCluster from '../components/map/MapActionCluster'
import MapBottomSheet, { type SheetMode } from '../components/map/MapBottomSheet'
import CareNeedsList from '../components/map/CareNeedsList'
import GlobalCareSheet from '../components/map/GlobalCareSheet'
import WeatherPill from '../components/map/WeatherPill'
import FirstRunOverlay from '../components/map/FirstRunOverlay'
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
import type { PageContext } from '../api/chat'
import { useT } from '../context/LanguageContext'
import { bucketFor } from '../utils/lightQuality'
import { isInsideZone } from '../utils/svgCoords'
import UnplacedPlantsTray from '../components/map/UnplacedPlantsTray'
import { selectUnplacedPlants, viewboxCenter } from '../components/map/unplacedPlants'
const GameSetupSheet = lazy(() => import('../components/game/GameSetupSheet'))

export default function MapPage() {
  const t = useT()
  const { slug = 'garden' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const maps = useFloreren((s) => s.maps)
  const loadMaps = useFloreren((s) => s.loadMaps)
  const allPlants = useFloreren((s) => s.plants)
  const loadPlantsStore = useFloreren((s) => s.loadPlants)
  const warningSummary = useFloreren((s) => s.warningSummary)
  const loadWarningSummary = useFloreren((s) => s.loadWarningSummary)
  const hasLoaded = useFloreren((s) => s.hasLoaded)
  const activeUserId = useFloreren((s) => s.activeUserId)
  const setAssistantPageContext = useFloreren((s) => s.setAssistantPageContext)
  useEffect(() => {
    if (allPlants.length === 0) loadPlantsStore()
  }, [loadPlantsStore])
  // Cross-garden care needs power the bottom sheet's global view.
  useEffect(() => {
    if (!warningSummary) loadWarningSummary()
  }, [loadWarningSummary])

  const mapData = useMapData(slug)
  const { refresh: refreshMapData } = mapData

  // Persist last visited map so BottomNav can return here directly.
  useEffect(() => {
    localStorage.setItem('lastMapSlug', slug)
  }, [slug])

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

  const { map, plants, objects, secondaryMarkers, groundZones, loading, patchPlant } = mapData

  const unplacedPlants = useMemo(() => selectUnplacedPlants(allPlants), [allPlants])

  const handlePlaceUnplaced = useCallback(async (plantId: number) => {
    if (!map) return
    const pos = viewboxCenter(map.viewbox)
    try {
      await clientApis.plants.setPosition(plantId, {
        map_id: map.id,
        map_x: pos.x,
        map_y: pos.y,
        ground_zone_id: null,
      })
      await Promise.all([refreshMapData(), loadPlantsStore()])
    } catch (e) {
      console.error('Failed to place plant on map', e)
    }
  }, [map, refreshMapData, loadPlantsStore])

  const [selectedPlant, setSelectedPlant] = useState<MapPlant | null>(null)
  const [selectedObject, setSelectedObject] = useState<MapObject | null>(null)
  const [selectedFixedPlant, setSelectedFixedPlant] = useState<FixedPlant | null>(null)
  // Labels are contextual by default: hidden globally to keep a dense map calm;
  // the selected plant still shows its name (see PlantsLayer), and this toggle
  // flips ALL names on. See docs/plans/2026-06-27-map-density-multiplicity-plan.md
  const [showLabels, setShowLabels] = useState(() => {
    const stored = localStorage.getItem("floreren-show-labels")
    return stored !== null ? stored === "true" : false
  })
  // Per-plant warning badges are capped to one (most-urgent) on the canvas; this
  // toggle hides them entirely. On by default. Full list lives in the sheets.
  const [showWarnings, setShowWarnings] = useState(true)
  const [biodiversityModalOpen, setBiodiversityModalOpen] = useState(false)
  const [showGameSetup, setShowGameSetup] = useState(false)
  const [showPotPicker, setShowPotPicker] = useState(false)
  const [moveMode, setMoveMode] = useState(false)
  const [targetedMove, setTargetedMove] = useState<{ plantId: number; relockAfterMove: boolean } | null>(null)
  const moveModeActive = moveMode || targetedMove !== null
  // Tap-to-place: the plant we're adding an extra spot for (null = not placing).
  const [placingPlant, setPlacingPlant] = useState<MapPlant | null>(null)

  const handleAddPlacement = useCallback((plant: MapPlant) => {
    setSelectedPlant(null)
    setPlacingPlant(plant)
  }, [])

  const handlePlacementTap = useCallback(async (x: number, y: number) => {
    if (!placingPlant || !map) return
    try {
      await clientApis.plants.addPlacement(placingPlant.id, { map_id: map.id, map_x: x, map_y: y })
      await refreshMapData()
    } catch (e) {
      console.error('Failed to add placement', e)
    } finally {
      setPlacingPlant(null)
    }
  }, [placingPlant, map, refreshMapData])

  const handleSecondaryMarkerTap = useCallback((plantId: number) => {
    const plant = plants.find((p) => p.id === plantId)
    if (plant) setSelectedPlant(plant)
    else navigate(`/plants/${plantId}`)
  }, [plants, navigate])

  const handleDeletePlacement = useCallback(async (plantId: number, placementId: number) => {
    try {
      await clientApis.plants.deletePlacement(plantId, placementId)
      await refreshMapData()
    } catch (e) {
      console.error('Failed to delete placement', e)
    }
  }, [refreshMapData])

  const handleUpdatePlacementPhase = useCallback(async (plantId: number, placementId: number, phase: string) => {
    try {
      await clientApis.plants.updatePlacement(plantId, placementId, { phase })
      await refreshMapData()
    } catch (e) {
      console.error('Failed to update placement', e)
    }
  }, [refreshMapData])

  // Arriving from another garden's care list (focusPlantId in nav state):
  // auto-open that plant's sheet once this map's plants have loaded.
  useEffect(() => {
    const focusId = (location.state as { focusPlantId?: number } | null)?.focusPlantId
    if (!focusId || plants.length === 0) return
    const plant = plants.find((p) => p.id === focusId)
    if (plant) {
      setSelectedObject(null)
      setSelectedPlant(plant)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, plants, navigate, location.pathname])

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

  // First-run onboarding: show the overlay only for genuinely-new gardens —
  // no plants anywhere, or the user's only map has no layout drawn yet. The
  // overlay itself owns dismissal + auto-dismiss once both steps are done.
  const hasZones = (canvasData?.zones?.length ?? 0) > 0
  const showFirstRun = hasLoaded && (allPlants.length === 0 || (maps.length === 1 && !hasZones))

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

  useEffect(() => {
    const context: Partial<PageContext> = { map_slug: slug }

    const applyZone = (zone: GroundZone | null | undefined) => {
      if (!zone) return
      context.ground_zone_id = zone.id
      context.ground_zone_name = zone.name
      context.ground_zone_type = zone.zone_type
    }

    const applyPoint = (x: number, y: number) => {
      context.clicked_map_x = Math.round(x * 10) / 10
      context.clicked_map_y = Math.round(y * 10) / 10
      applyZone(isInsideZone(x, y, soilGroundZones))
    }

    if (selectedPlant) {
      context.selected_plant_id = selectedPlant.id
      applyPoint(selectedPlant.map_x, selectedPlant.map_y)
      applyZone(soilGroundZones.find((zone) => zone.id === selectedPlant.ground_zone_id))
    } else if (selectedObject) {
      context.selected_object_id = selectedObject.id
      if (selectedObject.map_x != null && selectedObject.map_y != null) {
        applyPoint(selectedObject.map_x, selectedObject.map_y)
      }
    }

    const inspectorResult = sun.inspectorResult
    if (inspectorResult) {
      applyPoint(inspectorResult.x, inspectorResult.y)
      const directSunHours = inspectorResult.sunByMonth[new Date().getMonth()] ?? 0
      context.direct_sun_hours = directSunHours
      const inspectorCell = sun.cells.find((cell) =>
        inspectorResult.x >= cell.x && inspectorResult.x <= cell.x + cell.w &&
        inspectorResult.y >= cell.y && inspectorResult.y <= cell.y + cell.h
      )
      if (inspectorCell) {
        context.sky_view_factor = inspectorCell.skyOpenness
        context.light_bucket = bucketFor(directSunHours, inspectorCell.skyOpenness)
      }
    } else if (sun.tappedCell) {
      const cell = sun.tappedCell
      const x = cell.x + cell.w / 2
      const y = cell.y + cell.h / 2
      applyPoint(x, y)
      context.direct_sun_hours = cell.sunHours
      context.sky_view_factor = cell.skyOpenness
      context.light_bucket = bucketFor(cell.sunHours, cell.skyOpenness)
    }

    setAssistantPageContext(context)
    return () => setAssistantPageContext(null)
  }, [
    selectedObject,
    selectedPlant,
    setAssistantPageContext,
    slug,
    soilGroundZones,
    sun.cells,
    sun.inspectorResult,
    sun.tappedCell,
  ])

  const attentionCount = useMemo(() => {
    const containedPlants = objects.flatMap((o) => o.contained_plants ?? [])
    const all = [...plants, ...containedPlants]
    return all.filter((p) => (p.warnings?.length ?? 0) > 0 || p.top_warning !== null).length
  }, [plants, objects])

  // Once cross-garden warnings are loaded, the sheet shows every garden's
  // needs; until then it falls back to this map's own care list + count.
  const useGlobalCare = !!warningSummary
  const globalAttentionCount = useMemo(() => {
    if (!warningSummary) return attentionCount
    return warningSummary.buckets.nu.length + warningSummary.buckets.vandaag.length
  }, [warningSummary, attentionCount])

  const sheetMode: SheetMode = sun.active && isOutdoor ? 'sun' : 'care'

  const handlePlantTap = (plant: MapPlant) => {
    setSelectedObject(null)
    setSelectedPlant(plant)
  }

  // Tap a plant in the global care list: pan to it here, or jump to its garden.
  const handleGlobalPlantTap = (plantId: number, mapName: string | null) => {
    const targetMap = mapName ? maps.find((m) => m.name === mapName) : null
    if (targetMap && targetMap.slug !== slug) {
      navigate(`/map/${targetMap.slug}`, { state: { focusPlantId: plantId } })
      return
    }
    const plant = plants.find((p) => p.id === plantId)
    if (plant) handlePlantTap(plant)
    else navigate(`/plants/${plantId}`)
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

  const endMoveMode = useCallback(async () => {
    const move = targetedMove
    setMoveMode(false)
    setTargetedMove(null)
    if (move?.relockAfterMove) {
      try {
        await clientApis.plants.setLock(move.plantId, true)
      } finally {
        await refresh()
      }
    }
  }, [targetedMove, refresh])

  const handleToggleMoveMode = useCallback(() => {
    if (moveModeActive) {
      void endMoveMode()
      return
    }
    handleCloseSheet()
    setTargetedMove(null)
    setMoveMode(true)
  }, [moveModeActive, endMoveMode])

  const handleMovePlantOnMap = useCallback(async (plant: MapPlant) => {
    handleCloseSheet()
    setMoveMode(false)
    const relockAfterMove = plant.is_locked
    if (relockAfterMove) {
      await clientApis.plants.setLock(plant.id, false)
      await refresh()
    }
    setTargetedMove({ plantId: plant.id, relockAfterMove })
  }, [refresh])

  const handlePlantMoveComplete = useCallback(async (plantId: number) => {
    if (targetedMove?.plantId !== plantId) return
    const move = targetedMove
    setTargetedMove(null)
    setMoveMode(false)
    if (move.relockAfterMove) {
      await clientApis.plants.setLock(plantId, true)
    }
    await refresh()
  }, [targetedMove, refresh])

  const handleCareAction = useCallback(async () => {
    await refresh()
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
      <div className="flex flex-col h-full p-4 overflow-hidden">
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
    <div className="relative h-full [@media(orientation:landscape) and (max-height:500px)]:h-dvh overflow-hidden">
      {/* Map fills safe area between top pills and bottom sheet */}
      <div className="absolute top-12 bottom-14 left-0 right-0">
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
          moveMode={moveMode}
          movePlantId={targetedMove?.plantId ?? null}
          onPlantMoveComplete={handlePlantMoveComplete}
          onPlantUpdated={patchPlant}
          placingPlantId={placingPlant?.id ?? null}
          onPlacementTap={handlePlacementTap}
          secondaryMarkers={secondaryMarkers}
          onSecondaryMarkerTap={handleSecondaryMarkerTap}
          showLabels={showLabels}
          showWarnings={showWarnings}
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

      {/* Top-left: garden pill — z-30 so its map-switch dropdown overlays the
          unplaced-plants tray (z-20) stacked directly below it */}
      <div className="absolute top-3 left-3 z-30 landscape-mobile-hide">
        <MapTopBar map={map} allMaps={maps} showLabels={showLabels} onToggleLabels={() => setShowLabels((v: boolean) => { const next = !v; localStorage.setItem('floreren-show-labels', String(next)); return next })} showWarnings={showWarnings} onToggleWarnings={() => setShowWarnings((v: boolean) => !v)} />
      </div>

      {/* Left, below the garden pill: unplaced-plants tray */}
      <div className="absolute top-16 left-3 z-20 landscape-mobile-hide">
        <UnplacedPlantsTray plants={unplacedPlants} onPlace={handlePlaceUnplaced} />
      </div>

      {/* Action cluster: top-right in portrait, bottom-center in landscape */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 landscape-action-bottom">
        <MapActionCluster
          isOutdoor={isOutdoor}
          waterStatus={water.gardenWater?.status ?? 'dry'}
          sunActive={sun.active}
          sunAvailable={sun.available}
          inspectorMode={sun.inspectorMode}
          moveModeActive={moveModeActive}
          onWater={water.togglePicker}
          onFertilize={fertilize.togglePicker}
          onToggleSun={sun.toggle}
          onToggleInspector={sun.toggleInspectorMode}
          onToggleMoveMode={handleToggleMoveMode}
          onAddPlant={() => navigate('/plants/add', { state: { fromMap: location.pathname } })}
          onNewGame={isOutdoor ? () => setShowGameSetup(true) : undefined}
        />
        <div className="landscape-mobile-hide">
          {isOutdoor && slug && <GardenBiodiversityCard slug={slug} mode="pill" onModalOpenChange={setBiodiversityModalOpen} />}
        </div>
        {isOutdoor && mapLat != null && mapLon != null && (
          <div className="landscape-mobile-hide">
            <WeatherPill lat={mapLat} lon={mapLon} />
          </div>
        )}
      </div>

      {moveModeActive && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 landscape-mobile-hide rounded-2xl border border-border bg-surface/95 px-3.5 py-2.5 shadow-lg flex items-center gap-3 max-w-[85vw]" style={{ backdropFilter: 'blur(10px)' }}>
          <span className="font-heading text-xs text-text-soft leading-snug">
            {targetedMove ? t.mapPage.moveOnePlantHint : t.mapPage.moveModeHint}
          </span>
          <button
            type="button"
            onClick={() => void endMoveMode()}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform shrink-0"
          >
            {t.mapPage.moveModeDone}
          </button>
        </div>
      )}

      {placingPlant && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 landscape-mobile-hide rounded-2xl border border-border bg-surface/95 px-3.5 py-2.5 shadow-lg flex items-center gap-3 max-w-[85vw]" style={{ backdropFilter: 'blur(10px)' }}>
          <span className="font-heading text-xs text-text-soft leading-snug">
            {t.mapPage.placeSpotHint(placingPlant.name)}
          </span>
          <button
            type="button"
            onClick={() => setPlacingPlant(null)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-soft active:scale-95 transition-transform shrink-0"
          >
            {t.common.cancel}
          </button>
        </div>
      )}

      {/* Bottom sheet — care needs OR sun controls */}
      <div className="landscape-mobile-hide">
        <MapBottomSheet
          mode={sheetMode}
          attentionCount={useGlobalCare ? globalAttentionCount : attentionCount}
          careScope={useGlobalCare ? 'global' : 'map'}
          autoExpand={sun.active}
          hidden={biodiversityModalOpen}
          careContent={
            useGlobalCare
              ? <GlobalCareSheet currentMapName={map?.name ?? null} onPlantTap={handleGlobalPlantTap} />
              : <CareNeedsList plants={plants} objects={objects} onPlantTap={handlePlantTap} />
          }
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

      {/* Fertilize sheet */}
      {fertilize.showPicker && (
        <WaterLogSheet
          actionType="fertilize"
          pickerDate={fertilize.pickerDate}
          onPickerDateChange={fertilize.setPickerDate}
          busy={fertilize.fertilizing}
          hasExistingLog={!!fertilize.fertilize?.fertilized_at}
          onSave={handleFertilizeSave}
          onDelete={handleFertilizeDelete}
          onClose={fertilize.closePicker}
        />
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

      {selectedPlant && map && (
        <PlantQuickSheet
          plant={selectedPlant}
          objects={objects}
          soilGroundZones={soilGroundZones}
          heatmapCells={sun.cells}
          mapId={map.id}
          mapName={map.name}
          onClose={handleCloseSheet}
          onCareAction={handleCareAction}
          onAction={handleCareAction}
          onMoveOnMap={handleMovePlantOnMap}
          onDuplicate={handleDuplicate}
          onRemove={(id) => handleRemoveItem('plant', id)}
          placements={secondaryMarkers.filter((m) => m.plant_id === selectedPlant.id)}
          onAddPlacement={() => handleAddPlacement(selectedPlant)}
          onDeletePlacement={(placementId) => handleDeletePlacement(selectedPlant.id, placementId)}
          onUpdatePlacementPhase={(placementId, phase) => handleUpdatePlacementPhase(selectedPlant.id, placementId, phase)}
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
                <Glyph name="x" size={16} />
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

      {showGameSetup && map && (
        <Suspense fallback={null}>
          <GameSetupSheet
            mapId={map.id}
            mapSlug={map.slug}
            onClose={() => setShowGameSetup(false)}
          />
        </Suspense>
      )}

      {showFirstRun && map && (
        <FirstRunOverlay
          mapId={map.id}
          hasZones={hasZones}
          hasPlant={allPlants.length > 0}
          accountId={activeUserId ?? 0}
          mapType={map.map_type}
          mapLat={map.lat}
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

     1|import { useState, useCallback, useMemo } from 'react'
     2|import { useParams, useNavigate } from 'react-router-dom'
     3|import type { MapPlant, MapObject, CanvasData, GroundZone } from '../types'
     4|import { WaterStatusIcon } from '../components/PlantStatusIcon'
     5|import MapView from '../components/map/MapView'
     6|import MapLegend from '../components/map/MapLegend'
     7|import PlantQuickSheet from '../components/sheets/PlantQuickSheet'
     8|import ObjectQuickSheet from '../components/sheets/ObjectQuickSheet'
     9|import FixedPlantSheet from '../components/sheets/FixedPlantSheet'
    10|import type { FixedPlant } from '../constants/fixedPlants'
    11|import SunControls from '../components/sun/SunControls'
    12|import GrowHereSheet from '../components/sheets/GrowHereSheet'
    13|import SpotInspectorSheet from '../components/sheets/SpotInspectorSheet'
    14|import { useSunVisualization } from '../hooks/useSunVisualization'
    15|import DebugSvfOverlay from '../components/sun/DebugSvfOverlay'
    16|import SunDebugOverlay from '../components/map/SunDebugOverlay'
    17|import { useMapData } from '../hooks/useMapData'
    18|import { useGardenWater } from '../hooks/useGardenWater'
    19|import { useGardenFertilize } from '../hooks/useGardenFertilize'
    20|import { useUndoableRemove } from '../hooks/useUndoableRemove'
    21|import { useFloreren } from '../store/useFloreren'
    22|import { CONTAINER_PRESETS } from '../hooks/useEditorState'
    23|import type { ObjectPreset } from '../hooks/useEditorState'
    24|import { createObject } from '../api/client'
    25|
    26|export default function MapPage() {
    27|  const { slug = 'garden' } = useParams()
    28|  const navigate = useNavigate()
    29|  const setShowPlantPicker = useFloreren((s) => s.setShowPlantPicker)
    30|
    31|  const mapData = useMapData(slug)
    32|  const water = useGardenWater()
    33|  const fertilize = useGardenFertilize()
    34|  const undo = useUndoableRemove()
    35|
    36|  const { map, plants, objects, loading } = mapData
    37|
    38|  const [selectedPlant, setSelectedPlant] = useState<MapPlant | null>(null)
    39|  const [selectedObject, setSelectedObject] = useState<MapObject | null>(null)
    40|  const [selectedFixedPlant, setSelectedFixedPlant] = useState<FixedPlant | null>(null)
    41|  const [showLabels, setShowLabels] = useState(true)
    42|  const [showPotPicker, setShowPotPicker] = useState(false)
    43|
    44|  async function handleCreateContainer(preset: ObjectPreset) {
    45|    if (!map) return
    46|    setShowPotPicker(false)
    47|    const parts = map.viewbox.trim().split(/\s+/).map(Number)
    48|    const cx = parts.length === 4 ? parts[0] + parts[2] / 2 : 200
    49|    const cy = parts.length === 4 ? parts[1] + parts[3] / 2 : 200
    50|    await createObject({
    51|      name: preset.label,
    52|      object_type: preset.object_type,
    53|      shape: preset.shape,
    54|      category: preset.category,
    55|      material: preset.material,
    56|      color: preset.color,
    57|      map_id: map.id,
    58|      map_x: Math.round(cx),
    59|      map_y: Math.round(cy),
    60|      ...(preset.diameter_cm != null ? { diameter_cm: preset.diameter_cm } : {}),
    61|      ...(preset.width_cm != null ? { width_cm: preset.width_cm } : {}),
    62|      ...(preset.depth_cm != null ? { depth_cm: preset.depth_cm } : {}),
    63|    })
    64|    await refresh()
    65|  }
    66|
    67|  const isOutdoor = !map || map.map_type !== 'indoor'
    68|  const mapLat = map?.lat ?? undefined
    69|  const mapLon = map?.lon ?? undefined
    70|  const mapBearing = map?.bearing ?? undefined
    71|
    72|  // Parse canvas_data (must come before any useMemo that references it)
    73|  const canvasData = useMemo((): CanvasData | null => {
    74|    if (!map?.canvas_data) return null
    75|    try { return JSON.parse(map.canvas_data) as CanvasData } catch { return null }
    76|  }, [map?.canvas_data])
    77|
    78|  // Derive plantable soil zones from canvas_data
    79|  const soilGroundZones = useMemo((): GroundZone[] => {
    80|    if (!canvasData) return []
    81|    return canvasData.zones
    82|      .filter(z => z.type === 'soil')
    83|      .map(z => ({
    84|        id: z.id,
    85|        map_id: map!.id,
    86|        name: z.label || 'Grond',
    87|        zone_type: 'soil' as const,
    88|        polygon: JSON.stringify([
    89|          [z.x, z.y],
    90|          [z.x + z.width, z.y],
    91|          [z.x + z.width, z.y + z.height],
    92|          [z.x, z.y + z.height],
    93|        ]),
    94|        soil_note: null,
    95|      }))
    96|  }, [canvasData, map])
    97|
    98|  const sun = useSunVisualization({ isOutdoor, lat: mapLat, lon: mapLon, bearing: mapBearing, canvasData })
    99|
   100|  const handlePlantTap = (plant: MapPlant) => {
   101|    setSelectedObject(null)
   102|    setSelectedPlant(plant)
   103|  }
   104|
   105|  const handleObjectTap = (object: MapObject) => {
   106|    if (object.contained_plants?.length === 1) {
   107|      setSelectedObject(null)
   108|      setSelectedPlant(object.contained_plants[0])
   109|      return
   110|    }
   111|    setSelectedPlant(null)
   112|    setSelectedObject(object)
   113|  }
   114|
   115|  const handleCloseSheet = () => {
   116|    setSelectedPlant(null)
   117|    setSelectedObject(null)
   118|  }
   119|
   120|  const handleOpenDetails = (type: 'plant' | 'object', id: number) => {
   121|    if (type === 'plant') {
   122|      const plant = plants.find((p) => p.id === id)
   123|      if (plant) handlePlantTap(plant)
   124|    } else {
   125|      const obj = objects.find((o) => o.id === id)
   126|      if (obj) handleObjectTap(obj)
   127|    }
   128|  }
   129|
   130|  const { remove: mapRemove, duplicate: mapDuplicate, refresh } = mapData
   131|  const { trigger: undoTrigger } = undo
   132|
   133|  const handleCareAction = useCallback(async () => {
   134|    await refresh()
   135|    setSelectedPlant(null)
   136|  }, [refresh])
   137|
   138|  const handlePositionUpdate = useCallback(async () => {
   139|    await refresh()
   140|  }, [refresh])
   141|
   142|  const handleObjectAction = useCallback(async () => {
   143|    setSelectedObject(null)
   144|    await refresh()
   145|  }, [refresh])
   146|
   147|  const handleRemoveItem = useCallback(async (type: 'plant' | 'object', id: number) => {
   148|    const info = await mapRemove(type, id)
   149|    if (info) undoTrigger(info)
   150|  }, [mapRemove, undoTrigger])
   151|
   152|  const handleDuplicate = useCallback(async (plantId: number) => {
   153|    await mapDuplicate(plantId)
   154|  }, [mapDuplicate])
   155|
   156|  if (loading && !map) {
   157|    return (
   158|      <div className="flex flex-col h-[calc(100dvh-4rem)] p-4 overflow-hidden">
   159|        <div className="h-8 w-32 bg-surface rounded-lg animate-pulse mb-4 shrink-0" />
   160|        <div className="flex-1 bg-surface rounded-2xl animate-pulse" />
   161|      </div>
   162|    )
   163|  }
   164|
   165|  if (!map) {
   166|    return (
   167|      <div className="p-4 text-center text-text-muted">
   168|        <p>Map not found</p>
   169|      </div>
   170|    )
   171|  }
   172|
   173|  return (
   174|    <div className="flex flex-col h-[calc(100dvh-4rem)] px-4 pt-4 pb-2 overflow-hidden">
   175|      <div className="flex items-center justify-between mb-2 shrink-0">
   176|        <div className="flex items-center gap-2">
   177|          <h1 className="text-xl font-bold text-text">{map.name}</h1>
   178|          <button
   179|            onClick={() => navigate(`/maps/${map.id}/settings`)}
   180|            className="w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text transition-colors"
   181|            title="Kaart instellingen"
   182|          >
   183|            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
   184|              <circle cx="12" cy="12" r="3" />
   185|              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
   186|            </svg>
   187|          </button>
   188|        </div>
   189|        <div className="flex items-center gap-1.5">
   190|          {/* Bewater */}
   191|          <button
   192|            onClick={water.togglePicker}
   193|            title={water.gardenWater?.watered_at
   194|              ? `Laatst bewaterd: ${new Date(water.gardenWater.watered_at).toLocaleDateString('nl-NL')}`
   195|              : 'Registreer tuin bewatering'}
   196|            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 text-blue-600 rounded-full text-sm font-medium hover:bg-blue-500/25 transition-colors"
   197|          >
   198|            <WaterStatusIcon status={water.gardenWater?.status ?? 'dry'} size={14} />
   199|            <span>Bewater</span>
   200|          </button>
   201|          {/* Bemest */}
   202|          <button
   203|            onClick={fertilize.togglePicker}
   204|            title={fertilize.fertilize?.fertilized_at
   205|              ? `Laatst bemest: ${new Date(fertilize.fertilize.fertilized_at).toLocaleDateString('nl-NL')}`
   206|              : 'Registreer tuin bemesting'}
   207|            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 text-emerald-600 rounded-full text-sm font-medium hover:bg-emerald-500/25 transition-colors"
   208|          >
   209|            <span className="text-sm leading-none">🌿</span>
   210|            <span>Bemest</span>
   211|          </button>
   212|          <button
   213|            onClick={() => setShowLabels(v => !v)}
   214|            title={showLabels ? 'Verberg namen' : 'Toon namen'}
   215|            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors ${
   216|              showLabels
   217|                ? 'bg-surface text-text-muted hover:bg-surface/80'
   218|                : 'bg-primary/20 text-primary hover:bg-primary/30'
   219|            }`}
   220|          >
   221|            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
   222|              <rect x="3" y="5" width="18" height="4" rx="1" />
   223|              <rect x="3" y="11" width="12" height="4" rx="1" />
   224|              <rect x="3" y="17" width="8" height="4" rx="1" />
   225|            </svg>
   226|          </button>
   227|          {isOutdoor && (
   228|            <button
   229|              onClick={sun.toggle}
   230|              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
   231|                sun.active
   232|                  ? 'bg-amber-400/30 text-amber-700'
   233|                  : 'bg-amber-400/15 text-amber-600 hover:bg-amber-400/25'
   234|              }`}
   235|            >
   236|              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
   237|                <circle cx="12" cy="12" r="5" />
   238|                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
   239|                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
   240|                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
   241|                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
   242|              </svg>
   243|              <span>Zon</span>
   244|            </button>
   245|          )}
   246|          <button
   247|            onClick={sun.toggleInspectorMode}
   248|            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
   249|              sun.inspectorMode
   250|                ? 'bg-orange-500/30 text-orange-600'
   251|                : 'bg-orange-500/15 text-orange-500 hover:bg-orange-500/25'
   252|            }`}
   253|          >
   254|            <span>Inspecteer</span>
   255|          </button>
   256|          <button
   257|            onClick={() => setShowPotPicker(true)}
   258|            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700/15 text-amber-800 rounded-full text-sm font-medium hover:bg-amber-700/25 transition-colors"
   259|          >
   260|            <span className="text-lg leading-none">+</span>
   261|            <span>Pot</span>
   262|          </button>
   263|          <button
   264|            onClick={() => setShowPlantPicker(true)}
   265|            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-full text-sm font-medium hover:bg-primary/30 transition-colors"
   266|          >
   267|            <span className="text-lg leading-none">+</span>
   268|            <span>Plant</span>
   269|          </button>
   270|        </div>
   271|      </div>
   272|
   273|      {water.showPicker && (
   274|        <div className="mb-2 p-3 bg-surface rounded-xl border border-border flex items-center gap-2 shrink-0">
   275|          <input
   276|            type="date"
   277|            value={water.pickerDate}
   278|            max={new Date().toISOString().slice(0, 10)}
   279|            onChange={e => water.setPickerDate(e.target.value)}
   280|            className="flex-1 text-sm bg-bg border border-border rounded-lg px-2 py-1.5 text-text"
   281|          />
   282|          <button
   283|            onClick={water.save}
   284|            disabled={water.watering || !water.pickerDate}
   285|            className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50"
   286|          >
   287|            {water.watering ? '…' : 'Opslaan'}
   288|          </button>
   289|          {water.gardenWater?.watered_at && (
   290|            <button
   291|              onClick={water.deleteLast}
   292|              disabled={water.watering}
   293|              className="px-3 py-1.5 bg-overdue/10 text-overdue rounded-lg text-sm font-semibold disabled:opacity-50"
   294|            >
   295|              Wis
   296|            </button>
   297|          )}
   298|        </div>
   299|      )}
   300|
   301|      {fertilize.showPicker && (
   302|        <div className="mb-2 p-3 bg-surface rounded-xl border border-border flex items-center gap-2 shrink-0">
   303|          <span className="text-sm shrink-0">🌿</span>
   304|          <input
   305|            type="date"
   306|            value={fertilize.pickerDate}
   307|            max={new Date().toISOString().slice(0, 10)}
   308|            onChange={e => fertilize.setPickerDate(e.target.value)}
   309|            className="flex-1 text-sm bg-bg border border-border rounded-lg px-2 py-1.5 text-text"
   310|          />
   311|          <button
   312|            onClick={async () => { await fertilize.save(); }}
   313|            disabled={fertilize.fertilizing || !fertilize.pickerDate}
   314|            className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50"
   315|          >
   316|            {fertilize.fertilizing ? '…' : 'Opslaan'}
   317|          </button>
   318|          {fertilize.fertilize?.fertilized_at && (
   319|            <button
   320|              onClick={fertilize.deleteLast}
   321|              disabled={fertilize.fertilizing}
   322|              className="px-3 py-1.5 bg-overdue/10 text-overdue rounded-lg text-sm font-semibold disabled:opacity-50"
   323|            >
   324|              Wis
   325|            </button>
   326|          )}
   327|        </div>
   328|      )}
   329|
   330|      <div className="flex gap-3 flex-1 min-h-0">
   331|        <div className="flex-1 min-w-0 min-h-0 rounded-2xl overflow-hidden border border-border">
   332|          <MapView
   333|            map={map}
   334|            plants={plants}
   335|            objects={objects}
   336|            onPlantTap={handlePlantTap}
   337|            onObjectTap={handleObjectTap}
   338|            onMapTap={handleCloseSheet}
   339|            onPositionUpdate={handlePositionUpdate}
   340|            onOpenDetails={handleOpenDetails}
   341|            onRemoveItem={handleRemoveItem}
   342|            onFixedPlantTap={setSelectedFixedPlant}
   343|            showLabels={showLabels}
   344|            sunModeActive={sun.isLiveActive}
   345|            shadows={sun.shadows}
   346|            sunPosition={sun.sunPosition}
   347|            heatmapCells={sun.isHeatmapActive ? sun.cells : undefined}
   348|            heatmapCalculating={sun.isHeatmapActive ? sun.isCalculating : undefined}
   349|            heatmapLayer="sun_hours"
   350|            heatmapProfile={sun.isHeatmapActive ? sun.profile : undefined}
   351|            onHeatmapCellTap={sun.isHeatmapActive ? sun.handleCellTap : undefined}
   352|            gardenPerimeter={sun.gardenPerimeter}
   353|            gardenBounds={sun.gardenBounds}
   354|            gardenViewBox={sun.gardenViewBox}
   355|            debugOverlay={
   356|              new URLSearchParams(window.location.search).has('debug') &&
   357|              new URLSearchParams(window.location.search).get('debug') === 'sun'
   358|                ? <SunDebugOverlay sunPosition={sun.sunPosition} bearing={mapBearing} />
   359|                : sun.isHeatmapActive && sun.tappedCell
   360|                  ? <DebugSvfOverlay cell={sun.tappedCell} obstructions={sun.gardenObstructions} />
   361|                  : undefined
   362|            }
   363|          />
   364|        </div>
   365|
   366|        <div className="hidden sm:flex sm:flex-col shrink-0 min-h-0 overflow-y-auto">
   367|          <MapLegend plants={plants} objects={objects} onPlantTap={handlePlantTap} />
   368|        </div>
   369|      </div>
   370|
   371|      {isOutdoor && sun.active && (
   372|        <SunControls
   373|          viewMode={sun.viewMode}
   374|          onViewModeChange={sun.setViewMode}
   375|          selectedMonth={sun.month}
   376|          selectedHour={sun.hour}
   377|          sunPosition={sun.sunPosition}
   378|          onMonthChange={sun.setMonth}
   379|          onHourChange={sun.setHour}
   380|          onNow={sun.setToNow}
   381|          isCalculating={sun.isCalculating}
   382|          tappedCell={sun.tappedCell}
   383|          selectedProfile={sun.profile}
   384|          onProfileChange={sun.setProfile}
   385|          onGrowHere={sun.openGrowHere}
   386|        />
   387|      )}
   388|
   389|      {sun.inspectorMode && !sun.inspectorResult && !sun.inspectorLoading && (
   390|        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-black/70 text-white text-xs px-4 py-2 rounded-full pointer-events-none">
   391|          Zet de zonkaart aan en tik op een plek in de tuin
   392|        </div>
   393|      )}
   394|
   395|      {sun.inspectorResult && (
   396|        <SpotInspectorSheet
   397|          result={sun.inspectorResult}
   398|          loading={sun.inspectorLoading}
   399|          onClose={sun.clearInspector}
   400|        />
   401|      )}
   402|
   403|      {selectedPlant && (
   404|        <PlantQuickSheet
   405|          plant={selectedPlant}
   406|          objects={objects}
   407|          soilGroundZones={soilGroundZones}
   408|          heatmapCells={sun.isHeatmapActive ? sun.cells : undefined}
   409|          onClose={handleCloseSheet}
   410|          onCareAction={handleCareAction}
   411|          onAction={handleCareAction}
   412|          onDuplicate={handleDuplicate}
   413|          onRemove={(id) => handleRemoveItem('plant', id)}
   414|        />
   415|      )}
   416|
   417|      {selectedObject && (
   418|        <ObjectQuickSheet
   419|          object={selectedObject}
   420|          mapPlants={plants}
   421|          onClose={handleCloseSheet}
   422|          onAction={handleObjectAction}
   423|        />
   424|      )}
   425|
   426|      {selectedFixedPlant && (
   427|        <FixedPlantSheet
   428|          plant={selectedFixedPlant}
   429|          onClose={() => setSelectedFixedPlant(null)}
   430|        />
   431|      )}
   432|
   433|      {showPotPicker && (
   434|        <div
   435|          className="fixed inset-0 z-50 flex items-end"
   436|          onClick={() => setShowPotPicker(false)}
   437|        >
   438|          <div
   439|            className="w-full bg-bg rounded-t-2xl border-t border-border p-4 pb-8"
   440|            onClick={(e) => e.stopPropagation()}
   441|          >
   442|            <div className="flex items-center justify-between mb-4">
   443|              <h2 className="text-base font-bold text-text">Pot toevoegen</h2>
   444|              <button
   445|                onClick={() => setShowPotPicker(false)}
   446|                className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface"
   447|              >
   448|                ✕
   449|              </button>
   450|            </div>
   451|            <div className="flex flex-col gap-2">
   452|              {CONTAINER_PRESETS.map((preset) => (
   453|                <button
   454|                  key={preset.label}
   455|                  onClick={() => handleCreateContainer(preset)}
   456|                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface text-left transition-colors"
   457|                >
   458|                  <span
   459|                    className="w-8 h-8 rounded-full shrink-0"
   460|                    style={{ backgroundColor: preset.color ?? '#888' }}
   461|                  />
   462|                  <div>
   463|                    <div className="text-sm font-semibold text-text">{preset.label}</div>
   464|                    <div className="text-xs text-text-muted">
   465|                      {preset.shape === 'circle'
   466|                        ? `⌀ ${preset.diameter_cm} cm`
   467|                        : `${preset.width_cm} × ${preset.depth_cm ?? preset.width_cm} cm`}
   468|                    </div>
   469|                  </div>
   470|                </button>
   471|              ))}
   472|            </div>
   473|          </div>
   474|        </div>
   475|      )}
   476|
   477|      {sun.showGrowHere && sun.tappedCell && (
   478|        <GrowHereSheet
   479|          tappedCell={sun.tappedCell}
   480|          selectedMonth={sun.month}
   481|          mapPlants={plants}
   482|          mapId={map?.id ?? null}
   483|          onClose={sun.closeGrowHere}
   484|        />
   485|      )}
   486|
   487|      {undo.toast && (
   488|        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border rounded-full px-4 py-2.5 flex items-center gap-3 animate-slide-up">
   489|          <span className="text-sm text-text">Verwijderd: <strong>{undo.toast.label}</strong></span>
   490|          {undo.toast.canUndo && (
   491|            <button
   492|              onClick={undo.undo}
   493|              className="text-sm font-semibold text-primary hover:underline"
   494|            >
   495|              Ongedaan maken
   496|            </button>
   497|          )}
   498|        </div>
   499|      )}
   500|    </div>
   501|
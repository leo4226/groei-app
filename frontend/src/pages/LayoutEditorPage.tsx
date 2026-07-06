import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as client from '../api/client'
import { useEditorState } from '../hooks/useEditorState'
import type { CanvasData, MapInfo, MapObject, MapType } from '../types'
import EditorCanvas from '../components/editor/EditorCanvas'
import EditorToolbar from '../components/editor/EditorToolbar'
import EditorLegendPanel from '../components/editor/EditorLegendPanel'
import ZonePropertiesPanel from '../components/editor/ZonePropertiesPanel'
import WallElementPropertiesPanel from '../components/editor/WallElementPropertiesPanel'
import ShadowCasterPropertiesPanel from '../components/editor/ShadowCasterPropertiesPanel'
import ObjectPropertiesPanel from '../components/editor/ObjectPropertiesPanel'
import { useT } from '../context/LanguageContext'
import Glyph from '../components/ui/Glyph'
import { deriveGardenBounds, deriveGardenPerimeter } from '../utils/gardenFromCanvas'
import { useEditorTour, hasTourBeenSeen } from '../hooks/useEditorTour'
import EditorTour from '../components/editor/EditorTour'
import { useIsTouch } from '../hooks/useIsTouch'

export default function LayoutEditorPage() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const mapId = id ? parseInt(id, 10) : null

  const [map, setMap] = useState<MapInfo | null>(null)
  const [mapObjects, setMapObjects] = useState<MapObject[]>([])
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [previewMode, setPreviewMode] = useState(false)
  const [showSunPreview, setShowSunPreview] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [shadowMode, setShadowMode] = useState(false)

  const editor = useEditorState()
  const isTouch = useIsTouch()
  const tour = useEditorTour(mapId, editor.mapType, t.editor.tour)
  const gardenBounds = useMemo(
    () => deriveGardenBounds(editor.zones),
    [editor.zones],
  )
  const gardenPerimeter = useMemo(
    () => deriveGardenPerimeter(editor.zones),
    [editor.zones],
  )
  // React 19 StrictMode simulates Activity (off-screen) by remounting with preserved state.
  // This ref prevents re-fetching and re-calling loadCanvasData on those remounts,
  // which would overwrite the user's unsaved changes with stale server data.
  const loadedMapIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!mapId) return
    // Skip if already loaded for this map. The check inside `.then()` handles the
    // StrictMode initial double-mount (where the ref isn't set yet when both
    // effects start); this top-level check handles Activity remounts that fire
    // after the editor has real data.
    if (loadedMapIdRef.current === mapId) return
    let cancelled = false
    Promise.all([
      client.maps.byId(mapId),
      client.objects.list(),
    ]).then(([m, objs]) => {
        if (cancelled) return
        // Guard again inside .then() to handle the StrictMode double-mount race:
        // both effects start before the ref is written, but only the first to
        // complete should load.
        if (loadedMapIdRef.current === mapId) return
        loadedMapIdRef.current = mapId
        setMap(m)
        setMapObjects(objs.filter((o: MapObject) => o.map_id === mapId))
        if (m.canvas_data) {
          try {
            const data = JSON.parse(m.canvas_data) as CanvasData
            // Normalise mapType to 'outdoor'|'indoor', mapping legacy 'garden'/'house' values
            const raw = (data.mapType as string) || m.map_type
            data.mapType = (raw === 'indoor' || raw === 'house') ? 'indoor' : 'outdoor'
            editor.loadCanvasData(data)
          } catch { /* start blank */ }
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mapId])

  // Auto-start tour on first open of an empty canvas
  useEffect(() => {
    if (loading || !mapId) return
    if (editor.zones.length === 0 && !hasTourBeenSeen(mapId)) {
      tour.start()
    }
  }, [loading, mapId])

  const handleObjectMove = useCallback(async (objectId: number, x: number, y: number) => {
    setMapObjects((prev) => prev.map((o) => o.id === objectId ? { ...o, map_x: x, map_y: y } : o))
    try {
      await client.objects.setPosition(objectId, { map_x: Math.round(x * 10) / 10, map_y: Math.round(y * 10) / 10 })
    } catch {
      const objs = await client.objects.list()
      setMapObjects(objs.filter((o: MapObject) => o.map_id === mapId))
    }
  }, [mapId])

  const handleObjectRotate = useCallback(async (objectId: number, rotation: number) => {
    setMapObjects((prev) => prev.map((o) => o.id === objectId ? { ...o, rotation } : o))
    try {
      await client.objects.update(objectId, { rotation })
    } catch {
      const objs = await client.objects.list()
      setMapObjects(objs.filter((o: MapObject) => o.map_id === mapId))
    }
  }, [mapId])

  const isSavingRef = useRef(false)

  useEffect(() => {
    setSaveStatus(editor.isDirty ? 'unsaved' : 'saved')
  }, [editor.isDirty])

  // Save + navigate helper — used by back/exit buttons
  const handleExit = useCallback(
    async (url: string) => {
      if (!editor.isDirty || !mapId || isSavingRef.current) {
        navigate(url)
        return
      }
      isSavingRef.current = true
      setSaveStatus('saving')
      try {
        await client.maps.update(mapId, { canvas_data: JSON.stringify(editor.toCanvasData()) })
        editor.markClean()
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
      isSavingRef.current = false
      navigate(url)
    },
    [mapId, editor.isDirty, editor.markClean, editor.toCanvasData, navigate],
  )

  // Warn on tab close / refresh when unsaved
  useEffect(() => {
    if (!editor.isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editor.isDirty])

  function handleDelete() {
    if (editor.selectedWallElementId) {
      editor.deleteWallElement(editor.selectedWallElementId)
    } else if (editor.selectedZoneId) {
      editor.deleteZone(editor.selectedZoneId)
    } else if (editor.selectedShadowCasterId) {
      editor.deleteShadowCaster(editor.selectedShadowCasterId)
    } else if (selectedObjectId !== null) {
      client.objects.archive(selectedObjectId).then(() => {
        setMapObjects((prev) => prev.filter((o) => o.id !== selectedObjectId))
        setSelectedObjectId(null)
        editor.setTool('select')
      }).catch(() => {})
    }
  }

  // Auto-fence: add 4 fence segments fully enclosing the garden's bounding box (#21).
  function fenceTheGarden() {
    if (!gardenBounds) return
    if (editor.zones.some((z) => z.type === 'fence') &&
        !window.confirm('Er staan al hekken. Toch een omheining rondom de tuin toevoegen?')) return
    const { minX, minY, maxX, maxY } = gardenBounds
    const OFFSET = 3   // gap between the garden edge and the fence
    const THIN = 10    // fence footprint thickness (px)
    const W = maxX - minX
    const top = minY - OFFSET - THIN
    const left = minX - OFFSET - THIN
    const right = maxX + OFFSET
    const outerH = (maxY - minY) + 2 * (OFFSET + THIN)   // verticals span past the corners
    editor.addZone(minX, top, W, THIN, 'fence')          // top
    editor.addZone(minX, maxY + OFFSET, W, THIN, 'fence') // bottom
    editor.addZone(left, top, THIN, outerH, 'fence')     // left
    editor.addZone(right, top, THIN, outerH, 'fence')    // right
    editor.setTool('select')
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName

      // Ctrl+Z / Cmd+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        editor.undo()
        return
      }

      // Delete / Backspace — remove selected element
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (editor.selectedWallElementId) {
          e.preventDefault()
          editor.deleteWallElement(editor.selectedWallElementId)
        } else if (editor.selectedZoneId) {
          e.preventDefault()
          editor.deleteZone(editor.selectedZoneId)
        } else if (editor.selectedShadowCasterId) {
          e.preventDefault()
          editor.deleteShadowCaster(editor.selectedShadowCasterId)
        } else if (selectedObjectId !== null) {
          e.preventDefault()
          client.objects.archive(selectedObjectId).then(() => {
            setMapObjects((prev) => prev.filter((o) => o.id !== selectedObjectId))
            setSelectedObjectId(null)
            editor.setTool('select')
          }).catch(() => {})
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editor.selectedZoneId, editor.selectedWallElementId, editor.selectedShadowCasterId, selectedObjectId, editor.deleteZone, editor.deleteWallElement, editor.deleteShadowCaster, editor.undo])

  const selectedZone = editor.zones.find((z) => z.id === editor.selectedZoneId) ?? null
  const selectedWallElement = editor.wallElements.find((w) => w.id === editor.selectedWallElementId) ?? null
  const selectedShadowCaster = editor.shadowCasters.find((s) => s.id === editor.selectedShadowCasterId) ?? null
  const selectedObject = mapObjects.find((o) => o.id === selectedObjectId) ?? null

  if (loading) return <div className="p-6 text-text-muted text-center">{t.editor.loading}</div>
  if (!map) return <div className="p-6 text-overdue text-center">{t.editor.notFound}</div>

  return (
    <div className="flex flex-col h-dvh relative">{/* full viewport — app chrome hidden on the editor route */}
      {/* Header — desktop only; mobile uses floating chrome (below) */}
      <div className={`flex items-center gap-3 px-4 py-2 bg-surface border-b border-border ${isTouch ? 'hidden' : ''}`}>
        <button onClick={() => handleExit('/maps')} className="text-text-muted text-sm shrink-0">
          {t.editor.toolbar.back}
        </button>
        <h1 className="text-sm font-semibold text-text flex-1 truncate">{map.name}</h1>

        {/* Desktop: "Bekijken →" button */}
        <button
          onClick={() => handleExit(`/map/${map.slug}`)}
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 hover:bg-bg forced-hidden-mobile"
        >
          Bekijken →
        </button>

        {/* Desktop: Undo button */}
        <button
          onClick={editor.undo}
          disabled={!editor.canUndo}
          title="Ctrl+Z"
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-bg forced-hidden-mobile"
        >
          ↩ {t.editor.toolbar.undo}
        </button>

        {/* Desktop: Tour replay button */}
        <button
          onClick={tour.start}
          title="Rondleiding"
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 hover:bg-bg forced-hidden-mobile"
        >
          ?
        </button>

        {/* Preview/Edit toggle — visible on both */}
        <button
          onClick={() => setPreviewMode((p) => !p)}
          className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 ${
            previewMode
              ? 'bg-primary text-white border-primary'
              : 'text-text-muted border-border'
          }`}
        >
          {previewMode ? t.editor.toolbar.edit : t.editor.toolbar.preview}
        </button>

        {/* Desktop: Sun perimeter preview toggle — outdoor maps only */}
        {editor.mapType === 'outdoor' && (
          <button
            onClick={() => setShowSunPreview((p) => !p)}
            className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 transition-colors forced-hidden-mobile ${
              showSunPreview
                ? 'bg-amber-500 text-amber-950 border-amber-500'
                : 'text-text-muted border-border'
            }`}
            title="Toon zon-perimeter"
          >
            <Glyph name="sun" size={13} className="inline-block align-[-1px] mr-1" />{showSunPreview ? 'Aan' : 'Uit'}
          </button>
        )}

        {/* Mobile: more actions dropdown */}
        <div className="relative forced-hidden-desktop shrink-0">
          <button
            onClick={() => setShowMoreActions(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-surface text-text-muted rounded-full text-xs font-medium hover:bg-surface/80 transition-colors border border-border"
          >
            <span className="text-sm leading-none">⋮</span>
            <span className="map-more-label">Meer</span>
          </button>
          {showMoreActions && (
            <>
              <div onClick={() => setShowMoreActions(false)} className="fixed inset-0 z-30" />
              <div className="absolute right-0 top-full mt-1 z-40 bg-surface border border-border rounded-xl shadow-lg py-1 min-w-[140px] overflow-hidden">
                {/* Bekijken → */}
                <button
                  onClick={() => { setShowMoreActions(false); handleExit(`/map/${map.slug}`) }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text hover:bg-bg/60 w-full text-left transition-colors"
                >
                  Bekijken →
                </button>
                {/* Undo */}
                <button
                  onClick={() => { setShowMoreActions(false); editor.undo() }}
                  disabled={!editor.canUndo}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text hover:bg-bg/60 w-full text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↩ {t.editor.toolbar.undo}
                </button>
                {/* Tour */}
                <button
                  onClick={() => { setShowMoreActions(false); tour.start() }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text hover:bg-bg/60 w-full text-left transition-colors"
                >
                  ? Rondleiding
                </button>
                {/* Sun preview — outdoor only */}
                {editor.mapType === 'outdoor' && (
                  <>
                    <div className="mx-2 my-1 h-px bg-border" />
                    <button
                      onClick={() => { setShowMoreActions(false); setShowSunPreview((p) => !p) }}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-600 hover:bg-bg/60 w-full text-left transition-colors"
                    >
                      <Glyph name="sun" size={13} className="inline-block align-[-1px] mr-1" />{showSunPreview ? 'Zon-perimeter uit' : 'Toon zon-perimeter'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <span className={`text-xs shrink-0 ${
          saveStatus === 'saved' ? 'text-primary' :
          saveStatus === 'saving' ? 'text-text-muted' :
          'text-pumpkin-swirl'
        }`}>
          {saveStatus === 'saved' ? t.editor.save.saved : saveStatus === 'saving' ? t.editor.save.saving : t.editor.save.unsaved}
        </span>
      </div>

      {/* Desktop toolbar — in-flow, hidden in preview mode. Mobile gets a floating dock below. */}
      {!previewMode && !isTouch && (
        <EditorToolbar
          activeTool={editor.activeTool}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          selectedShadowCasterId={editor.selectedShadowCasterId}
          selectedObjectId={selectedObjectId}
          onSetTool={editor.setTool}
          onDelete={handleDelete}
        />
      )}

      {/* ── Mobile floating chrome over the full-screen canvas ───────────── */}
      {isTouch && (
        <>
          {/* Back — top-left */}
          <button
            onClick={() => handleExit('/maps')}
            aria-label={t.editor.toolbar.back}
            className="absolute top-3 left-3 z-40 w-10 h-10 rounded-full bg-surface/85 backdrop-blur-md border border-border shadow-lg flex items-center justify-center text-text-muted"
          >
            <Glyph name="arrow-left" size={20} />
          </button>

          {/* Cluster — top-right: save status + preview toggle + more menu */}
          <div className="absolute top-3 right-3 z-40 flex items-center gap-1.5">
            <span className={`px-2 py-1 rounded-full text-[10px] font-medium bg-surface/85 backdrop-blur-md border border-border shadow ${
              saveStatus === 'saved' ? 'text-primary' : saveStatus === 'saving' ? 'text-text-muted' : 'text-pumpkin-swirl'
            }`}>
              {saveStatus === 'saved' ? t.editor.save.saved : saveStatus === 'saving' ? t.editor.save.saving : t.editor.save.unsaved}
            </span>
            <button
              onClick={() => setPreviewMode((p) => !p)}
              aria-label={previewMode ? t.editor.toolbar.edit : t.editor.toolbar.preview}
              className={`w-10 h-10 rounded-full backdrop-blur-md border shadow-lg flex items-center justify-center text-base ${
                previewMode ? 'bg-primary text-white border-primary' : 'bg-surface/85 text-text-muted border-border'
              }`}
            >
              <Glyph name={previewMode ? 'edit' : 'eye'} size={18} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreActions(v => !v)}
                aria-label="Meer"
                className="w-10 h-10 rounded-full bg-surface/85 backdrop-blur-md border border-border shadow-lg flex items-center justify-center text-text-muted text-lg leading-none"
              >
                ⋮
              </button>
              {showMoreActions && (
                <>
                  <div onClick={() => setShowMoreActions(false)} className="fixed inset-0 z-30" />
                  <div className="absolute right-0 top-full mt-1 z-40 bg-surface border border-border rounded-xl shadow-lg py-1 min-w-[180px] overflow-hidden">
                    <button onClick={() => { setShowMoreActions(false); handleExit(`/map/${map.slug}`) }}
                      className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-text hover:bg-bg/60 w-full text-left">Bekijken →</button>
                    <button onClick={() => { setShowMoreActions(false); editor.undo() }} disabled={!editor.canUndo}
                      className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-text hover:bg-bg/60 w-full text-left disabled:opacity-30">↩ {t.editor.toolbar.undo}</button>
                    <button onClick={() => { setShowMoreActions(false); tour.start() }}
                      className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-text hover:bg-bg/60 w-full text-left">? Rondleiding</button>
                    {editor.mapType === 'outdoor' && (
                      <>
                        <div className="mx-2 my-1 h-px bg-border" />
                        <button onClick={() => { setShowMoreActions(false); setShowSunPreview((p) => !p) }}
                          className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-amber-600 hover:bg-bg/60 w-full text-left"><Glyph name="sun" size={13} className="shrink-0" /> {showSunPreview ? 'Zon-perimeter uit' : 'Toon zon-perimeter'}</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tool dock — bottom-centre (thumb zone): tools + the mode/zone picker */}
          {!previewMode && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
              <EditorToolbar
                floating
                activeTool={editor.activeTool}
                selectedZoneId={editor.selectedZoneId}
                selectedWallElementId={editor.selectedWallElementId}
                selectedShadowCasterId={editor.selectedShadowCasterId}
                selectedObjectId={selectedObjectId}
                onSetTool={editor.setTool}
                onDelete={handleDelete}
              />
              {/* Mode + zone-type picker (opens the legend panel) */}
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label={t.editor.legend}
                className={`w-11 h-11 rounded-2xl backdrop-blur-md border shadow-lg flex items-center justify-center ${
                  sidebarOpen ? 'bg-primary text-white border-primary' : 'bg-surface/90 text-text-muted border-border'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* Canvas + sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <EditorCanvas
          zones={editor.zones}
          wallElements={editor.wallElements}
          objects={mapObjects}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          activeTool={editor.activeTool}
          activeZoneType={editor.activeZoneType}
          objectPreset={editor.objectPreset}
          shadowCasterPreset={editor.shadowCasterPreset}
          scalePxPerM={editor.scalePxPerM}
          previewMode={previewMode}
          mapType={editor.mapType}
          mapId={mapId}
          onAddZone={editor.addZone}
          onUpdateZone={editor.updateZone}
          onUpdateWallElement={editor.updateWallElement}
          onSelectZone={editor.selectZone}
          onSelectWallElement={editor.selectWallElement}
          onPlaceWallElement={editor.addWallElement}
          selectedObjectId={selectedObjectId}
          onMoveObject={handleObjectMove}
          onRotateObject={handleObjectRotate}
          onSelectObject={setSelectedObjectId}
          onObjectCreated={() => {
            if (!mapId) return
            client.objects.list().then((objs) => setMapObjects(objs.filter((o: MapObject) => o.map_id === mapId)))
          }}
          onPlaceObject={(preset, svgX, svgY) => {
            if (!map) return
            client.objects.create({
              name: preset.label,
              object_type: preset.object_type,
              shape: preset.shape,
              category: preset.category,
              material: preset.material,
              color: preset.color,
              map_id: map.id,
              map_x: Math.round(svgX),
              map_y: Math.round(svgY),
              ...(preset.diameter_cm != null ? { diameter_cm: preset.diameter_cm } : {}),
              ...(preset.width_cm != null ? { width_cm: preset.width_cm } : {}),
              ...(preset.depth_cm != null ? { depth_cm: preset.depth_cm } : {}),
            }).then(() => {
              client.objects.list().then((objs) => setMapObjects(objs.filter((o: MapObject) => o.map_id === map.id)))
              editor.setObjectPreset(null)
            })
          }}
          shadowCasters={editor.shadowCasters}
          selectedShadowCasterId={editor.selectedShadowCasterId}
          onAddShadowCaster={editor.addShadowCaster}
          onUpdateShadowCaster={editor.updateShadowCaster}
          onSelectShadowCaster={editor.selectShadowCaster}
          showSunPreview={showSunPreview}
          perimeterPolygon={showSunPreview ? gardenPerimeter : null}
          shadowMode={shadowMode}
        />

        {!previewMode && (
          <>
            {/* Toggle button — narrow desktop only; touch uses the picker in the bottom dock */}
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className={`lg:hidden fixed top-20 right-3 z-40 w-10 h-10 rounded-xl bg-surface border border-border shadow-lg flex items-center justify-center text-text-muted ${isTouch ? 'hidden' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {sidebarOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>

            {/* Overlay backdrop — mobile only */}
            {sidebarOpen && (
              <div
                className="lg:hidden fixed inset-0 z-40 bg-black/30"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Sidebar panel */}
            <div
              className={`w-56 lg:w-56 flex flex-col bg-surface border-l border-border overflow-y-auto shrink-0 ${
                sidebarOpen
                  ? 'fixed right-0 top-0 bottom-0 z-50 shadow-2xl'
                  : 'hidden lg:flex'
              }`}
            >
            <EditorLegendPanel
              activeZoneType={editor.activeZoneType}
              activeTool={editor.activeTool}
              mapType={editor.mapType}
              objectPreset={editor.objectPreset}
              shadowCasterPreset={editor.shadowCasterPreset}
              onSetZoneType={editor.setZoneType}
              onSetTool={editor.setTool}
              onSetMapType={(t) => editor.setMapType(t as MapType)}
              onSetObjectPreset={editor.setObjectPreset}
              onSetShadowCasterPreset={editor.setShadowCasterPreset}
              shadowMode={shadowMode}
              onSetShadowMode={setShadowMode}
              canFenceGarden={!!gardenBounds}
              onFenceGarden={fenceTheGarden}
            />
            {selectedZone && !selectedWallElement && (
              <ZonePropertiesPanel
                zone={selectedZone}
                scalePxPerM={editor.scalePxPerM}
                onUpdate={(updates) => editor.updateZone(selectedZone.id, updates)}
                onSetScale={editor.setScalePxPerM}
                onDelete={handleDelete}
              />
            )}
            {selectedWallElement && (
              <WallElementPropertiesPanel
                element={selectedWallElement}
                onUpdate={(updates) => editor.updateWallElement(selectedWallElement.id, updates)}
                onDelete={handleDelete}
              />
            )}
            {selectedShadowCaster && (
              <ShadowCasterPropertiesPanel
                caster={selectedShadowCaster}
                scalePxPerM={editor.scalePxPerM}
                gardenBounds={gardenBounds ?? { minX: 0, minY: 0, maxX: 680, maxY: 680 }}
                onUpdate={(updates) => editor.updateShadowCaster(selectedShadowCaster.id, updates)}
                onDelete={handleDelete}
              />
            )}
            {selectedObject && (
              <ObjectPropertiesPanel
                object={selectedObject}
                onRotate={(rotation) => handleObjectRotate(selectedObject.id, rotation)}
                onDelete={handleDelete}
              />
            )}

            {/* Shadow caster list — shows all casters including off-canvas ones */}
            {editor.shadowCasters.length > 0 && (
              <div className="p-3 border-b border-border">
                <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">
                  Schaduw objecten ({editor.shadowCasters.length})
                </p>
                <div className="flex flex-col gap-0.5">
                  {editor.shadowCasters.map((sc) => {
                    const isSelected = sc.id === editor.selectedShadowCasterId
                    const isRect = sc.type === 'rect'
                    const scx = sc.type === 'rect' ? sc.x : sc.type === 'circle' ? sc.cx : sc.points[0]?.[0] ?? 0
                    const scy = sc.type === 'rect' ? sc.y : sc.type === 'circle' ? sc.cy : sc.points[0]?.[1] ?? 0
                    const onCanvas = scx >= -50 && scx <= 730 && scy >= -50 && scy <= 730
                    return (
                      <button
                        key={sc.id}
                        onClick={() => {
                          editor.selectShadowCaster(sc.id)
                          editor.setTool('select')
                        }}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-primary/10 ring-1 ring-primary/30'
                            : 'hover:bg-bg'
                        }`}
                      >
                        {/* Type icon */}
                        <span className="shrink-0 text-text-muted">
                          <Glyph name={isRect ? 'home' : 'tree'} size={13} />
                        </span>
                        {/* Name */}
                        <span className={`flex-1 truncate ${isSelected ? 'font-semibold text-text' : 'text-text-muted'}`}>
                          {sc.label || (isRect ? 'Gebouw' : 'Boom')}
                        </span>
                        {/* Off-canvas indicator */}
                        {!onCanvas && (
                          <span className="shrink-0 text-[9px] text-pumpkin-swirl" title="Buiten canvas">
                            ◈
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      <EditorTour
        tour={tour}
        onNavigateToSettings={() => navigate(`/maps/${mapId}/settings`)}
      />
    </div>
  )
}

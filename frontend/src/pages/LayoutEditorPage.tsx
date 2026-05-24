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
import { deriveGardenBounds, deriveGardenPerimeter } from '../utils/gardenFromCanvas'
import { useEditorTour, hasTourBeenSeen } from '../hooks/useEditorTour'
import EditorTour from '../components/editor/EditorTour'

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

  const editor = useEditorState()
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

  const doSave = useCallback(
    async (data: CanvasData) => {
      if (!mapId) return
      setSaveStatus('saving')
      try {
        await client.maps.update(mapId, { canvas_data: JSON.stringify(data) })
        editor.markClean()
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
    },
    [mapId, editor.markClean]
  )

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
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border">
        <button onClick={() => handleExit('/dashboard')} className="text-text-muted text-sm shrink-0">
          {t.editor.toolbar.back}
        </button>
        <h1 className="text-sm font-semibold text-text flex-1 truncate">{map.name}</h1>

        <button
          onClick={() => handleExit(`/map/${map.slug}`)}
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 hover:bg-bg"
        >
          Bekijken →
        </button>

        {/* Undo button */}
        <button
          onClick={editor.undo}
          disabled={!editor.canUndo}
          title="Ctrl+Z"
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-bg"
        >
          ↩ {t.editor.toolbar.undo}
        </button>

        {/* Tour replay button */}
        <button
          onClick={tour.start}
          title="Rondleiding"
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 hover:bg-bg"
        >
          ?
        </button>

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

        {/* Sun perimeter preview toggle — outdoor maps only */}
        {editor.mapType === 'outdoor' && (
          <button
            onClick={() => setShowSunPreview((p) => !p)}
            className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 transition-colors ${
              showSunPreview
                ? 'bg-amber-500 text-amber-950 border-amber-500'
                : 'text-text-muted border-border'
            }`}
            title="Toon zon-perimeter"
          >
            ☀ {showSunPreview ? 'Aan' : 'Uit'}
          </button>
        )}

        <span className={`text-xs shrink-0 ${
          saveStatus === 'saved' ? 'text-primary' :
          saveStatus === 'saving' ? 'text-text-muted' :
          'text-pumpkin-swirl'
        }`}>
          {saveStatus === 'saved' ? t.editor.save.saved : saveStatus === 'saving' ? t.editor.save.saving : t.editor.save.unsaved}
        </span>
      </div>

      {/* Toolbar — hidden in preview mode */}
      {!previewMode && (
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
          shadowCasters={editor.shadowCasters}
          selectedShadowCasterId={editor.selectedShadowCasterId}
          onAddShadowCaster={editor.addShadowCaster}
          onUpdateShadowCaster={editor.updateShadowCaster}
          onSelectShadowCaster={editor.selectShadowCaster}
          showSunPreview={showSunPreview}
          perimeterPolygon={showSunPreview ? gardenPerimeter : null}
        />

        {!previewMode && (
          <>
            {/* Toggle button — mobile only */}
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="lg:hidden fixed top-20 right-3 z-40 w-10 h-10 rounded-xl bg-surface border border-border shadow-lg flex items-center justify-center text-text-muted"
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
              onSetZoneType={editor.setZoneType}
              onSetTool={editor.setTool}
              onSetMapType={(t) => editor.setMapType(t as MapType)}
              onSetObjectPreset={editor.setObjectPreset}
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
                        <span className="shrink-0 text-[10px]">
                          {isRect ? '🏢' : '🌳'}
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

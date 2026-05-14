import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMapById, updateMap, fetchObjects, updateObjectPosition, archiveObject, updateObject } from '../api/client'
import { useEditorState } from '../hooks/useEditorState'
import type { CanvasData, MapInfo, MapObject } from '../types'
import EditorCanvas from '../components/editor/EditorCanvas'
import EditorToolbar from '../components/editor/EditorToolbar'
import EditorLegendPanel from '../components/editor/EditorLegendPanel'
import ZonePropertiesPanel from '../components/editor/ZonePropertiesPanel'
import WallElementPropertiesPanel from '../components/editor/WallElementPropertiesPanel'
import ShadowCasterPropertiesPanel from '../components/editor/ShadowCasterPropertiesPanel'
import ObjectPropertiesPanel from '../components/editor/ObjectPropertiesPanel'
import { useT } from '../context/LanguageContext'
import { deriveGardenBounds } from '../utils/gardenFromCanvas'

export default function LayoutEditorPage() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const mapId = id ? parseInt(id, 10) : null

  const [map, setMap] = useState<MapInfo | null>(null)
  const [objects, setObjects] = useState<MapObject[]>([])
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [previewMode, setPreviewMode] = useState(false)

  const editor = useEditorState()
  const gardenBounds = useMemo(
    () => deriveGardenBounds(editor.zones),
    [editor.zones],
  )
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!mapId) return
    Promise.all([
      fetchMapById(mapId),
      fetchObjects(),
    ]).then(([m, objs]) => {
        setMap(m)
        setObjects(objs.filter((o: MapObject) => o.map_id === mapId))
        if (m.canvas_data) {
          try {
            const data = JSON.parse(m.canvas_data) as CanvasData
            data.mapType = m.map_type
            editor.loadCanvasData(data)
          } catch { /* start blank */ }
        }
      })
      .finally(() => setLoading(false))
  }, [mapId])

  const handleObjectMove = useCallback(async (objectId: number, x: number, y: number) => {
    setObjects((prev) => prev.map((o) => o.id === objectId ? { ...o, map_x: x, map_y: y } : o))
    try {
      await updateObjectPosition(objectId, { map_x: Math.round(x * 10) / 10, map_y: Math.round(y * 10) / 10 })
    } catch {
      const objs = await fetchObjects()
      setObjects(objs.filter((o: MapObject) => o.map_id === mapId))
    }
  }, [mapId])

  const handleObjectRotate = useCallback(async (objectId: number, rotation: number) => {
    setObjects((prev) => prev.map((o) => o.id === objectId ? { ...o, rotation } : o))
    try {
      await updateObject(objectId, { rotation })
    } catch {
      const objs = await fetchObjects()
      setObjects(objs.filter((o: MapObject) => o.map_id === mapId))
    }
  }, [mapId])

  const doSave = useCallback(
    async (data: CanvasData) => {
      if (!mapId) return
      setSaveStatus('saving')
      try {
        await updateMap(mapId, { canvas_data: JSON.stringify(data) })
        editor.markClean()
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
    },
    [mapId, editor.markClean]
  )

  useEffect(() => {
    if (!editor.isDirty) return
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      doSave(editor.toCanvasData())
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [editor.isDirty, editor.zones, editor.wallElements, editor.shadowCasters, editor.scalePxPerM, editor.mapType, doSave, editor.toCanvasData])

  function handleDelete() {
    if (editor.selectedWallElementId) {
      editor.deleteWallElement(editor.selectedWallElementId)
    } else if (editor.selectedZoneId) {
      editor.deleteZone(editor.selectedZoneId)
    } else if (editor.selectedShadowCasterId) {
      editor.deleteShadowCaster(editor.selectedShadowCasterId)
    } else if (selectedObjectId !== null) {
      archiveObject(selectedObjectId).then(() => {
        setObjects((prev) => prev.filter((o) => o.id !== selectedObjectId))
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
          archiveObject(selectedObjectId).then(() => {
            setObjects((prev) => prev.filter((o) => o.id !== selectedObjectId))
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
  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? null

  if (loading) return <div className="p-6 text-text-muted text-center">{t.editor.loading}</div>
  if (!map) return <div className="p-6 text-overdue text-center">{t.editor.notFound}</div>

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border">
        <button onClick={() => navigate('/dashboard')} className="text-text-muted text-sm shrink-0">
          {t.editor.toolbar.back}
        </button>
        <h1 className="text-sm font-semibold text-text flex-1 truncate">{map.name}</h1>

        <button
          onClick={() => navigate(`/map/${map.slug}`)}
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
          objects={objects}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          activeTool={editor.activeTool}
          activeZoneType={editor.activeZoneType}
          objectPreset={editor.objectPreset}
          scalePxPerM={editor.scalePxPerM}
          previewMode={previewMode}
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
            fetchObjects().then((objs) => setObjects(objs.filter((o: MapObject) => o.map_id === mapId)))
          }}
          shadowCasters={editor.shadowCasters}
          selectedShadowCasterId={editor.selectedShadowCasterId}
          onAddShadowCaster={editor.addShadowCaster}
          onUpdateShadowCaster={editor.updateShadowCaster}
          onSelectShadowCaster={editor.selectShadowCaster}
        />

        {!previewMode && (
          <div className="w-56 flex flex-col bg-surface border-l border-border overflow-y-auto shrink-0">
            <EditorLegendPanel
              activeZoneType={editor.activeZoneType}
              activeTool={editor.activeTool}
              mapType={editor.mapType}
              objectPreset={editor.objectPreset}
              onSetZoneType={editor.setZoneType}
              onSetTool={editor.setTool}
              onSetMapType={(t) => editor.setMapType(t as import('../types').MapType)}
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
                gardenBounds={gardenBounds}
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
                    const scx = isRect ? sc.x : sc.cx
                    const scy = isRect ? sc.y : sc.cy
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
        )}
      </div>
    </div>
  )
}

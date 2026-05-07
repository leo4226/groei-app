import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMapById, updateMap } from '../api/client'
import { useEditorState } from '../hooks/useEditorState'
import type { CanvasData, MapInfo } from '../types'
import EditorCanvas from '../components/editor/EditorCanvas'
import EditorToolbar from '../components/editor/EditorToolbar'
import ZonePropertiesPanel from '../components/editor/ZonePropertiesPanel'
import WallElementPropertiesPanel from '../components/editor/WallElementPropertiesPanel'

export default function LayoutEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const mapId = id ? parseInt(id, 10) : null

  const [map, setMap] = useState<MapInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [previewMode, setPreviewMode] = useState(false)
  const [exporting, setExporting] = useState(false)

  const editor = useEditorState()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!mapId) return
    fetchMapById(mapId)
      .then((m) => {
        setMap(m)
        if (m.canvas_data) {
          try {
            editor.loadCanvasData(JSON.parse(m.canvas_data) as CanvasData)
          } catch { /* start blank */ }
        }
      })
      .finally(() => setLoading(false))
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
  }, [editor.isDirty, editor.zones, editor.wallElements, editor.scalePxPerM, editor.mapType, doSave, editor.toCanvasData])

  async function handleExport() {
    if (!mapId) return
    setExporting(true)
    try {
      const res = await fetch(`/api/maps/${mapId}/render-svg`, { method: 'POST' })
      if (!res.ok) throw new Error('Export failed')
      setSaveStatus('saved')
    } catch {
      alert('SVG export failed')
    } finally {
      setExporting(false)
    }
  }

  function handleDelete() {
    if (editor.selectedWallElementId) {
      editor.deleteWallElement(editor.selectedWallElementId)
    } else if (editor.selectedZoneId) {
      editor.deleteZone(editor.selectedZoneId)
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
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editor.selectedZoneId, editor.selectedWallElementId, editor.deleteZone, editor.deleteWallElement, editor.undo])

  const selectedZone = editor.zones.find((z) => z.id === editor.selectedZoneId) ?? null
  const selectedWallElement = editor.wallElements.find((w) => w.id === editor.selectedWallElementId) ?? null

  if (loading) return <div className="p-6 text-text-muted text-center">Loading editor...</div>
  if (!map) return <div className="p-6 text-overdue text-center">Map not found</div>

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border">
        <button onClick={() => navigate('/maps')} className="text-text-muted text-sm shrink-0">
          ← Back
        </button>
        <h1 className="text-sm font-semibold text-text flex-1 truncate">{map.name}</h1>

        {/* Map type toggle */}
        <div className="flex items-center gap-0.5 shrink-0 bg-bg border border-border rounded-lg p-0.5">
          <button
            onClick={() => editor.setMapType('garden')}
            className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
              editor.mapType === 'garden'
                ? 'bg-primary text-white'
                : 'text-text-muted'
            }`}
          >
            🌿 Tuin
          </button>
          <button
            onClick={() => editor.setMapType('house')}
            className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
              editor.mapType === 'house'
                ? 'bg-primary text-white'
                : 'text-text-muted'
            }`}
          >
            🏠 Huis
          </button>
        </div>

        {/* Undo button */}
        <button
          onClick={editor.undo}
          disabled={!editor.canUndo}
          title="Undo (Ctrl+Z)"
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-muted shrink-0 disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-bg"
        >
          ↩ Undo
        </button>

        <button
          onClick={() => setPreviewMode((p) => !p)}
          className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 ${
            previewMode
              ? 'bg-primary text-white border-primary'
              : 'text-text-muted border-border'
          }`}
        >
          {previewMode ? 'Editing' : 'Preview'}
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="text-xs px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/5 text-primary shrink-0 disabled:opacity-50"
        >
          {exporting ? '...' : 'Export SVG'}
        </button>
        <span className={`text-xs shrink-0 ${
          saveStatus === 'saved' ? 'text-primary' :
          saveStatus === 'saving' ? 'text-text-muted' :
          'text-orange-500'
        }`}>
          {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
        </span>
      </div>

      {/* Toolbar — hidden in preview mode */}
      {!previewMode && (
        <EditorToolbar
          activeTool={editor.activeTool}
          activeZoneType={editor.activeZoneType}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          mapType={editor.mapType}
          onSetTool={editor.setTool}
          onSetZoneType={editor.setZoneType}
          onDelete={handleDelete}
        />
      )}

      {/* Canvas + floating properties panel */}
      <div className="flex-1 relative overflow-hidden">
        <EditorCanvas
          zones={editor.zones}
          wallElements={editor.wallElements}
          selectedZoneId={editor.selectedZoneId}
          selectedWallElementId={editor.selectedWallElementId}
          activeTool={editor.activeTool}
          activeZoneType={editor.activeZoneType}
          scalePxPerM={editor.scalePxPerM}
          previewMode={previewMode}
          onAddZone={editor.addZone}
          onUpdateZone={editor.updateZone}
          onUpdateWallElement={editor.updateWallElement}
          onSelectZone={editor.selectZone}
          onSelectWallElement={editor.selectWallElement}
          onPlaceWallElement={editor.addWallElement}
        />

        {/* Zone properties panel */}
        {!previewMode && selectedZone && !selectedWallElement && (
          <ZonePropertiesPanel
            zone={selectedZone}
            scalePxPerM={editor.scalePxPerM}
            onUpdate={(updates) => editor.updateZone(selectedZone.id, updates)}
            onSetScale={editor.setScalePxPerM}
            onDelete={handleDelete}
          />
        )}

        {/* Wall element properties panel */}
        {!previewMode && selectedWallElement && (
          <WallElementPropertiesPanel
            element={selectedWallElement}
            onUpdate={(updates) => editor.updateWallElement(selectedWallElement.id, updates)}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}

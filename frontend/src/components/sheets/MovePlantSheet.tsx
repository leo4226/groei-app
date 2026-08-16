import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { maps as mapsApi } from '../../api/client'
import type { MapInfo } from '../../types'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'

interface Props {
  currentMapId: number
  currentMapName: string
  /** Server-derived write capability (me.capabilities.can_edit). When false
   * the target rows render disabled — a viewer can look at where a plant
   * *could* live but not move it. Defaults to true for non-gated call sites. */
  canEdit?: boolean
  error?: boolean
  onSelect: (map: MapInfo) => void
  onClose: () => void
}

export default function MovePlantSheet({ currentMapId, currentMapName, canEdit = true, error = false, onSelect, onClose }: Props) {
  const t = useT()
  const readOnly = !canEdit
  const [allMaps, setAllMaps] = useState<MapInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    mapsApi.list()
      .then(list => {
        setAllMaps(list.filter(m => m.id !== currentMapId))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentMapId])

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" style={{ touchAction: 'none' }} onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl animate-slide-up flex flex-col"
        style={{ maxHeight: '70dvh' }}
      >
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label={t.plantQuickSheet.close}
          className="shrink-0 pt-3 pb-1 flex justify-center w-full group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 border-b border-border-soft">
          <h2 className="font-heading text-lg font-medium text-text">
            {t.movePlantSheet.title}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {t.movePlantSheet.currentMap.replace('{name}', currentMapName)}
          </p>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-overdue/10 text-overdue text-sm">
            {t.movePlantSheet.error}
          </div>
        )}

        {/* Map list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
          {loading ? (
            <div className="text-center text-sm text-text-muted py-8">{t.movePlantSheet.loading}</div>
          ) : allMaps.length === 0 ? (
            <div className="text-center text-sm text-text-muted py-8">
              {t.movePlantSheet.noOtherMaps}
            </div>
          ) : (
            allMaps.map(m => (
              <button
                key={m.id}
                disabled={readOnly}
                onClick={() => onSelect(m)}
                title={readOnly ? t.settings.onlyEditorsCanChange : undefined}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                  readOnly ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg active:bg-bg/80'
                }`}
              >
                {/* Map icon */}
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Glyph name={m.map_type === 'indoor' ? 'home' : 'tree'} size={20} />
                </div>
                {/* Map info */}
                <div className="flex-1 min-w-0">
                  <div className="font-heading text-sm font-medium text-text truncate">
                    {m.name}
                  </div>
                  <div className="text-xs text-text-muted">
                    {m.map_type === 'indoor' ? t.movePlantSheet.typeIndoor : t.movePlantSheet.typeOutdoor}
                  </div>
                </div>
                {/* Arrow */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-text-muted">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}

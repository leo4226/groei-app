import { useEffect, useState } from 'react'
import { maps as mapsApi } from '../../api/client'
import type { MapInfo } from '../../types'

interface Props {
  currentMapId: number
  currentMapName: string
  error?: boolean
  onSelect: (map: MapInfo) => void
  onClose: () => void
}

export default function MovePlantSheet({ currentMapId, currentMapName, error = false, onSelect, onClose }: Props) {
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl animate-slide-up flex flex-col"
        style={{ maxHeight: '70dvh' }}
      >
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="shrink-0 pt-3 pb-1 flex justify-center w-full group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 border-b border-border-soft">
          <h2 className="font-heading text-lg font-medium text-text">
            Verplaats naar…
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Huidige kaart: <span className="font-medium text-text">{currentMapName}</span>
          </p>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-overdue/10 text-overdue text-sm">
            Verplaatsen mislukt. Probeer het opnieuw.
          </div>
        )}

        {/* Map list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
          {loading ? (
            <div className="text-center text-sm text-text-muted py-8">Laden…</div>
          ) : allMaps.length === 0 ? (
            <div className="text-center text-sm text-text-muted py-8">
              Geen andere kaarten beschikbaar.
            </div>
          ) : (
            allMaps.map(m => (
              <button
                key={m.id}
                onClick={() => onSelect(m)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-bg active:bg-bg/80 transition-colors text-left"
              >
                {/* Map icon */}
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
                  {m.map_type === 'indoor' ? '🏠' : '🌳'}
                </div>
                {/* Map info */}
                <div className="flex-1 min-w-0">
                  <div className="font-heading text-sm font-medium text-text truncate">
                    {m.name}
                  </div>
                  <div className="text-xs text-text-muted">
                    {m.map_type === 'indoor' ? 'Binnen' : 'Buiten'}
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
    </>
  )
}

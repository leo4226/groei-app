import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import type { MapInfo } from '../../types'

interface Props {
  map: MapInfo
  allMaps: MapInfo[]
  showLabels: boolean
  onToggleLabels: () => void
}

export default function MapTopBar({ map, allMaps, showLabels, onToggleLabels }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const otherMaps = allMaps.filter((m) => m.id !== map.id)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface/92 rounded-full border border-border/60 shadow-sm text-sm font-semibold text-text hover:bg-surface transition-colors"
        style={{ backdropFilter: 'blur(6px)' }}
      >
        <span className={`text-text-muted text-xs transition-transform inline-block ${open ? 'rotate-180' : ''}`}>⌄</span>
        <span className="truncate max-w-[180px]">{map.name}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[200px] bg-surface border border-border rounded-xl shadow-lg py-1 z-50">
          {otherMaps.length > 0 && (
            <>
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-widest text-text-muted">
                {t.mapPage.switchMap}
              </div>
              {otherMaps.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setOpen(false); navigate(`/map/${m.slug}`) }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg/60 w-full text-left transition-colors"
                >
                  {m.map_type === 'outdoor' ? '🌿' : '🏠'} {m.name}
                </button>
              ))}
              <div className="h-px bg-border mx-3 my-1" />
            </>
          )}
          <button
            onClick={() => { setOpen(false); onToggleLabels() }}
            className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left transition-colors hover:bg-bg/60"
          >
            <span className="text-sm">📝</span>
            <span className={showLabels ? '' : 'text-text-muted'}>
              {showLabels ? t.mapPage.labelHide : t.mapPage.labelShow}
            </span>
            {showLabels && <span className="ml-auto text-primary text-xs">✓</span>}
          </button>
          <div className="h-px bg-border mx-3 my-1" />
          <button
            onClick={() => { setOpen(false); navigate(`/maps/${map.id}/settings`) }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-bg/60 w-full text-left transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {t.mapPage.mapSettingsLabel}
          </button>
        </div>
      )}
    </div>
  )
}

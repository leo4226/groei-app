import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'
import NewMapModal from '../dashboard/NewMapModal'
import { STORAGE_KEY } from '../../appMapRedirectModel'
import type { MapInfo } from '../../types'
import type { LabelMode } from './PlantsLayer'

interface Props {
  map: MapInfo
  allMaps: MapInfo[]
  labelMode: LabelMode
  onSetLabelMode: (mode: LabelMode) => void
  showWarnings: boolean
  onToggleWarnings: () => void
}

const LABEL_MODES: LabelMode[] = ['off', 'smart', 'all']

export default function MapTopBar({ map, allMaps, labelMode, onSetLabelMode, showWarnings, onToggleWarnings }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showNewMap, setShowNewMap] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [defaultSlug, setDefaultSlug] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })

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
        className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 bg-surface/85 rounded-full border border-border/60 shadow-lg text-sm md:text-base font-semibold text-text hover:bg-surface transition-colors"
        style={{ backdropFilter: 'blur(10px)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {defaultSlug === map.slug && <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>}
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
                  className="flex items-center gap-2 px-3 py-3 text-sm text-text hover:bg-bg/60 w-full text-left transition-colors min-h-[44px]"
                >
                  <Glyph name={m.map_type === 'outdoor' ? 'leaf' : 'home'} size={15} className="text-text-muted shrink-0" />
                  {m.name}
                </button>
              ))}
              <div className="h-px bg-border mx-3 my-1" />
            </>
          )}
          {/* Labels: 3-state segmented control (Off / Smart / All). One tap sets
              any state directly; the menu stays open so the change is visible. */}
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Glyph name="edit" size={15} className="text-text-muted shrink-0" />
              <span className="text-sm text-text">{t.mapPage.labelModeTitle}</span>
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden" role="radiogroup" aria-label={t.mapPage.labelModeTitle}>
              {LABEL_MODES.map((mode) => (
                <button
                  key={mode}
                  role="radio"
                  aria-checked={labelMode === mode}
                  onClick={() => onSetLabelMode(mode)}
                  className={`flex-1 px-2 py-2 text-xs font-medium transition-colors min-h-[40px] ${labelMode === mode ? 'bg-primary text-white' : 'text-text-muted hover:bg-bg/60'}`}
                >
                  {mode === 'off' ? t.mapPage.labelModeOff : mode === 'smart' ? t.mapPage.labelModeSmart : t.mapPage.labelModeAll}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); onToggleWarnings() }}
            className="flex items-center gap-2 px-3 py-3 text-sm w-full text-left transition-colors hover:bg-bg/60 min-h-[44px]"
          >
            <Glyph name="alert" size={15} className="text-text-muted shrink-0" />
            <span className={showWarnings ? '' : 'text-text-muted'}>
              {showWarnings ? t.mapPage.warningsHide : t.mapPage.warningsShow}
            </span>
            {showWarnings && <Glyph name="check" size={14} className="ml-auto text-primary shrink-0" />}
          </button>
          <div className="h-px bg-border mx-3 my-1" />
          <button
            onClick={() => {
              try { localStorage.setItem(STORAGE_KEY, map.slug) } catch {}
              setDefaultSlug(map.slug)
              setOpen(false)
            }}
            className="flex items-center gap-2 px-3 py-3 text-sm w-full text-left transition-colors hover:bg-bg/60 min-h-[44px]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{defaultSlug === map.slug ? 'Default map' : 'Set as default'}</span>
            {defaultSlug === map.slug && <Glyph name="check" size={14} className="ml-auto text-primary shrink-0" />}
          </button>
          <div className="h-px bg-border mx-3 my-1" />
          <button
            onClick={() => { setOpen(false); setShowNewMap(true) }}
            className="flex items-center gap-2 px-3 py-3 text-sm w-full text-left transition-colors hover:bg-bg/60 min-h-[44px]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{t.maps.newMap}</span>
          </button>
          <div className="h-px bg-border mx-3 my-1" />
          <button
            onClick={() => { setOpen(false); navigate(`/maps/${map.id}/settings`) }}
            className="flex items-center gap-2 px-3 py-3 text-sm text-text-muted hover:bg-bg/60 w-full text-left transition-colors min-h-[44px]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {t.mapPage.mapSettingsLabel}
          </button>
        </div>
      )}
      <NewMapModal open={showNewMap} onClose={() => setShowNewMap(false)} />
    </div>
  )
}

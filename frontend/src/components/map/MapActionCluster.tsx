import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import { WaterStatusIcon } from '../PlantStatusIcon'
import type { GardenWaterStatus } from '../../api/client'

interface Props {
  isOutdoor: boolean
  waterStatus: GardenWaterStatus['status']
  showLabels: boolean
  sunActive: boolean
  sunAvailable: boolean
  inspectorMode: boolean
  onWater: () => void
  onFertilize: () => void
  onToggleSun: () => void
  onToggleLabels: () => void
  onToggleInspector: () => void
  onIdentify: () => void
  onAddPot: () => void
  onAddPlant: () => void
}

export default function MapActionCluster({
  isOutdoor, waterStatus, showLabels,
  sunActive, sunAvailable, inspectorMode,
  onWater, onFertilize, onToggleSun, onToggleLabels, onToggleInspector,
  onIdentify, onAddPot, onAddPlant,
}: Props) {
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    function onDown(e: PointerEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [moreOpen])

  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-full transition-colors"

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5 bg-surface/92 rounded-full border border-border/60 shadow-sm p-1" style={{ backdropFilter: 'blur(6px)' }}>
        {/* Always visible: water + fertilize + add plant + more */}
        <button onClick={onWater} title={t.mapPage.water} className={`${iconBtn} text-blue-600 hover:bg-blue-500/15`}>
          <WaterStatusIcon status={waterStatus} size={14} />
        </button>
        <button onClick={onFertilize} title={t.mapPage.fertilize} className={`${iconBtn} hover:bg-emerald-500/15`}>
          <span className="text-sm leading-none">🌿</span>
        </button>

        {/* Desktop-only icons */}
        {isOutdoor && (
          <button
            onClick={sunAvailable ? onToggleSun : undefined}
            title={t.mapPage.sun}
            className={`${iconBtn} forced-hidden-mobile ${
              sunActive ? 'bg-amber-400/30 text-amber-700'
              : sunAvailable ? 'text-amber-600 hover:bg-amber-400/15'
              : 'text-amber-600/40 cursor-not-allowed'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
        )}
        {isOutdoor && (
          <button onClick={onIdentify} title={t.weeds.identifyCard.title} className={`${iconBtn} forced-hidden-mobile text-green-700 hover:bg-green-500/15`}>
            <span className="text-sm leading-none">📸</span>
          </button>
        )}
        <button onClick={onToggleLabels} title={showLabels ? t.mapPage.labelHide : t.mapPage.labelShow} className={`${iconBtn} forced-hidden-mobile ${showLabels ? 'text-text-muted hover:bg-bg/60' : 'bg-primary text-white'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="4" rx="1" />
            <rect x="3" y="11" width="12" height="4" rx="1" />
            <rect x="3" y="17" width="8" height="4" rx="1" />
          </svg>
        </button>
        <button onClick={onToggleInspector} title={t.mapPage.inspect} className={`${iconBtn} forced-hidden-mobile ${inspectorMode ? 'bg-orange-500/30 text-orange-600' : 'text-orange-500 hover:bg-orange-500/15'}`}>
          <span className="text-xs font-bold">🔍</span>
        </button>
        <button onClick={onAddPot} title={t.mapPage.pot} className={`${iconBtn} forced-hidden-mobile text-amber-800 hover:bg-amber-700/15`}>
          <span className="text-sm leading-none">🪴</span>
        </button>

        {/* Add plant — primary, always visible */}
        <button onClick={onAddPlant} title={t.mapPage.plant} className={`${iconBtn} bg-primary text-white hover:opacity-90`}>
          <span className="text-base font-bold leading-none">+</span>
        </button>

        {/* More — only visible on mobile */}
        <div ref={moreRef} className="relative forced-hidden-desktop">
          <button onClick={() => setMoreOpen((v) => !v)} className={`${iconBtn} text-text-muted hover:bg-bg/60`}>
            <span className="text-base leading-none">⋯</span>
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 min-w-[160px] bg-surface border border-border rounded-xl shadow-lg py-1 z-50">
              {isOutdoor && (
                <button onClick={() => { setMoreOpen(false); if (sunAvailable) onToggleSun() }} className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left transition-colors ${sunActive ? 'text-amber-700 bg-amber-400/10' : 'text-text-muted hover:bg-bg/60'}`}>
                  <span className="text-sm">☀</span> {t.mapPage.sun}
                </button>
              )}
              {isOutdoor && (
                <button onClick={() => { setMoreOpen(false); onIdentify() }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors">
                  <span className="text-sm">📸</span> {t.weeds.identifyCard.title}
                </button>
              )}
              <button onClick={() => { setMoreOpen(false); onToggleLabels() }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors">
                <span className="text-sm">📝</span> {showLabels ? t.mapPage.labelHide : t.mapPage.labelShow}
              </button>
              <button onClick={() => { setMoreOpen(false); onToggleInspector() }} className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left transition-colors ${inspectorMode ? 'text-orange-600 bg-orange-500/10' : 'text-text-muted hover:bg-bg/60'}`}>
                <span className="text-sm">🔍</span> {t.mapPage.inspect}
              </button>
              <button onClick={() => { setMoreOpen(false); onAddPot() }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors">
                <span className="text-sm">🪴</span> {t.mapPage.pot}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

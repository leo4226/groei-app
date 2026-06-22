import { useState, useRef, useCallback } from 'react'
import { useT } from '../../context/LanguageContext'
import { WaterStatusIcon } from '../PlantStatusIcon'
import type { GardenWaterStatus } from '../../api/client'

interface Props {
  isOutdoor: boolean
  waterStatus: GardenWaterStatus['status']
  sunActive: boolean
  sunAvailable: boolean
  inspectorMode: boolean
  moveModeActive: boolean
  onWater: () => void
  onFertilize: () => void
  onToggleSun: () => void
  onToggleInspector: () => void
  onToggleMoveMode: () => void
  onAddPlant: () => void
  onNewGame?: () => void
}

export default function MapActionCluster({
  isOutdoor, waterStatus,
  sunActive, sunAvailable, inspectorMode, moveModeActive,
  onWater, onFertilize, onToggleSun, onToggleInspector, onToggleMoveMode,
  onAddPlant, onNewGame,
}: Props) {
  const t = useT()
  const [showGpsHint, setShowGpsHint] = useState(false)
  const gpsHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showGpsHintTemporarily = useCallback(() => {
    setShowGpsHint(true)
    if (gpsHintTimer.current) clearTimeout(gpsHintTimer.current)
    gpsHintTimer.current = setTimeout(() => setShowGpsHint(false), 3000)
  }, [])

  const handleSunClick = useCallback(() => {
    if (sunAvailable) {
      onToggleSun()
    } else {
      showGpsHintTemporarily()
    }
  }, [sunAvailable, onToggleSun, showGpsHintTemporarily])

  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-full transition-colors"

  return (
    <div className="flex items-center gap-0.5 bg-surface/85 rounded-full border border-border/60 shadow-lg p-1" style={{ backdropFilter: 'blur(10px)' }}>
      <button onClick={onWater} title={t.mapPage.water} className={`${iconBtn} text-blue-600 hover:bg-blue-500/15`}>
        <WaterStatusIcon status={waterStatus} size={14} />
      </button>
      <button onClick={onFertilize} title={t.mapPage.fertilize} className={`${iconBtn} text-emerald-600 hover:bg-emerald-500/15`}>
        <span className="text-sm leading-none">🌿</span>
      </button>

      {/* Sun — indoor maps skip */}
      {isOutdoor && (
        <div className="relative">
          <button
            onClick={handleSunClick}
            title={t.mapPage.sun}
            className={`${iconBtn} ${
              sunActive ? 'bg-amber-400/30 text-amber-700'
              : sunAvailable ? 'text-amber-600 hover:bg-amber-400/15'
              : 'text-amber-600/40 cursor-not-allowed'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.72" y2="19.72" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
          {showGpsHint && (
            <div className="absolute top-full right-0 mt-2 z-50 bg-black/85 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
              {t.mapPage.sunNoGpsHint}
              <div className="absolute bottom-full right-4 w-2 h-2 bg-black/85 rotate-45" />
            </div>
          )}
        </div>
      )}

      {/* Inspect */}
      <button
        onClick={onToggleInspector}
        title={t.mapPage.inspect}
        className={`${iconBtn} ${inspectorMode ? 'bg-orange-500/30 text-orange-600' : 'text-orange-500 hover:bg-orange-500/15'}`}
      >
        <span className="text-xs font-bold">🔍</span>
      </button>

      {/* Move mode — intentional repositioning only */}
      <button
        type="button"
        onClick={onToggleMoveMode}
        onPointerDown={(e) => e.stopPropagation()}
        title={moveModeActive ? t.mapPage.moveModeDone : t.mapPage.moveMode}
        className={`${iconBtn} ${moveModeActive ? 'bg-primary text-white' : 'text-primary hover:bg-primary/15'}`}
        style={{ touchAction: 'manipulation' }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M7.5 1.5v12M7.5 1.5L5.5 3.5M7.5 1.5l2 2M7.5 13.5l-2-2M7.5 13.5l2-2M1.5 7.5h12M1.5 7.5l2-2M1.5 7.5l2 2M13.5 7.5l-2-2M13.5 7.5l-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Garden game — outdoor only */}
      {isOutdoor && onNewGame && (
        <button
          onClick={onNewGame}
          title={t.game.newGame}
          className={`${iconBtn} text-emerald-700 hover:bg-emerald-500/15`}
        >
          <span className="text-xs">🎮</span>
        </button>
      )}

      {/* Add plant — primary, always last */}
      <button
        type="button"
        onClick={onAddPlant}
        onPointerDown={(e) => e.stopPropagation()}
        title={t.mapPage.plant}
        className={`${iconBtn} bg-primary text-white hover:opacity-90`}
        style={{ touchAction: 'manipulation' }}
      >
        <span className="text-base font-bold leading-none">+</span>
      </button>
    </div>
  )
}

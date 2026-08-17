import { useState, useRef, useCallback } from 'react'
import { useT } from '../../context/LanguageContext'
import { WaterStatusIcon } from '../PlantStatusIcon'
import CareIcon from '../ui/CareIcon'
import Glyph from '../ui/Glyph'
import type { GardenWaterStatus } from '../../api/client'
import { isoToDisplay } from '../../utils/dateFormat'

interface Props {
  isOutdoor: boolean
  waterStatus: GardenWaterStatus['status']
  lastWateredAt: string | null
  /** Server-derived write capability (me.capabilities.can_edit). When false,
   * water/fertilize/move/add/game render disabled with a read-only tooltip;
   * sun + inspect stay usable. Defaults to true so non-gated call sites and
   * older tests keep their behaviour. */
  canEdit?: boolean
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

export function formatWaterRecency(
  lastWateredAt: string | null,
  now = new Date(),
): string {
  if (!lastWateredAt) return '—'
  const [year, month, day] = lastWateredAt.split('-').map(Number)
  if (!year || !month || !day) return '—'
  const completed = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const elapsed = Math.max(0, Math.floor((today - completed) / 86_400_000))
  return elapsed > 99 ? '99+' : `${elapsed}d`
}

export default function MapActionCluster({
  isOutdoor, waterStatus, lastWateredAt, canEdit = true,
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

  const iconBtn = "w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full transition-colors"
  const writeDisabled = !canEdit
  const writeTitle = t.settings.onlyEditorsCanChange
  const waterTitle = writeDisabled
    ? writeTitle
    : lastWateredAt
      ? t.mapPage.mapWateringLastWateredTitle(isoToDisplay(lastWateredAt))
      : t.mapPage.mapWateringNoHistoryTitle
  const disabledIconBtn = `${iconBtn} disabled:opacity-40 disabled:cursor-not-allowed`

  return (
    <div className="flex items-center gap-0.5 md:gap-1 bg-surface/85 rounded-full border border-border/60 shadow-lg p-1 md:p-1.5" style={{ backdropFilter: 'blur(10px)' }}>
      <button
        onClick={onWater}
        disabled={writeDisabled}
        title={waterTitle}
        aria-label={waterTitle}
        className={`${disabledIconBtn} relative text-blue-600 hover:bg-blue-500/15 disabled:hover:bg-transparent`}
      >
        <WaterStatusIcon status={waterStatus} size={14} className="md:scale-110" />
        <span
          data-water-recency
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-blue-500/20 bg-paper px-0.5 text-[9px] font-bold leading-none text-blue-700 shadow-sm"
        >
          {formatWaterRecency(lastWateredAt)}
        </span>
      </button>
      <button
        onClick={onFertilize}
        disabled={writeDisabled}
        title={writeDisabled ? writeTitle : t.mapPage.fertilize}
        aria-label={writeDisabled ? writeTitle : t.mapPage.fertilize}
        className={`${disabledIconBtn} text-emerald-600 hover:bg-emerald-500/15 disabled:hover:bg-transparent`}
      >
        <CareIcon type="fertilize" size={15} className="md:scale-110" />
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
        <Glyph name="search" size={15} />
      </button>

      {/* Move mode — intentional repositioning only */}
      <button
        type="button"
        onClick={onToggleMoveMode}
        disabled={writeDisabled}
        onPointerDown={(e) => e.stopPropagation()}
        title={writeDisabled ? writeTitle : moveModeActive ? t.mapPage.moveModeDone : t.mapPage.moveMode}
        aria-label={writeDisabled ? writeTitle : moveModeActive ? t.mapPage.moveModeDone : t.mapPage.moveMode}
        className={`${disabledIconBtn} ${moveModeActive ? 'bg-primary text-white' : 'text-primary hover:bg-primary/15'} disabled:hover:bg-transparent`}
        style={{ touchAction: 'manipulation' }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M7.5 1.5v12M7.5 1.5L5.5 3.5M7.5 1.5l2 2M7.5 13.5l-2-2M7.5 13.5l2-2M1.5 7.5h12M1.5 7.5l2-2M1.5 7.5l2 2M13.5 7.5l-2-2M13.5 7.5l-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Plant game — indoor maps too: a hunt can cross from the living
          room into the garden, and an indoor-only game is perfectly playable */}
      {onNewGame && (
        <button
          onClick={onNewGame}
          disabled={writeDisabled}
          title={writeDisabled ? writeTitle : t.game.newGame}
          aria-label={writeDisabled ? writeTitle : t.game.newGame}
          className={`${disabledIconBtn} text-emerald-700 hover:bg-emerald-500/15 disabled:hover:bg-transparent`}
        >
          <Glyph name="gamepad" size={15} />
        </button>
      )}

      {/* Add plant — primary, always last */}
      <button
        type="button"
        onClick={onAddPlant}
        disabled={writeDisabled}
        onPointerDown={(e) => e.stopPropagation()}
        title={writeDisabled ? writeTitle : t.mapPage.plant}
        aria-label={writeDisabled ? writeTitle : t.mapPage.plant}
        className={`${disabledIconBtn} bg-primary text-white hover:opacity-90 disabled:hover:opacity-40`}
        style={{ touchAction: 'manipulation' }}
      >
        <span className="text-base font-bold leading-none">+</span>
      </button>
    </div>
  )
}

import type { SunPosition } from '../../utils/sunCalc'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { PLANT_SUN_PROFILES, type PlantSunProfile } from '../../utils/plantSunRequirements'
import HeatmapLegend from './HeatmapLegend'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'

export type SunViewMode = 'live' | 'heatmap'

interface Props {
  viewMode: SunViewMode
  onViewModeChange: (mode: SunViewMode) => void
  selectedMonth: number
  selectedHour: number
  sunPosition: SunPosition | null
  onMonthChange: (m: number) => void
  onHourChange: (h: number) => void
  onNow: () => void
  // Heatmap-specific
  isCalculating?: boolean
  tappedCell?: HeatmapCell | null
  selectedProfile?: PlantSunProfile | null
  onProfileChange?: (p: PlantSunProfile | null) => void
  estimatePlantShade?: boolean
  onToggleEstimatePlantShade?: () => void
}

function formatTime(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function TappedCellInfo({ cell, month }: { cell: HeatmapCell; month: number }) {
  const t = useT()
  const monthName = t.calendar.monthsShort[month - 1]

  return (
    <p className="text-xs text-text-muted">
      {t.sun.sunHoursIn
        .replace('{hours}', cell.sunHours.toFixed(1))
        .replace('{month}', monthName)}
    </p>
  )
}

export default function SunControls({
  viewMode, onViewModeChange,
  selectedMonth, selectedHour, sunPosition,
  onMonthChange, onHourChange, onNow,
  isCalculating, tappedCell, selectedProfile, onProfileChange,
  estimatePlantShade, onToggleEstimatePlantShade,
}: Props) {
  const t = useT()
  return (
    <div className="shrink-0 mt-2 bg-surface rounded-xl border border-border p-3 space-y-2">
      {/* Live / Zonkaart toggle */}
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
        <button
          onClick={() => onViewModeChange('live')}
          className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            viewMode === 'live' ? 'bg-amber-500/25 text-amber-800' : 'text-text-muted'
          }`}
        >
          {t.sun.live}
        </button>
        <button
          onClick={() => onViewModeChange('heatmap')}
          className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            viewMode === 'heatmap' ? 'bg-amber-500/25 text-amber-800' : 'text-text-muted'
          }`}
        >
          {t.sun.heatmap}
        </button>
      </div>

      {/* Month pills — shown in both modes */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {t.calendar.monthsShort.map((label, i) => {
          const month = i + 1
          const isActive = month === selectedMonth
          return (
            <button
              key={month}
              onClick={() => onMonthChange(month)}
              className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-amber-500/30 text-amber-800'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Live mode: time slider + sun info */}
      {viewMode === 'live' && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted w-10 shrink-0">04:00</span>
            <input
              type="range"
              min={4}
              max={22}
              step={0.25}
              value={selectedHour}
              onChange={e => onHourChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-amber-400 cursor-pointer"
            />
            <span className="text-xs text-text-muted w-10 shrink-0 text-right">22:00</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">
              {formatTime(selectedHour)}
              {sunPosition && (
                <span className="text-text-muted font-normal ml-2">
                  {sunPosition.isUp
                    ? t.sun.aboveHorizon.replace('{deg}', sunPosition.altitudeDeg.toFixed(0))
                    : t.sun.belowHorizon}
                </span>
              )}
            </span>
            <button
              onClick={onNow}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              {t.sun.now}
            </button>
          </div>
        </>
      )}

      {/* Heatmap mode: legend + zone filters + tapped cell */}
      {viewMode === 'heatmap' && (
        <>
          <HeatmapLegend layer="sun_hours" />

          {/* Zone filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {PLANT_SUN_PROFILES.map(profile => {
              const isActive = selectedProfile?.id === profile.id
              return (
                <button
                  key={profile.id}
                  onClick={() => onProfileChange?.(isActive ? null : profile)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    isActive ? 'text-white' : 'text-text-muted hover:bg-white/5'
                  }`}
                  style={isActive ? { backgroundColor: profile.color + '55' } : undefined}
                >
                  <Glyph name={profile.icon} size={13} />
                  <span>{profile.label}</span>
                </button>
              )
            })}
          </div>

          {/* Estimate plant shade toggle (#648) — model-driven, default off */}
          {onToggleEstimatePlantShade && (
            <button
              onClick={onToggleEstimatePlantShade}
              className="flex items-center justify-between w-full gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <Glyph name="tree" size={13} />
                {t.sun.estimatePlantShade}
              </span>
              <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${estimatePlantShade ? 'bg-amber-500' : 'bg-border'}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${estimatePlantShade ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </span>
            </button>
          )}

          {/* Tapped cell info + grow-here CTA */}
          {tappedCell && (
            <TappedCellInfo cell={tappedCell} month={selectedMonth} />
          )}

          {isCalculating && (
            <div className="text-xs text-amber-300 animate-pulse">{t.sun.calculating}</div>
          )}
        </>
      )}
    </div>
  )
}

import { useMemo } from 'react'
import { useRainContext } from '../../hooks/useRainContext'
import { useTemperatureContext } from '../../hooks/useTemperatureContext'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'

export const TEMP_BADGE_CLASS: Record<string, string> = {
  hot:  'bg-overdue/15 text-overdue',
  warm: 'bg-secondary/15 text-secondary',
  mild: 'bg-good/15 text-good',
  cool: 'bg-due/15 text-due',
  cold: 'bg-aqua-glow/15 text-midnight-ink',
}

export const RAIN_BADGE_CLASS: Record<string, string> = {
  well_watered: 'bg-good/15 text-good',
  moderate:     'bg-due/15 text-due',
  dry:          'bg-secondary/15 text-secondary',
  very_dry:     'bg-overdue/15 text-overdue',
}

/**
 * What the garden has actually had: 14 days of rainfall and 7 days of
 * temperature, with the assessment badges the backend derives from them.
 *
 * This is a *garden-level* fact — the backend fetches one hardcoded lat/lon and
 * the endpoints take no map or household — so it belongs on the map's weather
 * popover, next to the forecast, rather than repeated inside every plant (#878).
 * The plant passport shows `GardenWeatherSummary` instead.
 *
 * Per-day mm and min/max labels only appear from `sm:` up: at 8px across 14
 * bars they are unreadable on a phone, and the badge plus total carry the
 * decision anyway.
 */
export default function GardenWeatherHistory({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const gw = t.gardenWeather
  const rain = useRainContext()
  const temp = useTemperatureContext()

  const tempScale = useMemo(() => {
    if (!temp.data) return { min: 0, max: 30, range: 30 }
    const allMin = Math.min(...temp.data.days.map(d => d.min))
    const allMax = Math.max(...temp.data.days.map(d => d.max))
    const pad = 2
    const lo = Math.floor(allMin - pad)
    const hi = Math.ceil(allMax + pad)
    return { min: lo, max: hi, range: hi - lo || 1 }
  }, [temp.data])

  const showDayLabels = !compact
  const chartH = compact ? 36 : 52

  if (!rain.data && !temp.data && !rain.loading && !temp.loading) return null

  return (
    <div>
      {rain.data ? (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold tracking-widest uppercase text-text-muted inline-flex items-center gap-1.5">
              <Glyph name="droplet" size={13} className="text-sky-500" />
              {gw.rainfallTitle}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RAIN_BADGE_CLASS[rain.data.assessment] ?? ''}`}>
              {gw.rainBadges[rain.data.assessment] ?? rain.data.assessment}
            </span>
          </div>
          <div className="flex items-end gap-1 mb-1" style={{ height: compact ? 32 : 56 }}>
            {rain.data.days.map(day => {
              const maxMm = Math.max(...rain.data!.days.map(d => d.mm), 1)
              const barPx = Math.max((day.mm / maxMm) * (compact ? 28 : 44), day.mm > 0 ? 4 : 2)
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                  {day.mm > 0 && showDayLabels && (
                    <span className="hidden sm:block text-[8px] text-blue-400/80 font-medium leading-none">{day.mm}</span>
                  )}
                  <div className="w-full rounded-sm bg-blue-400/70" style={{ height: `${barPx}px` }} />
                </div>
              )
            })}
          </div>
          {showDayLabels && (
            <div className="flex mb-2">
              {rain.data.days.map(day => (
                <span key={day.date} className="flex-1 text-center text-[9px] text-text-muted">
                  {new Date(day.date).toLocaleDateString(t.locale, { weekday: 'narrow' })}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-text-muted text-right">
            {gw.total}{' '}
            <span className="text-text font-medium">{rain.data.total_14day_mm ?? rain.data.total_7day_mm} mm</span>
          </p>
        </div>
      ) : rain.loading ? (
        <div>
          <div className="h-3 w-32 bg-border rounded animate-pulse mb-2.5" />
          <div className="h-12 bg-border/50 rounded animate-pulse" />
        </div>
      ) : null}

      {temp.data ? (
        <div className="pt-3 mt-1 border-t border-border">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold tracking-widest uppercase text-text-muted inline-flex items-center gap-1.5">
              <Glyph name="thermometer" size={13} className="text-rose-500" />
              {gw.temperatureTitle}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TEMP_BADGE_CLASS[temp.data.assessment] ?? ''}`}>
              {gw.tempBadges[temp.data.assessment] ?? temp.data.assessment}
            </span>
          </div>
          <div className="flex gap-1 mb-1">
            {temp.data.days.map(day => {
              const fullH  = Math.max(((day.max - tempScale.min) / tempScale.range) * chartH, 6)
              const minH   = Math.max(((day.min - tempScale.min) / tempScale.range) * chartH, 0)
              const rangeH = Math.max(fullH - minH, 4)
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                  {showDayLabels && (
                    <span className="hidden sm:block text-[8px] text-amber-500 font-medium leading-none">{day.max}°</span>
                  )}
                  <div className="w-full flex items-end" style={{ height: `${chartH}px` }}>
                    <div className="relative w-full rounded-sm overflow-hidden" style={{ height: `${fullH}px` }}>
                      <div className="absolute bottom-0 w-full bg-amber-300/30" style={{ height: `${minH}px` }} />
                      <div className="absolute w-full bg-pumpkin-swirl/75" style={{ bottom: `${minH}px`, height: `${rangeH}px` }} />
                    </div>
                  </div>
                  {showDayLabels && (
                    <span className="hidden sm:block text-[8px] text-text-muted/70 font-medium leading-none">{day.min}°</span>
                  )}
                  <span className="text-[9px] text-text-muted">
                    {new Date(day.date).toLocaleDateString(t.locale, { weekday: 'narrow' })}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-text-muted text-right">
            {gw.avgMax} <span className="text-text font-medium">{temp.data.avg_max_7day}°C</span>
          </p>
        </div>
      ) : temp.loading ? (
        <div className="pt-3 mt-1 border-t border-border">
          <div className="h-3 w-36 bg-border rounded animate-pulse mb-2.5" />
          <div className="h-14 bg-border/50 rounded animate-pulse" />
        </div>
      ) : null}
    </div>
  )
}

/**
 * One-line stand-in for the charts above, for places that need the conclusion
 * rather than the data — currently the plant passport.
 */
export function GardenWeatherSummary() {
  const t = useT()
  const gw = t.gardenWeather
  const rain = useRainContext()
  const temp = useTemperatureContext()

  if (!rain.data && !temp.data) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface/50 px-3 py-2.5">
      {rain.data && (
        <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
          <Glyph name="droplet" size={14} className="text-sky-500" />
          {gw.rainSummary(rain.data.total_14day_mm ?? rain.data.total_7day_mm)}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${RAIN_BADGE_CLASS[rain.data.assessment] ?? ''}`}>
            {gw.rainBadges[rain.data.assessment] ?? rain.data.assessment}
          </span>
        </span>
      )}
      {temp.data && (
        <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
          <Glyph name="thermometer" size={14} className="text-rose-500" />
          {gw.tempSummary(temp.data.avg_max_7day)}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TEMP_BADGE_CLASS[temp.data.assessment] ?? ''}`}>
            {gw.tempBadges[temp.data.assessment] ?? temp.data.assessment}
          </span>
        </span>
      )}
    </div>
  )
}

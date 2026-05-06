import { useMemo, useState } from 'react'
import { usePlantCareInfo } from '../hooks/usePlantCareInfo'
import { useRainContext } from '../hooks/useRainContext'
import { useTemperatureContext } from '../hooks/useTemperatureContext'

interface Props { plantId: number }

const LIGHT_LABEL: Record<string, string> = {
  shade: 'Schaduw',
  partial: 'Halfschaduw',
  full_sun: 'Volle zon',
}

const TEMP_BADGE: Record<string, { label: string; className: string }> = {
  hot:  { label: 'Heet',  className: 'bg-overdue/15 text-overdue' },
  warm: { label: 'Warm',  className: 'bg-secondary/15 text-secondary' },
  mild: { label: 'Zacht', className: 'bg-good/15 text-good' },
  cool: { label: 'Fris',  className: 'bg-due/15 text-due' },
  cold: { label: 'Koud',  className: 'bg-aqua-glow/15 text-midnight-ink' },
}

const RAIN_BADGE: Record<string, { label: string; className: string }> = {
  well_watered: { label: 'Goed bewaterd', className: 'bg-good/15 text-good' },
  moderate:     { label: 'Matig',         className: 'bg-due/15 text-due' },
  dry:          { label: 'Droog',         className: 'bg-secondary/15 text-secondary' },
  very_dry:     { label: 'Erg droog',     className: 'bg-overdue/15 text-overdue' },
}

const MONTH_ABBR: Record<string, string> = {
  january: 'Jan', february: 'Feb', march: 'Mrt', april: 'Apr',
  may: 'Mei', june: 'Jun', july: 'Jul', august: 'Aug',
  september: 'Sep', october: 'Okt', november: 'Nov', december: 'Dec',
}

function SkeletonRow() {
  return <div className="h-3.5 bg-border rounded animate-pulse w-3/4" />
}

export default function PlantCareInfo({ plantId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const care = usePlantCareInfo(plantId)
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

  const isLoading = care.loading
  const noData    = !care.loading && care.data?.source === 'not_found'

  return (
    <div className="mt-4 rounded-xl bg-bg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-semibold text-text">🌱 Verzorgingsinfo</span>
        {!isLoading && !noData && care.data && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-primary font-medium"
          >
            {expanded ? 'Minder ←' : 'Meer info →'}
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {isLoading ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : care.error ? (
          <p className="text-xs text-text-muted">Kon verzorgingsinfo niet laden</p>
        ) : noData ? (
          <p className="text-xs text-text-muted">Geen verzorgingsinfo beschikbaar voor deze soort</p>
        ) : care.data ? (
          <>
            {/* Light bar */}
            {care.data.light_raw != null && (
              <div className="flex items-center gap-2">
                <span className="text-sm shrink-0">☀️</span>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pumpkin-swirl rounded-full"
                    style={{ width: `${(care.data.light_raw / 10) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted shrink-0 w-20 text-right">
                  {LIGHT_LABEL[care.data.light_label ?? ''] ?? care.data.light_label}
                </span>
              </div>
            )}

            {/* Precipitation */}
            {(care.data.precip_min_mm != null || care.data.precip_max_mm != null) && (
              <div className="flex items-start gap-2 text-sm">
                <span className="shrink-0">💧</span>
                <span className="text-text-muted">
                  {care.data.precip_min_mm}–{care.data.precip_max_mm} mm/jaar
                </span>
              </div>
            )}

            {/* Bloom months, duration, flower colours — expanded only */}
            {expanded && <>
              {care.data.bloom_months.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="shrink-0">🌸</span>
                  <span className="text-text-muted">
                    {care.data.bloom_months.map(m => MONTH_ABBR[m] ?? m).join(' · ')}
                  </span>
                </div>
              )}

              {(care.data.duration || care.data.leaf_retention != null) && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="shrink-0">🌿</span>
                  <span className="text-text-muted capitalize">
                    {[
                      care.data.duration,
                      care.data.leaf_retention === true  ? 'Groenblijvend'   : null,
                      care.data.leaf_retention === false ? 'Bladverliezend'  : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}

              {care.data.flower_colors.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="shrink-0">🎨</span>
                  <span className="text-text-muted capitalize">
                    Bloemen: {care.data.flower_colors.join(', ')}
                  </span>
                </div>
              )}
            </>}
          </>
        ) : null}

        {/* Rain chart — expanded only */}
        {expanded && rain.data && (
          <div className="pt-3 mt-1 border-t border-border">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold tracking-widest uppercase text-text-muted">🌧 Neerslag — 7 dagen</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RAIN_BADGE[rain.data.assessment]?.className ?? ''}`}>
                {RAIN_BADGE[rain.data.assessment]?.label ?? rain.data.assessment}
              </span>
            </div>
            <div className="flex items-end gap-1 h-14 mb-1">
              {rain.data.days.map(day => {
                const maxMm = Math.max(...rain.data!.days.map(d => d.mm), 1)
                const barPx = Math.max((day.mm / maxMm) * 44, day.mm > 0 ? 4 : 2)
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                    {day.mm > 0 && (
                      <span className="text-[8px] text-blue-400/80 font-medium leading-none">{day.mm}</span>
                    )}
                    <div className="w-full rounded-sm bg-blue-400/70" style={{ height: `${barPx}px` }} />
                  </div>
                )
              })}
            </div>
            <div className="flex mb-2">
              {rain.data.days.map(day => (
                <span key={day.date} className="flex-1 text-center text-[9px] text-text-muted">
                  {new Date(day.date).toLocaleDateString('nl-NL', { weekday: 'narrow' })}
                </span>
              ))}
            </div>
            <p className="text-xs text-text-muted text-right">
              Totaal: <span className="text-text font-medium">{rain.data.total_7day_mm} mm</span>
            </p>
          </div>
        )}
        {expanded && rain.loading && (
          <div className="pt-3 mt-1 border-t border-border">
            <div className="h-3 w-32 bg-border rounded animate-pulse mb-2.5" />
            <div className="h-12 bg-border/50 rounded animate-pulse" />
          </div>
        )}

        {/* Temperature chart — expanded only */}
        {expanded && temp.data && (
          <div className="pt-3 mt-1 border-t border-border">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold tracking-widest uppercase text-text-muted">🌡 Temperatuur — 7 dagen</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TEMP_BADGE[temp.data.assessment]?.className ?? ''}`}>
                {TEMP_BADGE[temp.data.assessment]?.label ?? temp.data.assessment}
              </span>
            </div>
            <div className="flex gap-1 mb-1">
              {temp.data.days.map(day => {
                const CHART_H = 52
                const fullH  = Math.max(((day.max - tempScale.min) / tempScale.range) * CHART_H, 6)
                const minH   = Math.max(((day.min - tempScale.min) / tempScale.range) * CHART_H, 0)
                const rangeH = Math.max(fullH - minH, 4)
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                    <span className="text-[8px] text-amber-500 font-medium leading-none">{day.max}°</span>
                    <div className="w-full flex items-end" style={{ height: `${CHART_H}px` }}>
                      <div className="relative w-full rounded-sm overflow-hidden" style={{ height: `${fullH}px` }}>
                        <div className="absolute bottom-0 w-full bg-amber-300/30" style={{ height: `${minH}px` }} />
                        <div className="absolute w-full bg-pumpkin-swirl/75" style={{ bottom: `${minH}px`, height: `${rangeH}px` }} />
                      </div>
                    </div>
                    <span className="text-[8px] text-text-muted/70 font-medium leading-none">{day.min}°</span>
                    <span className="text-[9px] text-text-muted">
                      {new Date(day.date).toLocaleDateString('nl-NL', { weekday: 'narrow' })}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex mb-2">
              {temp.data.days.map(day => (
                <span key={day.date} className="flex-1" />
              ))}
            </div>
            <p className="text-xs text-text-muted text-right">
              Gem. max: <span className="text-text font-medium">{temp.data.avg_max_7day}°C</span>
            </p>
          </div>
        )}
        {expanded && temp.loading && (
          <div className="pt-3 mt-1 border-t border-border">
            <div className="h-3 w-36 bg-border rounded animate-pulse mb-2.5" />
            <div className="h-14 bg-border/50 rounded animate-pulse" />
          </div>
        )}
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { usePlantCareInfo } from '../hooks/usePlantCareInfo'
import { useRainContext } from '../hooks/useRainContext'
import { useTemperatureContext } from '../hooks/useTemperatureContext'
import { useT } from '../context/LanguageContext'
import Glyph from './ui/Glyph'

interface Props {
  plantId: number
  /**
   * 'collapsible' (default, mobile): the species profile keeps a More/Less
   * toggle for its secondary rows. 'split' (desktop passport): everything is
   * expanded. Both layouts render the SAME two sections — species profile and
   * garden weather — so the information architecture matches across
   * breakpoints (#878).
   */
  layout?: 'collapsible' | 'split'
  /**
   * Garden weather is outdoor-only. Pass false for plants on an indoor map,
   * mirroring `alert_service._INDOOR_SKIP` on the backend — a houseplant has
   * no use for a rainfall chart.
   */
  showWeather?: boolean
}

/** API month names (English, lowercase) → index into the localized month arrays. */
const MONTH_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

const TEMP_BADGE_CLASS: Record<string, string> = {
  hot:  'bg-overdue/15 text-overdue',
  warm: 'bg-secondary/15 text-secondary',
  mild: 'bg-good/15 text-good',
  cool: 'bg-due/15 text-due',
  cold: 'bg-aqua-glow/15 text-midnight-ink',
}

const RAIN_BADGE_CLASS: Record<string, string> = {
  well_watered: 'bg-good/15 text-good',
  moderate:     'bg-due/15 text-due',
  dry:          'bg-secondary/15 text-secondary',
  very_dry:     'bg-overdue/15 text-overdue',
}

function SkeletonRow() {
  return <div className="h-3.5 bg-border rounded animate-pulse w-3/4" />
}

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted">
        {children}
      </p>
      {action}
    </div>
  )
}

export default function PlantCareInfo({ plantId, layout = 'collapsible', showWeather = true }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const care = usePlantCareInfo(plantId)
  const rain = useRainContext()
  const temp = useTemperatureContext()

  const split = layout === 'split'
  // In split layout everything is always visible; collapsible keeps the toggle.
  const showAll = split || expanded

  const ci = t.careInfo
  const monthAbbr = (name: string) => {
    const idx = MONTH_INDEX[name.toLowerCase()]
    return idx === undefined ? name : t.calendar.monthsShort[idx]
  }

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

  // ── Species profile rows (light, water needs, bloom, habit, colours) ──
  const speciesRows = isLoading ? (
    <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
  ) : care.error ? (
    <p className="text-xs text-text-muted">{ci.loadFailed}</p>
  ) : noData ? (
    <p className="text-xs text-text-muted">{ci.noSpeciesInfo}</p>
  ) : care.data ? (
    <>
      {/* Light bar */}
      {(care.data.light_label != null || care.data.light_raw != null) && (
        <div className="flex items-center gap-2">
          <Glyph name="sun" size={16} className="shrink-0 text-amber-500" />
          {care.data.light_raw != null ? (
            <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-pumpkin-swirl rounded-full"
                style={{ width: `${(care.data.light_raw / 10) * 100}%` }}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <span className="text-xs text-text-muted shrink-0 w-20 text-right">
            {ci.lightLabels[care.data.light_label ?? ''] ?? care.data.light_label}
          </span>
        </div>
      )}

      {/* Precipitation */}
      {(care.data.precip_min_mm != null || care.data.precip_max_mm != null) && (
        <div className="flex items-start gap-2 text-sm">
          <Glyph name="droplet" size={16} className="shrink-0 text-sky-500" />
          <span className="text-text-muted">
            {care.data.precip_min_mm}–{care.data.precip_max_mm} {ci.mmPerYear}
          </span>
        </div>
      )}

      {/* Bloom months, duration, flower colours */}
      {showAll && <>
        {care.data.bloom_months.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Glyph name="flower" size={16} className="shrink-0 text-pink-500" />
            <span className="text-text-muted">
              {care.data.bloom_months.map(monthAbbr).join(' · ')}
            </span>
          </div>
        )}

        {(care.data.duration || care.data.leaf_retention != null) && (
          <div className="flex items-start gap-2 text-sm">
            <Glyph name="leaf" size={16} className="shrink-0 text-primary" />
            <span className="text-text-muted">
              {[
                care.data.duration
                  ? (ci.durations[care.data.duration.toLowerCase()] ?? care.data.duration)
                  : null,
                care.data.leaf_retention === true  ? ci.evergreen : null,
                care.data.leaf_retention === false ? ci.deciduous : null,
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}

        {care.data.flower_colors.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Glyph name="palette" size={16} className="shrink-0 text-text-muted" />
            <span className="text-text-muted capitalize">
              {ci.flowersLabel} {care.data.flower_colors.join(', ')}
            </span>
          </div>
        )}

        {care.data.avg_height_cm != null && (
          <div className="flex items-start gap-2 text-sm">
            <Glyph name="tree" size={16} className="shrink-0 text-text-muted" />
            <span className="text-text-muted">{ci.avgHeight} {care.data.avg_height_cm} cm</span>
          </div>
        )}

        {/* Toxicity and edibility — the two facts that matter with pets and
            children around. They used to exist only on an unreachable page. */}
        {care.data.toxicity && care.data.toxicity.toLowerCase() !== 'none' && (
          <div className="flex items-start gap-2 text-sm">
            <Glyph name="alert" size={16} className="shrink-0 text-overdue" />
            <span className="text-text-muted">
              {ci.toxicity} {ci.toxicityLevels[care.data.toxicity.toLowerCase()] ?? care.data.toxicity}
            </span>
          </div>
        )}

        {care.data.edible === true && (
          <div className="flex items-start gap-2 text-sm">
            <Glyph name="check" size={16} className="shrink-0 text-good" />
            <span className="text-text-muted">{ci.edible}</span>
          </div>
        )}

        {care.data.family && (
          <div className="flex items-start gap-2 text-sm">
            <Glyph name="book" size={16} className="shrink-0 text-text-muted" />
            <span className="text-text-muted italic">{care.data.family}</span>
          </div>
        )}
      </>}
    </>
  ) : null

  // ── Rain chart — the backend window is 14 days; bars, total and the
  // assessment badge all describe that same window (see #559). Per-day mm
  // labels are 8px on 14 bars, so they only appear from `sm:` up (#878). ──
  const rainChart = (divider: boolean) => rain.data ? (
    <div className={divider ? 'pt-3 mt-1 border-t border-border' : ''}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-bold tracking-widest uppercase text-text-muted inline-flex items-center gap-1.5">
          <Glyph name="droplet" size={13} className="text-sky-500" />
          {ci.rainfallTitle}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RAIN_BADGE_CLASS[rain.data.assessment] ?? ''}`}>
          {ci.rainBadges[rain.data.assessment] ?? rain.data.assessment}
        </span>
      </div>
      <div className="flex items-end gap-1 h-14 mb-1">
        {rain.data.days.map(day => {
          const maxMm = Math.max(...rain.data!.days.map(d => d.mm), 1)
          const barPx = Math.max((day.mm / maxMm) * 44, day.mm > 0 ? 4 : 2)
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-0.5">
              {day.mm > 0 && (
                <span className="hidden sm:block text-[8px] text-blue-400/80 font-medium leading-none">{day.mm}</span>
              )}
              <div className="w-full rounded-sm bg-blue-400/70" style={{ height: `${barPx}px` }} />
            </div>
          )
        })}
      </div>
      <div className="flex mb-2">
        {rain.data.days.map(day => (
          <span key={day.date} className="flex-1 text-center text-[9px] text-text-muted">
            {new Date(day.date).toLocaleDateString(t.locale, { weekday: 'narrow' })}
          </span>
        ))}
      </div>
      <p className="text-xs text-text-muted text-right">
        {ci.total}{' '}
        <span className="text-text font-medium">{rain.data.total_14day_mm ?? rain.data.total_7day_mm} mm</span>
      </p>
    </div>
  ) : rain.loading ? (
    <div className={divider ? 'pt-3 mt-1 border-t border-border' : ''}>
      <div className="h-3 w-32 bg-border rounded animate-pulse mb-2.5" />
      <div className="h-12 bg-border/50 rounded animate-pulse" />
    </div>
  ) : null

  // ── Temperature chart — 7-day window ──
  const tempChart = (divider: boolean) => temp.data ? (
    <div className={divider ? 'pt-3 mt-1 border-t border-border' : ''}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-bold tracking-widest uppercase text-text-muted inline-flex items-center gap-1.5">
          <Glyph name="thermometer" size={13} className="text-rose-500" />
          {ci.temperatureTitle}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TEMP_BADGE_CLASS[temp.data.assessment] ?? ''}`}>
          {ci.tempBadges[temp.data.assessment] ?? temp.data.assessment}
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
              <span className="hidden sm:block text-[8px] text-amber-500 font-medium leading-none">{day.max}°</span>
              <div className="w-full flex items-end" style={{ height: `${CHART_H}px` }}>
                <div className="relative w-full rounded-sm overflow-hidden" style={{ height: `${fullH}px` }}>
                  <div className="absolute bottom-0 w-full bg-amber-300/30" style={{ height: `${minH}px` }} />
                  <div className="absolute w-full bg-pumpkin-swirl/75" style={{ bottom: `${minH}px`, height: `${rangeH}px` }} />
                </div>
              </div>
              <span className="hidden sm:block text-[8px] text-text-muted/70 font-medium leading-none">{day.min}°</span>
              <span className="text-[9px] text-text-muted">
                {new Date(day.date).toLocaleDateString(t.locale, { weekday: 'narrow' })}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-text-muted text-right">
        {ci.avgMax} <span className="text-text font-medium">{temp.data.avg_max_7day}°C</span>
      </p>
    </div>
  ) : temp.loading ? (
    <div className={divider ? 'pt-3 mt-1 border-t border-border' : ''}>
      <div className="h-3 w-36 bg-border rounded animate-pulse mb-2.5" />
      <div className="h-14 bg-border/50 rounded animate-pulse" />
    </div>
  ) : null

  // The weather section is species-independent, so it renders even when the
  // species profile has no data — on mobile that used to be impossible,
  // because the only way in was a toggle that required `care.data` (#878).
  const weatherSection = showWeather && (rain.data || rain.loading || temp.data || temp.loading) ? (
    <section className="mb-6">
      <SectionHeader>{t.plantDetail.gardenWeather}</SectionHeader>
      <div className="card px-4 py-3">
        {rainChart(false)}
        {tempChart(true)}
      </div>
    </section>
  ) : null

  return (
    <>
      <section className="mb-6">
        <SectionHeader
          action={!split && !isLoading && !noData && care.data ? (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-primary font-medium inline-flex items-center gap-1"
            >
              {expanded ? ci.less : ci.more}
              <Glyph name={expanded ? 'chevron-up' : 'chevron-down'} size={13} />
            </button>
          ) : undefined}
        >
          {t.plantDetail.speciesProfile}
        </SectionHeader>
        <div className="card px-4 py-3 space-y-2.5">
          {speciesRows}
        </div>
      </section>
      {weatherSection}
    </>
  )
}

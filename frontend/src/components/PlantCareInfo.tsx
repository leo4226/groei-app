import { useState } from 'react'
import { usePlantCareInfo } from '../hooks/usePlantCareInfo'
import { useT } from '../context/LanguageContext'
import Glyph from './ui/Glyph'
import { GardenWeatherSummary } from './garden/GardenWeatherHistory'

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

  const split = layout === 'split'
  // In split layout everything is always visible; collapsible keeps the toggle.
  const showAll = split || expanded

  const ci = t.careInfo
  const monthAbbr = (name: string) => {
    const idx = MONTH_INDEX[name.toLowerCase()]
    return idx === undefined ? name : t.calendar.monthsShort[idx]
  }

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
            <span className="text-text-muted">
              {ci.flowersLabel}{' '}
              {care.data.flower_colors
                .map(c => ci.flowerColors[c.toLowerCase()] ?? c)
                .join(', ')}
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
              {ci.toxicityLevels[care.data.toxicity.toLowerCase()] ?? ci.toxicityUnknown(care.data.toxicity)}
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

  // Garden weather is one hardcoded lat/lon for the whole household, so the
  // charts live on the map's weather popover; the plant only needs the
  // conclusion (#878). Outdoor-only, mirroring alert_service._INDOOR_SKIP.
  const weatherSection = showWeather ? (
    <section className="mb-6">
      <SectionHeader>{t.plantDetail.gardenWeather}</SectionHeader>
      <GardenWeatherSummary />
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

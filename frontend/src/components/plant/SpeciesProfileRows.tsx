import { useState } from 'react'
import { usePlantCareInfo } from '../../hooks/usePlantCareInfo'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'

interface Props {
  plantId: number
  /** Desktop passport shows everything; mobile keeps a More/Less toggle. */
  alwaysExpanded?: boolean
}

function SkeletonRow() {
  return <div className="h-3.5 bg-border rounded animate-pulse w-3/4" />
}

/**
 * What this species is like: light, habit, size, and whether it is safe around
 * children and pets.
 *
 * Extracted from the old "Soortprofiel" card and folded into the ecology card,
 * which already described the same species from the other direction. Two rows
 * did not survive the move:
 *
 *  - Precipitation (600-1500 mm/year) — a global biome tolerance band. Amsterdam
 *    gets about 800; the number cannot change any decision a gardener makes.
 *  - Bloom months — the ecology card already shows flowering months from a
 *    different pipeline (LLM enrichment vs the curated species table), and the
 *    two disagreed on screen: "jul . aug" beside "Bloeit: jul aug sep". One
 *    source, shown once, beats two that argue.
 */
export default function SpeciesProfileRows({ plantId, alwaysExpanded = false }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const care = usePlantCareInfo(plantId)

  const showAll = alwaysExpanded || expanded
  const ci = t.careInfo

  const isLoading = care.loading
  const noData    = !care.loading && care.data?.source === 'not_found'

  const rows = isLoading ? (
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

      {/* Habit, flower colours, size, safety */}
      {showAll && <>
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

  return (
    <div className="space-y-2.5">
      {rows}
      {!alwaysExpanded && !isLoading && !noData && care.data && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-primary font-medium inline-flex items-center gap-1"
        >
          {expanded ? ci.less : ci.more}
          <Glyph name={expanded ? 'chevron-up' : 'chevron-down'} size={13} />
        </button>
      )}
    </div>
  )
}

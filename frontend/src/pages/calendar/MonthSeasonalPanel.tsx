import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import type { Phenology } from '../../types'
import { plantDisplayName } from '../../utils/plantDisplayName'
import {
  summarizeSeasonalMonth,
  type SeasonalContextKind,
  type SeasonalPlantSource,
} from './seasonalMonthModel'

const SEASONAL_PREVIEW_LIMIT = 3

export interface SeasonalPanelPlant extends SeasonalPlantSource {
  name: string
  species?: string | null
  species_common_name_nl?: string | null
  species_common_name_en?: string | null
  phenology: Phenology | null
}

interface Props {
  month1: number
  plants: SeasonalPanelPlant[]
  onOpenGardenYear?(): void
}

export default function MonthSeasonalPanel({ month1, plants, onOpenGardenYear }: Props) {
  const t = useT()
  const summary = useMemo(() => summarizeSeasonalMonth(plants, month1), [plants, month1])
  const groups: Array<{ kind: SeasonalContextKind; label: string }> = [
    { kind: 'bloom', label: t.calendar.bloom },
    { kind: 'sow', label: t.phenology.badgeSow },
    { kind: 'transplant', label: t.phenology.badgeTransplant },
    { kind: 'harvest', label: t.phenology.badgeHarvest },
  ]
  const visibleGroups = groups.filter(group => summary.context[group.kind].length > 0)

  if (plants.length === 0 || (visibleGroups.length === 0 && summary.noData.length === 0)) return null

  return (
    <section className="side-card seasonal-card" aria-labelledby="seasonal-month-title">
      <div className="sc-head">
        <div>
          <p className="sc-eye">{t.calendar.seasonalThisMonth}</p>
          <h2 className="sc-title" id="seasonal-month-title">{t.calendar.monthsLong[month1 - 1]}</h2>
        </div>
      </div>
      <p className="seasonal-scope">{t.calendar.seasonalScope}</p>
      <div className="seasonal-groups">
        {visibleGroups.map(group => {
          const entries = summary.context[group.kind]
          const remaining = entries.length - SEASONAL_PREVIEW_LIMIT
          const remainingLabel = remaining > 0 ? t.calendar.seasonalMore(remaining) : null

          return (
            <section className="seasonal-group" key={group.kind}>
              <h3>{group.label}</h3>
              <div className="seasonal-plant-list">
                {entries.slice(0, SEASONAL_PREVIEW_LIMIT).map(entry => (
                  <Link
                    className="seasonal-plant-link"
                    key={`${group.kind}:${entry.plant.id}`}
                    to={`/plants/${entry.plant.id}`}
                  >
                    {plantDisplayName(entry.plant, t.locale)}
                  </Link>
                ))}
                {remainingLabel && (
                  <span
                    aria-label={[group.label, remainingLabel].join(' ')}
                    className="seasonal-more"
                  >
                    {remainingLabel}
                  </span>
                )}
              </div>
            </section>
          )
        })}
      </div>
      {summary.noData.length > 0 && (
        <p className="seasonal-missing">{t.calendar.seasonalMissing(summary.noData.length)}</p>
      )}
      {onOpenGardenYear && (
        <button className="seasonal-year-link" type="button" onClick={onOpenGardenYear}>
          {t.calendar.seasonalGardenYear}
        </button>
      )}
    </section>
  )
}

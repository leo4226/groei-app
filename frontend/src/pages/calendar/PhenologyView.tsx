import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useFloreren } from '../../store/useFloreren'
import { alerts } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type { Plant } from '../../types'
import { plantDisplayName } from '../../utils/plantDisplayName'
import Glyph from '../../components/ui/Glyph'
import {
  seasonalPhaseLabel,
  summarizeSeasonalMonth,
  type SeasonalMonthEntry,
} from './seasonalMonthModel'

export default function PhenologyView() {
  const t = useT()
  const plants = useFloreren(s => s.plants)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const currentMonth = new Date().getMonth() + 1
  const [alertPlantIds, setAlertPlantIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    alerts.summary()
      .then(s => setAlertPlantIds(new Set(s.plant_ids_with_alerts)))
      .catch(() => {})
  }, [])

  const grouped = useMemo(
    () => summarizeSeasonalMonth(plants, selectedMonth),
    [plants, selectedMonth],
  )

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-text mb-4">{t.calendar.gardenYear}</h1>

      {/* Month selector */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-5 -mx-4 px-4">
        {t.calendar.monthsLong.map((name, i) => {
          const month = i + 1
          const isSelected = selectedMonth === month
          const isNow = month === currentMonth
          return (
            <button
              key={month}
              onClick={() => setSelectedMonth(month)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors shrink-0 ${
                isSelected
                  ? 'bg-primary text-white font-semibold'
                  : isNow
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'bg-surface text-text-muted border border-border'
              }`}
            >
              {name.slice(0, 3)}
            </button>
          )
        })}
      </div>

      <h2 className="text-base font-semibold text-text mb-3">
        {t.calendar.monthsLong[selectedMonth - 1]}
      </h2>

      {/* Action items */}
      {grouped.needsAction.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs font-semibold text-due uppercase tracking-wider mb-2">
            {t.phenology.actionRequired(grouped.needsAction.length)}
          </h3>
          <div className="space-y-2">
            {grouped.needsAction.map(entry => (
              <ActionCard
                key={entry.plant.id}
                entry={entry}
                month={selectedMonth}
                hasAlert={alertPlantIds.has(entry.plant.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Actively growing */}
      {grouped.growing.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs font-semibold text-good uppercase tracking-wider mb-2">
            {t.phenology.growingActive(grouped.growing.length)}
          </h3>
          <div className="space-y-1">
            {grouped.growing.map(entry => (
              <div key={entry.plant.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm text-text">
                  <Link to={`/plants/${entry.plant.id}`} className="hover:underline">
                    {plantDisplayName(entry.plant, t.locale)}
                  </Link>
                  {alertPlantIds.has(entry.plant.id) && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-orange-700 bg-orange-100"><Glyph name="alert" size={12} /></span>
                  )}
                </span>
                <span className="text-xs text-text-muted">
                  {seasonalPhaseLabel(entry.monthData, t.locale) ?? t.phenology.labelUnavailable}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dormant */}
      {grouped.dormant.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            {t.phenology.dormant(grouped.dormant.length)}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {grouped.dormant.map(entry => (
              <Link
                key={entry.plant.id}
                to={`/plants/${entry.plant.id}`}
                className={`text-xs border px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${alertPlantIds.has(entry.plant.id) ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-surface border-border text-text-muted'}`}
              >
                {plantDisplayName(entry.plant, t.locale)}{alertPlantIds.has(entry.plant.id) && <Glyph name="alert" size={11} />}
              </Link>
            ))}
          </div>
        </section>
      )}

      {grouped.needsAction.length === 0 && grouped.growing.length === 0 && grouped.dormant.length === 0 && (
        <p className="text-sm text-text-muted text-center py-8">
          {plants.length === 0 ? t.phenology.noPlants : t.phenology.noData}
        </p>
      )}
    </div>
  )
}

function ActionCard({ entry, month, hasAlert }: { entry: SeasonalMonthEntry<Plant>; month: number; hasAlert: boolean }) {
  const t = useT()
  const { plant, phenology, monthData } = entry
  const hasSow = phenology.sow_window?.includes(month)
  const hasTransplant = phenology.transplant_window?.includes(month)
  const hasHarvest = phenology.harvest_window?.includes(month)

  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <p className="font-medium text-text text-sm">
        <Link to={`/plants/${plant.id}`} className="hover:underline">
          {plantDisplayName(plant, t.locale)}
        </Link>
        {hasAlert && (
          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-orange-700 bg-orange-100"><Glyph name="alert" size={12} /></span>
        )}
      </p>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        {hasSow && (
          <span className="text-xs bg-good/15 text-good px-2.5 py-0.5 rounded-full font-medium">
            {t.phenology.badgeSow}
          </span>
        )}
        {hasTransplant && (
          <span className="text-xs bg-primary/15 text-primary px-2.5 py-0.5 rounded-full font-medium">
            {t.phenology.badgeTransplant}
          </span>
        )}
        {hasHarvest && (
          <span className="text-xs bg-due/15 text-due px-2.5 py-0.5 rounded-full font-medium">
            {t.phenology.badgeHarvest}
          </span>
        )}
      </div>
      {(() => {
        const actions = t.locale.startsWith('en')
          ? (monthData?.actions_en ?? [])
          : (monthData?.actions_nl ?? [])
        return actions.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {actions.map((action, i) => (
              <li key={i} className="text-xs text-text-muted"><Glyph name="chevron-right" size={11} aria-hidden /> {action}</li>
            ))}
          </ul>
        ) : null
      })()}
    </div>
  )
}

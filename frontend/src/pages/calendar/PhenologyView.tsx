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
    <section className="garden-year-view" data-calendar-view="year">
      {/* Page title lives in the shared CalendarPageMasthead; the month rail
          below is this view's context rail. */}
      <nav
        className="garden-year-months"
        data-garden-year-months
        aria-label={`${t.calendar.gardenYear}: ${t.calendar.monthsLong[selectedMonth - 1]}`}
      >
        {t.calendar.monthsLong.map((name, i) => {
          const month = i + 1
          const isSelected = selectedMonth === month
          const isNow = month === currentMonth
          return (
            <button
              key={month}
              type="button"
              aria-pressed={isSelected}
              aria-current={isNow ? 'date' : undefined}
              onClick={() => setSelectedMonth(month)}
              className={`garden-year-month min-h-11 ${isSelected ? 'is-selected' : ''} ${isNow ? 'is-current' : ''}`}
              title={name}
            >
              {name.slice(0, 3)}
            </button>
          )
        })}
      </nav>

      <div className="garden-year-month-heading">
        <span>{String(selectedMonth).padStart(2, '0')}</span>
        <h2>{t.calendar.monthsLong[selectedMonth - 1]}</h2>
      </div>

      {grouped.needsAction.length > 0 && (
        <section className="garden-year-section">
          <h3 className="garden-year-section-title is-due">
            {t.phenology.actionRequired(grouped.needsAction.length)}
          </h3>
          <div className="garden-year-card-list">
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

      {grouped.growing.length > 0 && (
        <section className="garden-year-section">
          <h3 className="garden-year-section-title is-growing">
            {t.phenology.growingActive(grouped.growing.length)}
          </h3>
          <div className="garden-year-paper-list">
            {grouped.growing.map(entry => (
              <div key={entry.plant.id} className="garden-year-growing-row">
                <span className="garden-year-plant-name">
                  <Link to={`/plants/${entry.plant.id}`}>
                    {plantDisplayName(entry.plant, t.locale)}
                  </Link>
                  {alertPlantIds.has(entry.plant.id) && (
                    <span className="garden-year-alert"><Glyph name="alert" size={12} /></span>
                  )}
                </span>
                <span className="garden-year-phase">
                  {seasonalPhaseLabel(entry.monthData, t.locale) ?? t.phenology.labelUnavailable}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {grouped.dormant.length > 0 && (
        <section className="garden-year-section">
          <h3 className="garden-year-section-title">
            {t.phenology.dormant(grouped.dormant.length)}
          </h3>
          <div className="garden-year-dormant-list">
            {grouped.dormant.map(entry => (
              <Link
                key={entry.plant.id}
                to={`/plants/${entry.plant.id}`}
                className={`garden-year-dormant-plant ${alertPlantIds.has(entry.plant.id) ? 'has-alert' : ''}`}
              >
                {plantDisplayName(entry.plant, t.locale)}
                {alertPlantIds.has(entry.plant.id) && <Glyph name="alert" size={11} />}
              </Link>
            ))}
          </div>
        </section>
      )}

      {grouped.needsAction.length === 0 && grouped.growing.length === 0 && grouped.dormant.length === 0 && (
        <p className="garden-year-empty">
          {plants.length === 0 ? t.phenology.noPlants : t.phenology.noData}
        </p>
      )}
    </section>
  )
}

function ActionCard({ entry, month, hasAlert }: { entry: SeasonalMonthEntry<Plant>; month: number; hasAlert: boolean }) {
  const t = useT()
  const { plant, phenology, monthData } = entry
  const hasSow = phenology.sow_window?.includes(month)
  const hasTransplant = phenology.transplant_window?.includes(month)
  const hasHarvest = phenology.harvest_window?.includes(month)

  return (
    <article className="garden-year-action-card">
      <p className="garden-year-action-title">
        <Link to={`/plants/${plant.id}`}>
          {plantDisplayName(plant, t.locale)}
        </Link>
        {hasAlert && (
          <span className="garden-year-alert"><Glyph name="alert" size={12} /></span>
        )}
      </p>
      <div className="garden-year-action-badges">
        {hasSow && (
          <span className="garden-year-action-badge is-sow">
            {t.phenology.badgeSow}
          </span>
        )}
        {hasTransplant && (
          <span className="garden-year-action-badge is-transplant">
            {t.phenology.badgeTransplant}
          </span>
        )}
        {hasHarvest && (
          <span className="garden-year-action-badge is-harvest">
            {t.phenology.badgeHarvest}
          </span>
        )}
      </div>
      {(() => {
        const actions = t.locale.startsWith('en')
          ? (monthData?.actions_en ?? [])
          : (monthData?.actions_nl ?? [])
        return actions.length > 0 ? (
          <ul className="garden-year-action-list">
            {actions.map((action, i) => (
              <li key={i}><Glyph name="chevron-right" size={11} aria-hidden /> {action}</li>
            ))}
          </ul>
        ) : null
      })()}
    </article>
  )
}

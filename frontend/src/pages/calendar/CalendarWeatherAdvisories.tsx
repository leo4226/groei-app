import { useState } from 'react'
import { Link } from 'react-router-dom'
import { weatherWarnings } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type { EventTypeId } from './calendarTypes'
import { EVENT_TYPE_UTILITY_KEY } from './calendarTypes'
import type { CalendarWeatherAdvisory } from './calendarWeatherAdvisoryModel'
import { partitionCalendarWeather } from './calendarWeatherAdvisoryModel'

interface CardProps {
  advisory: CalendarWeatherAdvisory
  seen?: boolean
  onChanged(): Promise<void> | void
  /** Viewer mode: acknowledge/restore renders disabled. */
  readOnly?: boolean
}

function AdvisoryCard({ advisory, seen = false, onChanged, readOnly = false }: CardProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const english = t.locale.startsWith('en')
  const reason = english ? advisory.reasonEn : advisory.reasonNl
  const action = english ? advisory.actionEn : advisory.actionNl
  const label = t.utility[EVENT_TYPE_UTILITY_KEY[advisory.type as EventTypeId]]
  const canAcknowledge = Boolean(advisory.warningId && advisory.severity)
  const writeTitle = t.settings.onlyEditorsCanChange

  async function updateAcknowledgment() {
    if (!advisory.warningId || !advisory.severity) return
    setSaving(true)
    setError(false)
    try {
      if (seen) {
        await weatherWarnings.restore(advisory.warningId)
      } else {
        await weatherWarnings.acknowledge({
          warning_id: advisory.warningId,
          care_type: advisory.type,
          forecast_date: advisory.date,
          severity: advisory.severity,
        })
      }
      await onChanged()
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className={`calendar-weather-advisory${seen ? ' seen' : ''}`} data-weather-advisory={advisory.type}>
      <div className="calendar-weather-advisory-head">
        <div>
          <p className="calendar-weather-kicker">{label}</p>
          <p className="calendar-weather-reason">
            {reason || t.calendar.weatherExplanationUnavailable}
          </p>
        </div>
        <span className="calendar-weather-count">{t.calendar.affectedPlants(advisory.affectedPlantCount)}</span>
      </div>
      {action && (
        <p className="calendar-weather-action">
          <strong>{t.calendar.weatherRecommendedAction}:</strong> {action}
        </p>
      )}
      <div className="calendar-weather-locations">
        {advisory.locations.map(location => (
          <div key={location.key} className="calendar-weather-location">
            <span>{location.mapName || t.calendar.affectedPlants(location.affectedPlantCount)}</span>
            {location.mapName && <span>{t.calendar.affectedPlants(location.affectedPlantCount)}</span>}
          </div>
        ))}
      </div>
      {advisory.locations.some(location => location.plants.length > 0) && (
        <>
          <button
            type="button"
            className="calendar-weather-disclosure"
            aria-expanded={expanded}
            onClick={() => setExpanded(open => !open)}
          >
            {expanded ? t.calendar.hidePlants : t.calendar.showPlants}
          </button>
          {expanded && (
            <div className="calendar-weather-plants">
              {advisory.locations.flatMap(location => location.plants).map(plant => (
                <Link key={plant.id} to={`/plants/${plant.id}`}>{plant.name || `#${plant.id}`}</Link>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p className="calendar-weather-error" role="alert">{t.common.error}</p>}
      {canAcknowledge && (
        <button
          type="button"
          className="calendar-weather-state-action"
          disabled={saving || readOnly}
          title={readOnly ? writeTitle : undefined}
          onClick={updateAcknowledgment}
        >
          {seen ? t.mapPage.weatherRestore : t.mapPage.weatherGotIt}
        </button>
      )}
    </article>
  )
}

interface Props {
  advisories: CalendarWeatherAdvisory[]
  onChanged(): Promise<void> | void
  /** Viewer mode: acknowledge/restore controls render disabled. */
  readOnly?: boolean
}

export default function CalendarWeatherAdvisories({ advisories, onChanged, readOnly = false }: Props) {
  const t = useT()
  const { active, seen } = partitionCalendarWeather(advisories)

  return (
    <>
      {active.map(advisory => (
        <AdvisoryCard key={advisory.key} advisory={advisory} onChanged={onChanged} readOnly={readOnly} />
      ))}
      {seen.length > 0 && (
        <details className="calendar-weather-seen">
          <summary>{t.mapPage.weatherSeenGuidance} · {seen.length}</summary>
          <div className="calendar-weather-seen-list">
            {seen.map(advisory => (
              <AdvisoryCard key={advisory.key} advisory={advisory} seen onChanged={onChanged} readOnly={readOnly} />
            ))}
          </div>
        </details>
      )}
    </>
  )
}

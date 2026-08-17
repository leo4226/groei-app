import { useT } from '../../context/LanguageContext'
import CalendarEventLink from './CalendarEventLink'
import { isActionable, type CalendarEvent } from './calendarTypes'
import type { MoistureAdvisoryGroup } from './moistureAdvisoryModel'

interface Props {
  advisory: MoistureAdvisoryGroup
  todayIso: string
  saving: string | null
  onCheck(event: CalendarEvent): void
  mapSlugs: ReadonlyMap<number, string>
  /** Viewer mode: the check button renders disabled. */
  readOnly?: boolean
}

function affectedCount(event: CalendarEvent): number {
  return event.group_count
    ?? event.group_members?.length
    ?? event.group_member_schedule_ids?.length
    ?? 0
}

export default function MoistureAdvisory({ advisory, todayIso, saving, onCheck, mapSlugs, readOnly = false }: Props) {
  const t = useT()
  const english = t.locale.startsWith('en')
  const reason = english ? advisory.reasonEn : advisory.reasonNl
  const action = english ? advisory.actionEn : advisory.actionNl
  const writeTitle = t.settings.onlyEditorsCanChange

  return (
    <section
      className="calendar-moisture-advisory"
      role="note"
      aria-label={t.calendar.moistureCheckTitle}
    >
      <header className="calendar-moisture-advisory-copy">
        <p className="calendar-moisture-advisory-kicker">{t.calendar.weatherContext}</p>
        <h4>{t.calendar.moistureCheckTitle}</h4>
        <p className="calendar-moisture-advisory-reason">
          {reason || t.calendar.weatherExplanationUnavailable}
        </p>
        {action && (
          <p className="calendar-moisture-advisory-action">
            <strong>{t.calendar.weatherRecommendedAction}:</strong> {action}
          </p>
        )}
      </header>
      <div className="calendar-moisture-map-list">
        {advisory.mapEvents.map(event => {
          const busy = saving === event.id
          const actionable = isActionable(event, todayIso)
          return (
            <div
              key={event.id}
              className="calendar-moisture-map-row"
              data-moisture-map-row
              data-moisture-map-id={event.map_id ?? undefined}
              aria-busy={busy || undefined}
            >
              <div className="calendar-moisture-map-identity">
                <CalendarEventLink
                  event={event}
                  mapSlugs={mapSlugs}
                  className="calendar-moisture-map-link"
                >
                  {event.map_name}
                </CalendarEventLink>
                <span>{t.calendar.affectedPlants(affectedCount(event))}</span>
              </div>
              {actionable && (
                <button
                  type="button"
                  className="calendar-moisture-check-button"
                  disabled={busy || readOnly}
                  title={readOnly ? writeTitle : undefined}
                  onClick={() => onCheck(event)}
                >
                  {busy ? t.common.loading : t.calendar.moistureCheckAction}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

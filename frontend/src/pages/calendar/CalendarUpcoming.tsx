import { useMemo } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY } from './calendarTypes'
import { useT } from '../../context/LanguageContext'

interface Props {
  todayIso: string
  events: CalendarEvent[]
}

export default function CalendarUpcoming({ todayIso, events }: Props) {
  const t = useT()

  const groups = useMemo(() => {
    const future = events.filter(e => e.date > todayIso)
    const map: Record<string, CalendarEvent[]> = {}
    future.forEach(e => {
      if (!map[e.type]) map[e.type] = []
      map[e.type].push(e)
    })
    // sort groups by count desc so most common tasks appear first
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length)
  }, [events, todayIso])

  const total = groups.reduce((s, [, g]) => s + g.length, 0)

  function firstLetter(type: string): string {
    const key = EVENT_TYPE_UTILITY_KEY[type as EventTypeId]
    const label = key ? (t.utility[key] ?? type) : type
    return label[0].toUpperCase()
  }

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">{t.calendar.upcoming}</div>
        <h2 className="sc-title">{t.calendar.upcomingTitlePrefix}<em>{t.calendar.upcomingTitleEm}</em>.</h2>
        {total > 0 && (
          <p className="sc-sub">{total} {total === 1 ? t.calendar.taskSingular! : t.calendar.tasks}.</p>
        )}
      </div>
      <div className="agenda-list">
        {total === 0 && (
          <div className="agenda-empty" style={{ padding: '18px 22px' }}>{t.calendar.silence}</div>
        )}
        {groups.map(([type, groupEvents]) => {
          const def = EVENT_TYPE_BY_ID[type]
          const label = t.utility[EVENT_TYPE_UTILITY_KEY[type]] ?? type

          return (
            <div key={type} className="agenda-item agenda-group">
              <div className={`agenda-icon ag-icon-group ${def?.cssClass ?? ''}`}>
                <span className="ag-type-letter">{firstLetter(type)}</span>
              </div>
              <div className="agenda-meta">
                <p className="what">{label}</p>
              </div>
              <span className="ag-group-badge">{groupEvents.length}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

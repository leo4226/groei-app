import type { CalendarEvent } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY } from './calendarTypes'
import { MONTH_SHORT_NL } from './dateUtils'
import { useT } from '../../context/LanguageContext'

interface Props {
  todayIso: string
  events: CalendarEvent[]
}

export default function CalendarUpcoming({ todayIso, events }: Props) {
  const t = useT()
  const future = events
    .filter(e => e.date > todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">{t.calendar.upcoming}</div>
        <h2 className="sc-title">{t.calendar.upcomingTitlePrefix}<em>{t.calendar.upcomingTitleEm}</em>.</h2>
        <p className="sc-sub">{t.calendar.upcomingSubtitle}</p>
      </div>
      <div className="up-list">
        {future.length === 0 && (
          <div className="agenda-empty" style={{ padding: '18px 22px' }}>{t.calendar.silence}</div>
        )}
        {future.map(e => {
          const [, m, d] = e.date.split('-').map(Number)
          const def = EVENT_TYPE_BY_ID[e.type]
          return (
            <div key={e.id} className="up-item">
              <div className="up-date">
                <span className="d">{d}</span>
                <span className="m">{MONTH_SHORT_NL[m - 1]}</span>
              </div>
              <div className="up-meta">
                <p className="what">{e.plant_name ?? t.utility[EVENT_TYPE_UTILITY_KEY[e.type]] ?? e.type}</p>
                <p className="who">{t.utility[EVENT_TYPE_UTILITY_KEY[e.type]] ?? e.type}</p>
              </div>
              <span className="up-pip" style={{ background: def?.color ?? '#2F5D3A' }} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

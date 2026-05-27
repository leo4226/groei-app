import { useMemo } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_UTILITY_KEY } from './calendarTypes'
import { useT } from '../../context/LanguageContext'

interface Props {
  todayIso: string
  events: CalendarEvent[]
}

export default function CalendarUpcoming({ todayIso, events }: Props) {
  const t = useT()

  const counts = useMemo(() => {
    const future = events.filter(e => e.date > todayIso)
    const map: Record<string, number> = {}
    future.forEach(e => { map[e.type] = (map[e.type] || 0) + 1 })
    return { total: future.length, map }
  }, [events, todayIso])

  const summary = Object.entries(counts.map)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const lbl = t.utility[EVENT_TYPE_UTILITY_KEY[k as EventTypeId]] ?? k
      return `${v} ${lbl.toLowerCase()}`
    })
    .join(' · ')

  return (
    <section className="side-card upcoming-summary">
      <div className="sc-head">
        <div className="sc-eye">{t.calendar.upcoming}</div>
        <h2 className="sc-title">{t.calendar.upcomingTitlePrefix}<em>{t.calendar.upcomingTitleEm}</em>.</h2>
        {counts.total > 0 && (
          <p className="sc-sub">
            {counts.total} {counts.total === 1 ? t.calendar.taskSingular! : t.calendar.tasks}
            {summary ? ` · ${summary}` : ''}.
          </p>
        )}
      </div>
      {counts.total === 0 && (
        <div className="agenda-empty" style={{ padding: '18px 22px' }}>
          {t.calendar.silence}
        </div>
      )}
    </section>
  )
}

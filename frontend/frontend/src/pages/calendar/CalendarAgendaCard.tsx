import type { CalendarEvent } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY } from './calendarTypes'
import { DAY_LONG_NL, MONTH_SHORT_NL, dowMon } from './dateUtils'
import { useT } from '../../context/LanguageContext'

interface Props {
  selectedIso: string
  events: CalendarEvent[]
}

export default function CalendarAgendaCard({ selectedIso, events }: Props) {
  const t = useT()
  const [y, m, d] = selectedIso.split('-').map(Number)
  const dayName = DAY_LONG_NL[dowMon(y, m, d)]
  const monthShort = MONTH_SHORT_NL[m - 1]

  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })
  const summary = Object.entries(counts).map(([k, v]) => {
    const lbl = t.utility[EVENT_TYPE_UTILITY_KEY[k]] ?? k
    return `${v} ${lbl.toLowerCase()}`
  }).join(' · ')

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">{t.calendar.agendaSelectedDay}</div>
        <h2 className="sc-title">{dayName} <em>{d} {monthShort}</em></h2>
        <p className="sc-sub">
          {events.length
            ? `${events.length} ${events.length === 1 ? t.calendar.taskSingular! : t.calendar.tasks} · ${summary}.`
            : t.calendar.noTasksRest}
        </p>
      </div>
      <div className="agenda-list">
        {events.length === 0 && (
          <div className="agenda-empty">
            <span className="em">{t.calendar.freeDay}</span>
            {' '}{t.calendar.gardenManagesItself}
          </div>
        )}
        {events.map(e => {
          const def = EVENT_TYPE_BY_ID[e.type]
          const iconSrc = e.plant_icon_variant ? `/icons/${e.plant_icon_variant}.svg`
            : e.plant_id ? '/icons/seed.svg' : null
          return (
            <div key={e.id} className="agenda-item">
              <div className={`agenda-icon ${def?.cssClass ?? ''}`}>
                {iconSrc && <img src={iconSrc} alt="" />}
              </div>
              <div className="agenda-meta">
                <p className="what">{t.utility[EVENT_TYPE_UTILITY_KEY[e.type]] ?? e.type} · <em>{e.plant_name ?? '—'}</em></p>
                <p className="who">{e.overdue ? t.calendar.overdueLabel : ''}</p>
              </div>
              <div className="agenda-time">
                —<span className="dur">{t.utility[EVENT_TYPE_UTILITY_KEY[e.type]] ?? e.type}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="agenda-foot">
        <span>{t.calendar.editLabel}</span>
        <span>—</span>
      </div>
    </section>
  )
}

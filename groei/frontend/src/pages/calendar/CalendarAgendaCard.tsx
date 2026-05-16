import type { CalendarEvent } from './calendarTypes'
import { EVENT_TYPE_BY_ID } from './calendarTypes'
import { DAY_LONG_NL, MONTH_SHORT_NL, dowMon } from './dateUtils'

interface Props {
  selectedIso: string
  events: CalendarEvent[]
}

export default function CalendarAgendaCard({ selectedIso, events }: Props) {
  const [y, m, d] = selectedIso.split('-').map(Number)
  const dayName = DAY_LONG_NL[dowMon(y, m, d)]
  const monthShort = MONTH_SHORT_NL[m - 1]

  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })
  const summary = Object.entries(counts).map(([k, v]) => {
    const lbl = EVENT_TYPE_BY_ID[k]?.labelNl ?? k
    return `${v} ${lbl.toLowerCase()}`
  }).join(' · ')

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">§ Agenda — geselecteerde dag</div>
        <h2 className="sc-title">{dayName} <em>{d} {monthShort}</em></h2>
        <p className="sc-sub">
          {events.length
            ? `${events.length} ta${events.length === 1 ? 'ak' : 'ken'} · ${summary}.`
            : 'Geen taken — rust.'}
        </p>
      </div>
      <div className="agenda-list">
        {events.length === 0 && (
          <div className="agenda-empty">
            <span className="em">Vrije dag</span>
            De tuin redt zich vandaag zelf.
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
                <p className="what">{def?.labelNl ?? e.type} · <em>{e.plant_name ?? '—'}</em></p>
                <p className="who">{e.overdue ? 'Overtijd' : ''}</p>
              </div>
              <div className="agenda-time">
                —<span className="dur">{def?.labelNl ?? e.type}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="agenda-foot">
        <span>Bewerken</span>
        <span>—</span>
      </div>
    </section>
  )
}

import { useMemo } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY } from './calendarTypes'
import { DAY_LONG_NL, MONTH_SHORT_NL, dowMon } from './dateUtils'
import { useT } from '../../context/LanguageContext'

interface Props { events: CalendarEvent[]; todayIso: string }

export default function MobileAgendaList({ events, todayIso }: Props) {
  const t = useT()
  const grouped = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    events.forEach(e => {
      const arr = m.get(e.date) ?? []
      arr.push(e)
      m.set(e.date, arr)
    })
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [events])

  if (grouped.length === 0) {
    return <p style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>{t.calendar.noTasksRest}</p>
  }

  return (
    <div style={{ padding: '0 12px 32px' }}>
      {grouped.map(([iso, list]) => {
        const [y, m, d] = iso.split('-').map(Number)
        const isToday = iso === todayIso
        return (
          <section key={iso} style={{ marginTop: 18 }}>
            <h3 style={{
              fontFamily: 'Fraunces, serif', fontSize: 18, margin: '0 0 6px',
              color: isToday ? '#2F5D3A' : '#1F2A1E',
            }}>
              {DAY_LONG_NL[dowMon(y, m, d)]} {d} {MONTH_SHORT_NL[m - 1]}
              {isToday && <em style={{ marginLeft: 8, fontSize: 12, color: '#B2664A' }}>{t.calendar.today}</em>}
            </h3>
            {list.map(e => {
              const def = EVENT_TYPE_BY_ID[e.type as EventTypeId]
              return (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: '#FFFEF9',
                  borderLeft: `3px solid ${def?.color ?? '#2F5D3A'}`,
                  borderRadius: 4, marginBottom: 6,
                }}>
                  <span style={{ fontSize: 12, color: '#8A9482', minWidth: 64 }}>{t.utility[EVENT_TYPE_UTILITY_KEY[e.type as EventTypeId]] ?? e.type}</span>
                  <span style={{ fontFamily: 'Fraunces, serif', fontSize: 14 }}>{e.plant_name ?? '—'}</span>
                  {e.overdue && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#B2664A' }}>{t.calendar.overdueLabel}</span>}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

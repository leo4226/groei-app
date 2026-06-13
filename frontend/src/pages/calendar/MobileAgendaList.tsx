import { useMemo } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY, isActionable } from './calendarTypes'
import { DAY_LONG_NL, MONTH_SHORT_NL, dowMon } from './dateUtils'
import { useT } from '../../context/LanguageContext'

interface Props {
  events: CalendarEvent[]
  todayIso: string
  saving: string | null
  onDone: (e: CalendarEvent) => void
  onSkip: (e: CalendarEvent) => void
}

export default function MobileAgendaList({ events, todayIso, saving, onDone, onSkip }: Props) {
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
              color: isToday ? 'var(--color-primary)' : 'var(--color-text)',
            }}>
              {DAY_LONG_NL[dowMon(y, m, d)]} {d} {MONTH_SHORT_NL[m - 1]}
              {isToday && <em style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-secondary)' }}>{t.calendar.today}</em>}
            </h3>
            {list.map(e => {
              const def = EVENT_TYPE_BY_ID[e.type as EventTypeId]
              return (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'var(--color-paper)',
                  borderLeft: `3px solid ${def?.color ?? 'var(--color-primary)'}`,
                  borderRadius: 4, marginBottom: 6,
                  opacity: saving === e.id ? 0.5 : 1, transition: 'opacity 0.15s',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 64 }}>{t.utility[EVENT_TYPE_UTILITY_KEY[e.type as EventTypeId]] ?? e.type}</span>
                  <span style={{ fontFamily: 'Fraunces, serif', fontSize: 14 }}>{e.plant_name ?? '—'}</span>
                  {isActionable(e, todayIso) ? (
                    <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', flexShrink: 0 }}>
                      <button disabled={saving === e.id} onClick={() => onDone(e)} style={{ padding: '4px 10px', borderRadius: 99, background: 'var(--color-primary)', color: '#fff', border: 'none', fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 10, cursor: 'pointer' }}>
                        {t.dashboard.actions.done}
                      </button>
                      <button disabled={saving === e.id} onClick={() => onSkip(e)} style={{ padding: '4px 10px', borderRadius: 99, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontFamily: 'Fraunces, serif', fontSize: 10, cursor: 'pointer' }}>
                        {t.dashboard.actions.skip}
                      </button>
                    </div>
                  ) : e.overdue ? (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-secondary)' }}>{t.calendar.overdueLabel}</span>
                  ) : null}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

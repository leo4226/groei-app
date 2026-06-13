import { useMemo, useState } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY, isActionable } from './calendarTypes'
import { DAY_LONG_NL, MONTH_SHORT_NL, dowMon } from './dateUtils'
import { useT } from '../../context/LanguageContext'

interface Props {
  selectedIso: string
  events: CalendarEvent[]
  todayIso: string
  saving: string | null
  onDone: (e: CalendarEvent) => void
  onSkip: (e: CalendarEvent) => void
}

export default function CalendarAgendaCard({ selectedIso, events, todayIso, onDone, onSkip }: Props) {
  const t = useT()
  const [y, m, d] = selectedIso.split('-').map(Number)
  const dayName = DAY_LONG_NL[dowMon(y, m, d)]
  const monthShort = MONTH_SHORT_NL[m - 1]
  const [savingType, setSavingType] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach(e => {
      if (!map[e.type]) map[e.type] = []
      map[e.type].push(e)
    })
    return map
  }, [events])

  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })
  const summary = Object.entries(counts).map(([k, v]) => {
    const lbl = t.utility[EVENT_TYPE_UTILITY_KEY[k as EventTypeId]] ?? k
    return `${v} ${lbl.toLowerCase()}`
  }).join(' · ')

  async function handleBatchDone(groupId: string, groupEvents: CalendarEvent[]) {
    setSavingType(groupId)
    try {
      await Promise.all(groupEvents.map(e => onDone(e)))
    } finally {
      setSavingType(null)
    }
  }

  async function handleBatchSkip(groupId: string, groupEvents: CalendarEvent[]) {
    setSavingType(groupId)
    try {
      await Promise.all(groupEvents.map(e => onSkip(e)))
    } finally {
      setSavingType(null)
    }
  }

  function firstLetter(type: string): string {
    const key = EVENT_TYPE_UTILITY_KEY[type as EventTypeId]
    const label = key ? (t.utility[key] ?? type) : type
    return label[0].toUpperCase()
  }

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
        {Object.entries(groups).map(([type, groupEvents]) => {
          const def = EVENT_TYPE_BY_ID[type]
          const label = t.utility[EVENT_TYPE_UTILITY_KEY[type as EventTypeId]] ?? type
          const busyGroup = savingType === type

          return (
            <div key={type} className="agenda-item agenda-group" style={{ opacity: busyGroup ? 0.5 : 1 }}>
              <div className={`agenda-icon ag-icon-group ${def?.cssClass ?? ''}`}>
                <span className="ag-type-letter">{firstLetter(type)}</span>
              </div>
              <div className="agenda-meta">
                <p className="what">{label}</p>
                {groupEvents.some(e => e.overdue) && (
                  <p className="who">{t.calendar.overdueLabel}</p>
                )}
              </div>
              <span className="ag-group-badge">{groupEvents.length}</span>
              {groupEvents.some(e => isActionable(e, todayIso)) ? (
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button disabled={busyGroup}
                    onClick={() => handleBatchDone(type, groupEvents)}
                    className="ag-btn ag-btn-done">
                    {t.dashboard.actions.done}
                  </button>
                  <button disabled={busyGroup}
                    onClick={() => handleBatchSkip(type, groupEvents)}
                    className="ag-btn ag-btn-skip">
                    {t.dashboard.actions.skip}
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

import { useMemo, useState } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY, isActionable } from './calendarTypes'
import { useT } from '../../context/LanguageContext'
import { agendaPlantName } from './workAgendaModel'
import CalendarEventLink from './CalendarEventLink'
import CalendarWeatherContext from './CalendarWeatherContext'
import Glyph from '../../components/ui/Glyph'

interface Props {
  selectedIso: string
  events: CalendarEvent[]
  completedEvents?: CalendarEvent[]
  todayIso: string
  saving: string | null
  onDone: (e: CalendarEvent) => void
  onSkip: (e: CalendarEvent) => void
  undoMsg: string | null
  onGardenUndo: () => void
  mapSlugs: ReadonlyMap<number, string>
}

export default function CalendarAgendaCard({
  selectedIso,
  events,
  completedEvents = [],
  todayIso,
  onDone,
  onSkip,
  undoMsg,
  onGardenUndo,
  mapSlugs,
}: Props) {
  const t = useT()
  const locale = t.locale || 'nl-NL'
  const [y, m, d] = selectedIso.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(dateObj)
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' }).format(dateObj).replace('.', '')
  const [savingType, setSavingType] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach(e => {
      const groupId = e.grouped ? `${e.type}:${e.map_id}` : `event:${e.id}`
      if (!map[groupId]) map[groupId] = []
      map[groupId].push(e)
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
    <section className="side-card" data-calendar-context="agenda">
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
        {Object.entries(groups).map(([groupId, groupEvents]) => {
          const firstEvent = groupEvents[0]
          const type = firstEvent.type
          const def = EVENT_TYPE_BY_ID[type]
          const careLabel = t.utility[EVENT_TYPE_UTILITY_KEY[type]] ?? type
          const identity = firstEvent.grouped
            ? firstEvent.map_name
            : agendaPlantName(firstEvent, t.locale)
          const label = identity ? `${careLabel} · ${identity}` : careLabel
          const affectedCount = firstEvent.group_count
            ?? firstEvent.group_member_schedule_ids?.length
            ?? 0
          const busyGroup = savingType === groupId

          return (
            <div key={groupId} className="agenda-item agenda-group" style={{ opacity: busyGroup ? 0.5 : 1 }}>
              <div className={`agenda-icon ag-icon-group ${def?.cssClass ?? ''}`}>
                <span className="ag-type-letter">{firstLetter(type)}</span>
              </div>
              <div className="agenda-meta">
                <p className="what">
                  <CalendarEventLink
                    event={firstEvent}
                    mapSlugs={mapSlugs}
                    className="agenda-identity-link"
                  >
                    {label}
                  </CalendarEventLink>
                </p>
                {groupEvents.some(e => e.overdue) && (
                  <p className="who">{t.calendar.overdueLabel}</p>
                )}
                <CalendarWeatherContext event={firstEvent} />
              </div>
              {firstEvent.grouped && affectedCount > 0 && (
                <span className="ag-group-badge">{affectedCount}</span>
              )}
              {groupEvents.some(e => isActionable(e, todayIso)) ? (
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button disabled={busyGroup}
                    onClick={() => handleBatchDone(groupId, groupEvents)}
                    className="ag-btn ag-btn-done">
                    {firstEvent.type === 'moisture_check'
                      ? t.calendar.moistureCheckTitle
                      : firstEvent.grouped
                        ? t.calendar.completeAndAlign
                        : t.dashboard.actions.done}
                  </button>
                  {!firstEvent.grouped && (
                    <button disabled={busyGroup}
                      onClick={() => handleBatchSkip(groupId, groupEvents)}
                      className="ag-btn ag-btn-skip">
                      {t.dashboard.actions.skip}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {completedEvents.length > 0 && (
        <div className="agenda-history" data-calendar-history>
          <div className="agenda-history-heading">
            <Glyph name="check" size={11} />
            {t.calendar.completedHistory}
          </div>
          <div className="agenda-list">
            {completedEvents.map(event => {
              const type = event.type
              const def = EVENT_TYPE_BY_ID[type]
              const careLabel = t.utility[EVENT_TYPE_UTILITY_KEY[type]] ?? type
              const identity = event.grouped
                ? event.map_name
                : agendaPlantName(event, t.locale)
              const label = identity ? `${careLabel} · ${identity}` : careLabel
              const affectedCount = event.group_count
                ?? event.group_member_schedule_ids?.length
                ?? 0

              return (
                <div key={event.id} className="agenda-item agenda-group completed">
                  <div className={`agenda-icon ag-icon-group ${def?.cssClass ?? ''}`}>
                    <span className="ag-type-letter" aria-hidden="true">
                      <Glyph name="check" size={16} />
                    </span>
                  </div>
                  <div className="agenda-meta">
                    <p className="what">
                      <CalendarEventLink
                        event={event}
                        mapSlugs={mapSlugs}
                        className="agenda-identity-link"
                      >
                        {label}
                      </CalendarEventLink>
                    </p>
                  </div>
                  {event.grouped && affectedCount > 0 && (
                    <span className="ag-group-badge">{affectedCount}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {undoMsg && (
        <div className="sc-head" style={{ padding: '14px 22px', borderTop: '1px solid var(--color-border)' }}>
          <p className="sc-sub" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            {undoMsg}
          </p>
          <button onClick={onGardenUndo} className="ag-btn ag-btn-skip" style={{ fontSize: 12 }}>
            {t.calendar.undoGroup}
          </button>
        </div>
      )}
    </section>
  )
}
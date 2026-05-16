import { useMemo, useState } from 'react'
import CalendarMasthead from './CalendarMasthead'
import CalendarLegend from './CalendarLegend'
import CalendarGrid from './CalendarGrid'
import CalendarAgendaCard from './CalendarAgendaCard'
import CalendarAlmanac from './CalendarAlmanac'
import CalendarUpcoming from './CalendarUpcoming'
import CalendarMoon from './CalendarMoon'
import MobileAgendaList from './MobileAgendaList'
import { useCalendarEvents } from './useCalendarEvents'
import { useIsNarrow } from './useIsNarrow'
import { EVENT_TYPES, type EventTypeId } from './calendarTypes'
import { isoDate } from './dateUtils'
import type { CalendarViewMode } from './PlanningCalendarPage'

interface Props {
  viewMode: CalendarViewMode
  onSetView(v: CalendarViewMode): void
}

export default function MonthView({ viewMode, onSetView }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month1, setMonth1] = useState(now.getMonth() + 1)
  const todayIso = isoDate(now)
  const [selectedIso, setSelectedIso] = useState(todayIso)
  const [activeTypes, setActiveTypes] = useState<Set<EventTypeId>>(
    () => new Set(EVENT_TYPES.map(t => t.id)),
  )

  const { events, loading, error } = useCalendarEvents(year, month1)
  const isNarrow = useIsNarrow(1200)

  const filtered = useMemo(
    () => events.filter(e => activeTypes.has(e.type)),
    [events, activeTypes],
  )
  const selectedEvents = useMemo(
    () => filtered.filter(e => e.date === selectedIso),
    [filtered, selectedIso],
  )
  const bloomCount = filtered.filter(e => e.type === 'bloom').length
  const openCount = filtered.filter(e => e.overdue).length

  function prev() {
    if (month1 === 1) { setYear(y => y - 1); setMonth1(12) }
    else setMonth1(m => m - 1)
  }
  function next() {
    if (month1 === 12) { setYear(y => y + 1); setMonth1(1) }
    else setMonth1(m => m + 1)
  }
  function toggle(id: EventTypeId) {
    setActiveTypes(curr => {
      const n = new Set(curr)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <>
      <CalendarMasthead
        year={year} month1={month1} viewMode={viewMode}
        onPrev={prev} onNext={next} onSetView={onSetView}
        taskCount={filtered.length} bloomCount={bloomCount} openCount={openCount}
      />
      <CalendarLegend events={events} activeTypes={activeTypes} onToggle={toggle} />
      {isNarrow ? (
        <MobileAgendaList events={filtered} todayIso={todayIso} />
      ) : (
        <main>
          <CalendarGrid
            year={year} month1={month1}
            events={filtered}
            todayIso={todayIso}
            selectedIso={selectedIso}
            onSelect={setSelectedIso}
          />
          <aside className="col-side">
            <CalendarAgendaCard selectedIso={selectedIso} events={selectedEvents} />
            <CalendarAlmanac month1={month1} />
            <CalendarUpcoming todayIso={todayIso} events={filtered} />
            <CalendarMoon year={year} month1={month1} todayDay={now.getDate()} />
          </aside>
        </main>
      )}
      {loading && <div style={{ padding: 16, opacity: 0.6 }}>Laden…</div>}
      {error && <div style={{ padding: 16, color: 'crimson' }}>Fout: {error}</div>}
    </>
  )
}

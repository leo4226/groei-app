import { useMemo, useState, type ReactNode } from 'react'
import CalendarMasthead from './CalendarMasthead'
import CalendarLegend from './CalendarLegend'
import CalendarGrid from './CalendarGrid'
import CalendarAgendaCard from './CalendarAgendaCard'
import CalendarAlmanac from './CalendarAlmanac'
import CalendarUpcoming from './CalendarUpcoming'
import MobileAgendaList from './MobileAgendaList'
import { useCalendarEvents } from './useCalendarEvents'
import { useCalendarActions } from './useCalendarActions'
import { useIsNarrow } from './useIsNarrow'
import { EVENT_TYPES, type EventTypeId } from './calendarTypes'
import { isoDate } from './dateUtils'
import type { CalendarViewMode } from './calendarViewModel'
import { useT } from '../../context/LanguageContext'

interface Props {
  viewMode: CalendarViewMode
  onSetView(v: CalendarViewMode): void
  env: string
  environmentFilter: ReactNode
}

export default function MonthView({ viewMode, onSetView, env, environmentFilter }: Props) {
  const t = useT()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month1, setMonth1] = useState(now.getMonth() + 1)
  const todayIso = isoDate(now)
  const [selectedIso, setSelectedIso] = useState(todayIso)
  const [activeTypes, setActiveTypes] = useState<Set<EventTypeId>>(
    () => new Set(EVENT_TYPES.map(t => t.id)),
  )
  const { events, loading, error } = useCalendarEvents(year, month1, env)
  const {
    actionError,
    doneIds,
    handleDone,
    handleGardenUndo,
    handleSkip,
    saving,
    undoMsg,
  } = useCalendarActions(events)

  const isNarrow = useIsNarrow(1200)

  const filtered = useMemo(
    () => events.filter(e => activeTypes.has(e.type) && !doneIds.has(e.id)),
    [events, activeTypes, doneIds],
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
        year={year} month1={month1} todayDay={now.getDate()} viewMode={viewMode}
        onPrev={prev} onNext={next} onSetView={onSetView}
        taskCount={filtered.length} bloomCount={bloomCount} openCount={openCount}
        environmentFilter={environmentFilter}
      />
      <CalendarLegend events={events} activeTypes={activeTypes} onToggle={toggle} />
      {isNarrow ? (
        <MobileAgendaList
          events={filtered}
          todayIso={todayIso}
          saving={saving}
          onDone={handleDone}
          onSkip={handleSkip}
          undoMsg={undoMsg}
          onGardenUndo={handleGardenUndo}
          actionError={actionError}
        />
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
            <CalendarAgendaCard selectedIso={selectedIso} events={selectedEvents} todayIso={todayIso} saving={saving} onDone={handleDone} onSkip={handleSkip} undoMsg={undoMsg} onGardenUndo={handleGardenUndo} />
            <CalendarUpcoming todayIso={todayIso} events={filtered} />
            <CalendarAlmanac month1={month1} />
          </aside>
        </main>
      )}
      {loading && <div style={{ padding: 16, opacity: 0.6 }}>{t.common.loading}</div>}
      {error && <div style={{ padding: 16, color: 'crimson' }}>{t.common.error}: {error}</div>}
    </>
  )
}

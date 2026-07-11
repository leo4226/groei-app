import { useMemo, useState, type ReactNode } from 'react'
import CalendarMasthead from './CalendarMasthead'
import CalendarLegend from './CalendarLegend'
import CalendarGrid from './CalendarGrid'
import CalendarAgendaCard from './CalendarAgendaCard'
import CalendarAlmanac from './CalendarAlmanac'
import CalendarUpcoming from './CalendarUpcoming'
import MobileAgendaList from './MobileAgendaList'
import { useCalendarEvents } from './useCalendarEvents'
import { useIsNarrow } from './useIsNarrow'
import { EVENT_TYPES, type CalendarEvent, type EventTypeId } from './calendarTypes'
import { isoDate } from './dateUtils'
import type { CalendarViewMode } from './PlanningCalendarPage'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import { gardenCare } from '../../api/client'

interface Props {
  viewMode: CalendarViewMode
  onSetView(v: CalendarViewMode): void
  env: string
  groupOutdoor: boolean
  environmentFilter: ReactNode
}

export default function MonthView({ viewMode, onSetView, env, groupOutdoor, environmentFilter }: Props) {
  const t = useT()
  const { markCareDone, skipCare, activeUserId } = useFloreren()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month1, setMonth1] = useState(now.getMonth() + 1)
  const todayIso = isoDate(now)
  const [selectedIso, setSelectedIso] = useState(todayIso)
  const [activeTypes, setActiveTypes] = useState<Set<EventTypeId>>(
    () => new Set(EVENT_TYPES.map(t => t.id)),
  )
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [gardenOperationId, setGardenOperationId] = useState<number | null>(null)
  const [undoMsg, setUndoMsg] = useState<string | null>(null)

  const { events, loading, error } = useCalendarEvents(year, month1, env, groupOutdoor)
  const isNarrow = useIsNarrow(1200)

  async function handleDone(event: CalendarEvent) {
    if (event.grouped && event.group_member_schedule_ids && event.group_member_schedule_ids.length > 0 && activeUserId !== null) {
      setSaving(event.id)
      setUndoMsg(null)
      try {
        const completedAt = new Date().toISOString().slice(0, 10)
        const result = await gardenCare.complete(event.type, activeUserId, completedAt)
        setGardenOperationId(result.operation_id)
        setDoneIds(prev => new Set([...prev, event.id]))
        setUndoMsg(t.calendar.completedGroup)
      } catch (err) {
        console.error('gardenCare.complete failed:', err)
      } finally {
        setSaving(null)
      }
      return
    }
    if (!event.plant_id) return
    setSaving(event.id)
    try {
      await markCareDone(event.plant_id, event.type)
      setDoneIds(prev => new Set([...prev, event.id]))
    } catch (err) {
      console.error('markCareDone failed:', err)
    } finally {
      setSaving(null)
    }
  }

  async function handleGardenUndo() {
    if (!gardenOperationId) return
    setSaving('undo-garden')
    try {
      await gardenCare.undo(gardenOperationId)
      setGardenOperationId(null)
      setUndoMsg(null)
      setDoneIds(new Set())
    } catch (err) {
      console.error('gardenCare.undo failed:', err)
    } finally {
      setSaving(null)
    }
  }

  async function handleSkip(event: CalendarEvent) {
    if (!event.plant_id) return
    setSaving(event.id)
    try {
      await skipCare(event.plant_id, event.type)
      setDoneIds(prev => new Set([...prev, event.id]))
    } catch (err) {
      console.error('skipCare failed:', err)
    } finally {
      setSaving(null)
    }
  }

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
        <MobileAgendaList events={filtered} todayIso={todayIso} saving={saving} onDone={handleDone} onSkip={handleSkip} />
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

import { useMemo, useState, type ReactNode } from 'react'
import CalendarMasthead from './CalendarMasthead'
import CalendarLegend from './CalendarLegend'
import CalendarGrid from './CalendarGrid'
import CalendarAgendaCard from './CalendarAgendaCard'
import MobileAgendaList from './MobileAgendaList'
import MonthLoadState from './MonthLoadState'
import MonthSeasonalPanel from './MonthSeasonalPanel'
import CalendarCompletionNotice from './CalendarCompletionNotice'
import WateringRoundDialog from './WateringRoundDialog'
import { useCalendarEvents } from './useCalendarEvents'
import { useCalendarActions } from './useCalendarActions'
import { useIsNarrow } from './useIsNarrow'
import { EVENT_TYPES, type EventTypeId } from './calendarTypes'
import { isoDate } from './dateUtils'
import { moveCalendarMonth, summarizeMonthWorkload } from './monthWorkloadModel'
import { filterSeasonalPlantsByEnvironment } from './seasonalMonthModel'
import type { CalendarViewMode } from './calendarViewModel'
import { useFloreren } from '../../store/useFloreren'

interface Props {
  onSetView(v: CalendarViewMode): void
  env: string
  environmentFilter: ReactNode
}

export default function MonthView({ onSetView, env, environmentFilter }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month1, setMonth1] = useState(now.getMonth() + 1)
  const todayIso = isoDate(now)
  const [selectedIso, setSelectedIso] = useState(todayIso)
  const [activeTypes, setActiveTypes] = useState<Set<EventTypeId>>(
    () => new Set(EVENT_TYPES.map(t => t.id)),
  )
  const maps = useFloreren(state => state.maps)
  const plants = useFloreren(state => state.plants)
  const mapSlugs = useMemo(
    () => new Map(maps.map(map => [map.id, map.slug] as const)),
    [maps],
  )
  const seasonalPlants = useMemo(
    () => filterSeasonalPlantsByEnvironment(plants, maps, env),
    [plants, maps, env],
  )
  const { events, loading, error, retry } = useCalendarEvents(year, month1, env)
  const {
    actionError,
    cancelWaterRound,
    clearCompletion,
    completion,
    confirmWaterRound,
    doneIds,
    handleDone,
    handleGardenUndo,
    handleSkip,
    pendingWaterRound,
    saving,
    undoMsg,
  } = useCalendarActions(events, retry, `${year}-${month1}|${env}|${selectedIso}`)

  const isNarrow = useIsNarrow(1200)

  const filtered = useMemo(
    () => events.filter(e => activeTypes.has(e.type) && !doneIds.has(e.id)),
    [events, activeTypes, doneIds],
  )
  const selectedEvents = useMemo(
    () => filtered.filter(e => e.date === selectedIso),
    [filtered, selectedIso],
  )
  const workload = useMemo(() => summarizeMonthWorkload(filtered), [filtered])

  function moveMonth(delta: -1 | 1) {
    const target = moveCalendarMonth(year, month1, selectedIso, delta)
    setYear(target.year)
    setMonth1(target.month1)
    setSelectedIso(target.selectedIso)
  }
  function prev() { moveMonth(-1) }
  function next() { moveMonth(1) }
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
        year={year} month1={month1} todayDay={now.getDate()}
        onPrev={prev} onNext={next}
        plannedCount={workload.planned} openCount={workload.open}
        environmentFilter={environmentFilter}
      />
      {loading || error ? (
        <MonthLoadState loading={loading} error={error} onRetry={retry} />
      ) : (
        <>
          <CalendarLegend events={events} activeTypes={activeTypes} onToggle={toggle} />
          <CalendarCompletionNotice
            completion={completion}
            mapSlugs={mapSlugs}
            onDismiss={clearCompletion}
          />
          {isNarrow ? (
            <>
              <MobileAgendaList
                events={filtered}
                todayIso={todayIso}
                saving={saving}
                onDone={handleDone}
                onSkip={handleSkip}
                undoMsg={undoMsg}
                onGardenUndo={handleGardenUndo}
                actionError={actionError}
                mapSlugs={mapSlugs}
              />
              <div className="seasonal-mobile-wrap">
                <MonthSeasonalPanel
                  month1={month1}
                  plants={seasonalPlants}
                  onOpenGardenYear={() => onSetView('year')}
                />
              </div>
            </>
          ) : (
            <main>
              <CalendarGrid
                year={year} month1={month1}
                events={filtered}
                loadByDate={workload.byDate}
                todayIso={todayIso}
                selectedIso={selectedIso}
                onSelect={setSelectedIso}
              />
              <aside className="col-side">
                <CalendarAgendaCard selectedIso={selectedIso} events={selectedEvents} todayIso={todayIso} saving={saving} onDone={handleDone} onSkip={handleSkip} undoMsg={undoMsg} onGardenUndo={handleGardenUndo} mapSlugs={mapSlugs} />
                <MonthSeasonalPanel
                  month1={month1}
                  plants={seasonalPlants}
                  onOpenGardenYear={() => onSetView('year')}
                />
              </aside>
            </main>
          )}
        </>
      )}
      {pendingWaterRound && (
        <WateringRoundDialog
          event={pendingWaterRound}
          saving={saving === pendingWaterRound.id}
          onConfirm={confirmWaterRound}
          onCancel={cancelWaterRound}
        />
      )}
    </>
  )
}

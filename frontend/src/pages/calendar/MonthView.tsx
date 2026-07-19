import { useMemo, useState, type ReactNode } from 'react'
import CalendarMasthead from './CalendarMasthead'
import CalendarLegend from './CalendarLegend'
import CalendarGrid from './CalendarGrid'
import CalendarAgendaCard from './CalendarAgendaCard'
import MobileAgendaList from './MobileAgendaList'
import MonthLoadState from './MonthLoadState'
import MonthSeasonalPanel from './MonthSeasonalPanel'
import WaterOutlookPanel from './WaterOutlookPanel'
import CalendarCompletionNotice from './CalendarCompletionNotice'
import CalendarRefreshNotice from './CalendarRefreshNotice'
import WateringRoundDialog from './WateringRoundDialog'
import MoistureCheckDialog from './MoistureCheckDialog'
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
  viewNavigation: ReactNode
  year: number
  month1: number
  onMonthChange(year: number, month1: number): void
}

export default function MonthView({
  onSetView, env, environmentFilter, viewNavigation,
  year, month1, onMonthChange,
}: Props) {
  const now = new Date()
  const todayIso = isoDate(now)
  const showingCurrentMonth = year === now.getFullYear() && month1 === now.getMonth() + 1
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
  const { events, loading, error, refreshError, retry } = useCalendarEvents(year, month1, env)
  const {
    actionError,
    cancelMoistureCheck,
    cancelWaterRound,
    clearCompletion,
    completion,
    confirmWaterRound,
    doneIds,
    handleDone,
    handleGardenUndo,
    handleSkip,
    moistureNotice,
    pendingMoistureCheck,
    pendingWaterRound,
    resolveMoistureCheck,
    saving,
    undoMsg,
  } = useCalendarActions(events, retry, `${year}-${month1}|${env}|${selectedIso}`)

  const isNarrow = useIsNarrow(1200)

  const visibleEvents = useMemo(
    () => events.filter(e => activeTypes.has(e.type)),
    [events, activeTypes],
  )
  const agendaEvents = useMemo(
    () => visibleEvents.filter(e => e.status !== 'completed' && !doneIds.has(e.id)),
    [visibleEvents, doneIds],
  )
  const selectedEvents = useMemo(
    () => agendaEvents.filter(e => e.date === selectedIso),
    [agendaEvents, selectedIso],
  )
  const selectedCompletedEvents = useMemo(
    () => visibleEvents.filter(e => e.status === 'completed' && e.date === selectedIso),
    [visibleEvents, selectedIso],
  )
  const workload = useMemo(() => summarizeMonthWorkload(agendaEvents), [agendaEvents])

  function moveMonth(delta: -1 | 1) {
    const target = moveCalendarMonth(year, month1, selectedIso, delta)
    onMonthChange(target.year, target.month1)
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
        year={year} month1={month1}
        onPrev={prev} onNext={next}
        plannedCount={workload.planned} openCount={workload.open}
        environmentFilter={environmentFilter}
        viewNavigation={viewNavigation}
      />
      {loading || error ? (
        <MonthLoadState loading={loading} error={error} onRetry={retry} />
      ) : (
        <>
          <CalendarRefreshNotice error={refreshError} onRetry={retry} />
          <CalendarLegend events={events} activeTypes={activeTypes} onToggle={toggle} />
          <CalendarCompletionNotice
            completion={completion}
            mapSlugs={mapSlugs}
            onDismiss={clearCompletion}
          />
          {moistureNotice && (
            <p className="calendar-moisture-notice" role="status" aria-live="polite">
              {moistureNotice}
            </p>
          )}
          {isNarrow ? (
            <>
              <MobileAgendaList
                events={visibleEvents.filter(e => !doneIds.has(e.id))}
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
                {showingCurrentMonth && <WaterOutlookPanel env={env} />}
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
                events={visibleEvents}
                loadByDate={workload.byDate}
                todayIso={todayIso}
                selectedIso={selectedIso}
                onSelect={setSelectedIso}
              />
              <aside className="col-side">
                <CalendarAgendaCard selectedIso={selectedIso} events={selectedEvents} completedEvents={selectedCompletedEvents} todayIso={todayIso} saving={saving} onDone={handleDone} onSkip={handleSkip} undoMsg={undoMsg} onGardenUndo={handleGardenUndo} mapSlugs={mapSlugs} />
                {showingCurrentMonth && <WaterOutlookPanel env={env} />}
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
      {pendingMoistureCheck && (
        <MoistureCheckDialog
          event={pendingMoistureCheck}
          saving={saving === pendingMoistureCheck.id}
          onResolve={resolveMoistureCheck}
          onCancel={cancelMoistureCheck}
        />
      )}
    </>
  )
}

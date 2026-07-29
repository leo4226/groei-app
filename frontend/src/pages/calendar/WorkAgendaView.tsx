import { useMemo, type ReactNode } from 'react'
import { useT } from '../../context/LanguageContext'
import MobileAgendaList from './MobileAgendaList'
import MonthSeasonalPanel from './MonthSeasonalPanel'
import WaterOutlookPanel from './WaterOutlookPanel'
import { isoDate } from './dateUtils'
import { useCalendarActions } from './useCalendarActions'
import { useCalendarEventRange } from './useCalendarEvents'
import { buildWorkAgenda } from './workAgendaModel'
import { filterSeasonalPlantsByEnvironment } from './seasonalMonthModel'
import type { CalendarViewMode } from './calendarViewModel'
import CalendarCompletionNotice from './CalendarCompletionNotice'
import CalendarRefreshNotice from './CalendarRefreshNotice'
import WateringRoundDialog from './WateringRoundDialog'
import MoistureCheckDialog from './MoistureCheckDialog'
import { useFloreren } from '../../store/useFloreren'

interface Props {
  env: string
  environmentFilter: ReactNode
  viewNavigation: ReactNode
  onSetView?(v: CalendarViewMode): void
}

export default function WorkAgendaView({ env, environmentFilter, viewNavigation, onSetView }: Props) {
  const t = useT()
  const today = new Date()
  const todayIso = isoDate(today)
  const currentMonth1 = today.getMonth() + 1
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
  const horizonIso = isoDate(horizon)
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
  const { events, loading, error, refreshError, retry } = useCalendarEventRange(
    todayIso,
    horizonIso,
    env,
    true,
  )
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
  } = useCalendarActions(events, retry, env)
  const agenda = useMemo(
    () => buildWorkAgenda(events.filter(event => !doneIds.has(event.id)), todayIso),
    [doneIds, events, todayIso],
  )

  return (
    <section className="work-agenda-view">
      {/* Context rail — same slot the Month view's month-rail occupies.
          The lede lives in the shared masthead; here only the filter. */}
      <div className="view-rail">
        {viewNavigation}
        <div className="masthead-environment">{environmentFilter}</div>
      </div>

      {/* Two-column spread on desktop: task list + the context rail the
          Month view already renders (collapses to one column ≤1200px). */}
      <main>
        <div className="work-agenda-list">
          <CalendarCompletionNotice
            completion={completion}
            mapSlugs={mapSlugs}
            onDismiss={clearCompletion}
          />
          <CalendarRefreshNotice error={refreshError} onRetry={retry} />
          {moistureNotice && (
            <p className="calendar-moisture-notice" role="status" aria-live="polite">
              {moistureNotice}
            </p>
          )}

          {loading ? (
            <p className="work-agenda-status">{t.common.loading}</p>
          ) : error ? (
            <div className="work-agenda-status" role="alert">
              <p>{t.calendar.workAgendaLoadFailed}</p>
              <button type="button" onClick={retry}>{t.calendar.retry}</button>
            </div>
          ) : (
            <MobileAgendaList
              events={agenda}
              todayIso={todayIso}
              saving={saving}
              onDone={handleDone}
              onSkip={handleSkip}
              undoMsg={undoMsg}
              onGardenUndo={handleGardenUndo}
              actionError={actionError}
              mapSlugs={mapSlugs}
              onWeatherChanged={retry}
            />
          )}
        </div>
        <aside className="col-side">
          <WaterOutlookPanel env={env} />
          <MonthSeasonalPanel
            month1={currentMonth1}
            plants={seasonalPlants}
            onOpenGardenYear={onSetView ? () => onSetView('year') : undefined}
          />
        </aside>
      </main>
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
    </section>
  )
}

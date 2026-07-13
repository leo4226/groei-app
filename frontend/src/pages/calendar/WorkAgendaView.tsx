import { useMemo, type ReactNode } from 'react'
import { useT } from '../../context/LanguageContext'
import MobileAgendaList from './MobileAgendaList'
import { isoDate } from './dateUtils'
import { useCalendarActions } from './useCalendarActions'
import { useCalendarEventRange } from './useCalendarEvents'
import { buildWorkAgenda } from './workAgendaModel'
import CalendarCompletionNotice from './CalendarCompletionNotice'
import { useFloreren } from '../../store/useFloreren'

interface Props {
  env: string
  environmentFilter: ReactNode
}

export default function WorkAgendaView({ env, environmentFilter }: Props) {
  const t = useT()
  const today = new Date()
  const todayIso = isoDate(today)
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
  const horizonIso = isoDate(horizon)
  const maps = useFloreren(state => state.maps)
  const mapSlugs = useMemo(
    () => new Map(maps.map(map => [map.id, map.slug] as const)),
    [maps],
  )
  const { events, loading, error, retry } = useCalendarEventRange(
    todayIso,
    horizonIso,
    env,
    true,
  )
  const {
    actionError,
    clearCompletion,
    completion,
    doneIds,
    handleDone,
    handleGardenUndo,
    handleSkip,
    saving,
    undoMsg,
  } = useCalendarActions(events, retry, env)
  const agenda = useMemo(
    () => buildWorkAgenda(events.filter(event => !doneIds.has(event.id)), todayIso),
    [doneIds, events, todayIso],
  )

  return (
    <section className="work-agenda-view">
      <header className="work-agenda-head">
        <div>
          <div className="eyebrow">{t.calendar.title}</div>
          <h1>{t.calendar.workAgendaHeading}<em>.</em></h1>
          <p>{t.calendar.workAgendaSubtitle}</p>
        </div>
        {environmentFilter}
      </header>

      <CalendarCompletionNotice
        completion={completion}
        mapSlugs={mapSlugs}
        onDismiss={clearCompletion}
      />

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
        />
      )}
    </section>
  )
}

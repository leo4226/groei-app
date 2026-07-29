import { useMemo } from 'react'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY, isActionable } from './calendarTypes'
import { agendaPlantName } from './workAgendaModel'
import { DAY_LONG_NL, MONTH_SHORT_NL, DAY_LONG_EN, MONTH_SHORT_EN, dowMon } from './dateUtils'
import { useT } from '../../context/LanguageContext'
import CalendarEventLink from './CalendarEventLink'
import CalendarWeatherContext from './CalendarWeatherContext'
import Glyph from '../../components/ui/Glyph'
import MoistureAdvisory from './MoistureAdvisory'
import { extractMoistureAdvisories } from './moistureAdvisoryModel'
import { buildCalendarPresentation } from './calendarWeatherAdvisoryModel'
import CalendarWeatherAdvisories from './CalendarWeatherAdvisories'

const EMPTY_MAP_SLUGS = new Map<number, string>()

interface Props {
  events: CalendarEvent[]
  todayIso: string
  saving: string | null
  onDone: (e: CalendarEvent) => void
  onSkip: (e: CalendarEvent) => void
  undoMsg: string | null
  onGardenUndo: () => void
  actionError: string | null
  mapSlugs?: ReadonlyMap<number, string>
  onWeatherChanged?(): Promise<void> | void
}

export default function MobileAgendaList({
  events,
  todayIso,
  saving,
  onDone,
  onSkip,
  undoMsg,
  onGardenUndo,
  actionError,
  mapSlugs = EMPTY_MAP_SLUGS,
  onWeatherChanged = () => undefined,
}: Props) {
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

  return (
    <div style={{ padding: '0 12px 32px' }}>
      {actionError && (
        <p role="alert" style={{ padding: '12px', color: 'crimson', margin: '12px 0 0' }}>
          {actionError}
        </p>
      )}
      {undoMsg && (
        <div role="status" aria-live="polite" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px', marginTop: 12, background: 'var(--color-paper)',
          border: '1px solid var(--color-border)', borderRadius: 4,
        }}>
          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{undoMsg}</span>
          <button
            disabled={saving === 'undo-garden'}
            onClick={onGardenUndo}
            aria-busy={saving === 'undo-garden'}
            style={{
              padding: '5px 10px', borderRadius: 99, background: 'transparent',
              color: 'var(--color-text-muted)', border: '1px solid var(--color-border)',
              fontFamily: 'Fraunces, serif', fontSize: 11, cursor: 'pointer', flexShrink: 0,
            }}
          >
            {saving === 'undo-garden' ? t.common.loading : t.calendar.undoGroup}
          </button>
        </div>
      )}
      {grouped.length === 0 && (
        <p style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>{t.calendar.noTasksRest}</p>
      )}
      {grouped.map(([iso, list]) => {
        const [y, m, d] = iso.split('-').map(Number)
        const isToday = iso === todayIso
        const presentation = buildCalendarPresentation(list)
        const { ordinaryEvents, advisories } = extractMoistureAdvisories(presentation.ordinaryEvents)
        return (
          <section key={iso} style={{ marginTop: 18 }}>
            <h3 style={{
              fontFamily: 'Fraunces, serif', fontSize: 18, margin: '0 0 6px',
              color: isToday ? 'var(--color-primary)' : 'var(--color-text)',
            }}>
              {(t.locale.startsWith('en') ? DAY_LONG_EN : DAY_LONG_NL)[dowMon(y, m, d)]} {d} {(t.locale.startsWith('en') ? MONTH_SHORT_EN : MONTH_SHORT_NL)[m - 1]}
              {isToday && <em style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-secondary)' }}>{t.calendar.today}</em>}
            </h3>
            {advisories.map(advisory => (
              <MoistureAdvisory
                key={advisory.key}
                advisory={advisory}
                todayIso={todayIso}
                saving={saving}
                onCheck={onDone}
                mapSlugs={mapSlugs}
              />
            ))}
            <CalendarWeatherAdvisories
              advisories={presentation.weatherAdvisories}
              onChanged={onWeatherChanged}
            />
            {ordinaryEvents.map(e => {
              const def = EVENT_TYPE_BY_ID[e.type as EventTypeId]
              const busy = saving === e.id
              const completed = e.status === 'completed'
              const groupCount = e.group_count ?? e.group_member_schedule_ids?.length ?? 0
              return (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'var(--color-paper)',
                  borderLeft: `3px solid ${def?.color ?? 'var(--color-primary)'}`,
                  borderRadius: 4, marginBottom: 6,
                  opacity: busy ? 0.5 : completed ? 0.72 : 1,
                  transition: 'opacity 0.15s',
                }} aria-busy={busy || undefined} data-calendar-history={completed || undefined}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 64 }}>{t.utility[EVENT_TYPE_UTILITY_KEY[e.type as EventTypeId]] ?? e.type}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <CalendarEventLink
                      event={e}
                      mapSlugs={mapSlugs}
                      className="mobile-agenda-identity"
                    >
                      {agendaPlantName(e, t.locale) || '—'}
                    </CalendarEventLink>
                    {completed && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-primary-dark)' }}>
                        <Glyph name="check" size={11} /> {t.calendar.completedHistory}
                      </span>
                    )}
                    {(e.grouped || e.overdue) && (
                      <span style={{ fontSize: 11, color: e.overdue ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                        {e.grouped && t.calendar.affectedPlants(groupCount)}
                        {e.grouped && e.overdue && ' · '}
                        {e.overdue && t.calendar.overdueLabel}
                      </span>
                    )}
                    <CalendarWeatherContext event={e} />
                  </span>
                  {isActionable(e, todayIso) ? (
                    <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', flexShrink: 0 }}>
                      <button disabled={busy} onClick={() => onDone(e)} style={{ padding: '4px 10px', borderRadius: 99, background: 'var(--color-primary)', color: '#fff', border: 'none', fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 10, cursor: 'pointer' }}>
                        {busy
                          ? t.common.loading
                          : e.type === 'moisture_check'
                            ? t.calendar.moistureCheckTitle
                            : e.grouped
                              ? t.calendar.completeAndAlign
                              : t.dashboard.actions.done}
                      </button>
                      {!e.grouped && (
                        <button disabled={busy} onClick={() => onSkip(e)} style={{ padding: '4px 10px', borderRadius: 99, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontFamily: 'Fraunces, serif', fontSize: 10, cursor: 'pointer' }}>
                          {t.dashboard.actions.skip}
                        </button>
                      )}
                    </div>
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

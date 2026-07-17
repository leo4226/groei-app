import { useState } from 'react'
import Glyph, { type GlyphName } from '../../components/ui/Glyph'
import { useT } from '../../context/LanguageContext'
import MonthView from './MonthView'
import PhenologyView from './PhenologyView'
import WorkAgendaView from './WorkAgendaView'
import CalendarViewToggle from './CalendarViewToggle'
import { defaultCalendarView, type CalendarViewMode } from './calendarViewModel'
import { useIsNarrow } from './useIsNarrow'
import './calendar.css'

function EnvironmentFilter({
  env,
  onChange,
  className,
}: {
  env: string
  onChange(env: string): void
  className?: string
}) {
  const t = useT()

  return (
    <div className={`calendar-environment-filter ${className ?? ''}`}>
      <span className="env-label" aria-hidden="true">{t.calendar.filterLabel}</span>
      {([
        { id: 'all', label: t.common.all, desc: t.calendar.filterDescAll, glyph: 'list' as GlyphName },
        { id: 'tuin', label: t.common.garden, desc: t.calendar.filterDescGarden, glyph: 'leaf' as GlyphName },
        { id: 'huis', label: t.common.house, desc: t.calendar.filterDescHouse, glyph: 'home' as GlyphName },
      ] as const).map(({ id, label, desc, glyph }) => {
        const active = env === id
        return (
          <button
            key={id}
            type="button"
            className={`env-pill ${active ? 'on' : ''}`}
            aria-pressed={active}
            aria-label={`${label} — ${desc}`}
            title={desc}
            onClick={() => onChange(id)}
          >
            <Glyph name={glyph} size={13} /> {label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The one constant masthead across all three calendar views ("one cover,
 * three spreads"): title + per-view lede, with the view switch as centered
 * serif pill-tabs directly under the title — the same grammar Plants uses
 * for its sibling views. View-specific context (month switcher, moon,
 * field note, filters) lives in each view's own rail below this header.
 */
function CalendarPageMasthead({ view, onSet }: { view: CalendarViewMode; onSet(v: CalendarViewMode): void }) {
  const t = useT()
  const viewLabel = view === 'month' ? t.calendar.month : view === 'work' ? t.calendar.agenda : t.calendar.gardenYear
  const lede = view === 'month'
    ? t.calendar.subtitle
    : view === 'work'
      ? t.calendar.workAgendaSubtitle
      : t.calendar.gardenYearSubtitle

  return (
    <header className="masthead">
      <div className="title-block">
        <div className="eyebrow">
          <span>{t.calendar.title}</span>
          <span>{viewLabel}</span>
        </div>
        <h1>{t.calendar.heading}<em>.</em></h1>
        <p className="lede">{lede}</p>
      </div>
      <nav className="masthead-toggle-row" data-calendar-view-navigation aria-label={t.calendar.heading}>
        <CalendarViewToggle view={view} onSet={onSet} />
      </nav>
    </header>
  )
}

export default function PlanningCalendarPage() {
  const isNarrow = useIsNarrow()
  const [view, setView] = useState<CalendarViewMode>(() => defaultCalendarView(isNarrow))
  const [env, setEnv] = useState('all')
  const environmentFilter = <EnvironmentFilter env={env} onChange={setEnv} />

  return (
    <div className="cal-page">
      <CalendarPageMasthead view={view} onSet={setView} />
      {view === 'month' ? (
        <MonthView
          onSetView={setView}
          env={env}
          environmentFilter={environmentFilter}
        />
      ) : (
        view === 'work' ? (
          <WorkAgendaView env={env} environmentFilter={environmentFilter} onSetView={setView} />
        ) : (
          <PhenologyView env={env} environmentFilter={environmentFilter} />
        )
      )}
    </div>
  )
}

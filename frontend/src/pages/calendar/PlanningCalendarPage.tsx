import { useState } from 'react'
import Glyph, { type GlyphName } from '../../components/ui/Glyph'
import { useT } from '../../context/LanguageContext'
import MonthView from './MonthView'
import PhenologyView from './PhenologyView'
import WorkAgendaView from './WorkAgendaView'
import CalendarViewToggle from './CalendarViewToggle'
import CalendarMoonMini from './CalendarMoonMini'
import CalendarFieldNote from './CalendarFieldNote'
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
 * The one constant masthead across all three calendar views. The title keeps
 * the Plants/Settings rhythm, while secondary moon and field-note context use
 * the otherwise empty space on the right.
 */
export function CalendarPageMasthead({
  view,
  year,
  month1,
  todayDay,
}: {
  view: CalendarViewMode
  year: number
  month1: number
  todayDay: number
}) {
  const t = useT()
  const viewLabel = view === 'month' ? t.calendar.month : view === 'work' ? t.calendar.agenda : t.calendar.gardenYear
  const lede = view === 'month'
    ? t.calendar.subtitle
    : view === 'work'
      ? t.calendar.workAgendaSubtitle
      : t.calendar.gardenYearSubtitle

  return (
    <header className="masthead">
      <div className="masthead-title-row">
        <div className="title-block">
          <div className="eyebrow">
            <span>{t.calendar.title}</span>
            <span>{viewLabel}</span>
          </div>
          <h1>{t.calendar.heading}<em>.</em></h1>
          <p className="lede">{lede}</p>
        </div>
        <div className="masthead-context masthead-context--header">
          <CalendarMoonMini year={year} month1={month1} todayDay={todayDay} />
          <CalendarFieldNote month1={month1} />
        </div>
      </div>
    </header>
  )
}

export default function PlanningCalendarPage() {
  const isNarrow = useIsNarrow()
  const t = useT()
  const today = new Date()
  const [view, setView] = useState<CalendarViewMode>(() => defaultCalendarView(isNarrow))
  const [env, setEnv] = useState('all')
  const [displayedMonth, setDisplayedMonth] = useState(() => ({
    year: today.getFullYear(),
    month1: today.getMonth() + 1,
  }))
  const environmentFilter = <EnvironmentFilter env={env} onChange={setEnv} />
  const viewNavigation = (
    <nav className="calendar-view-navigation" data-calendar-view-navigation aria-label={t.calendar.heading}>
      <CalendarViewToggle view={view} onSet={setView} />
    </nav>
  )

  return (
    <div className="cal-page">
      <CalendarPageMasthead
        view={view}
        year={displayedMonth.year}
        month1={displayedMonth.month1}
        todayDay={today.getDate()}
      />
      {view === 'month' ? (
        <MonthView
          onSetView={setView}
          env={env}
          environmentFilter={environmentFilter}
          viewNavigation={viewNavigation}
          year={displayedMonth.year}
          month1={displayedMonth.month1}
          onMonthChange={(year, month1) => setDisplayedMonth({ year, month1 })}
        />
      ) : (
        view === 'work' ? (
          <WorkAgendaView
            env={env}
            environmentFilter={environmentFilter}
            viewNavigation={viewNavigation}
            onSetView={setView}
          />
        ) : (
          <PhenologyView
            env={env}
            environmentFilter={environmentFilter}
            viewNavigation={viewNavigation}
          />
        )
      )}
    </div>
  )
}

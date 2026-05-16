import { MONTH_LONG_NL, isoWeek } from './dateUtils'
import type { CalendarViewMode } from './PlanningCalendarPage'

interface Props {
  year: number
  month1: number
  viewMode: CalendarViewMode
  onPrev(): void
  onNext(): void
  onSetView(v: CalendarViewMode): void
  taskCount: number
  bloomCount: number
  openCount: number
}

export default function CalendarMasthead({
  year, month1, viewMode, onPrev, onNext, onSetView,
  taskCount, bloomCount, openCount,
}: Props) {
  const monthName = MONTH_LONG_NL[month1 - 1]
  const wkFirst = isoWeek(year, month1, 1)
  const wkLast = isoWeek(year, month1, new Date(year, month1, 0).getDate())

  return (
    <header className="masthead">
      <div className="top-rail">
        <div className="nav-placeholder" />
        <div className="me">
          <span>{monthName} · {year}</span>
        </div>
      </div>

      <div className="title-row">
        <div className="title-block">
          <div className="eyebrow">
            <span>§ Kalender</span>
            <span>Tuinjaar {year}</span>
          </div>
          <h1>Kalender<em>.</em></h1>
          <p className="lede">Alles wat jouw tuin vraagt — en alles wat zij belooft — geordend per dag.</p>
        </div>

        <div className="month-switch">
          <div className="ms-row">
            <div>
              <div className="ms-year">Week {wkFirst} — {wkLast}</div>
              <div className="ms-month">{monthName} <em>{year}</em></div>
            </div>
            <div className="ms-arrows">
              <button className="ms-btn" aria-label="Vorige maand" onClick={onPrev}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="ms-btn" aria-label="Volgende maand" onClick={onNext}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
          <div className="ms-row">
            <div className="view-toggle">
              <button className={viewMode === 'month' ? 'on' : ''} onClick={() => onSetView('month')}>Maand</button>
              <button className={viewMode === 'agenda' ? 'on' : ''} onClick={() => onSetView('agenda')}>Agenda</button>
            </div>
          </div>
          <div className="ms-meta">
            <span>Deze maand <span className="v">{taskCount} <em>taken</em></span></span>
            <span>Bloei <span className="v">{bloomCount}</span></span>
            <span>Open <span className="v">{openCount}</span></span>
          </div>
        </div>
      </div>
    </header>
  )
}

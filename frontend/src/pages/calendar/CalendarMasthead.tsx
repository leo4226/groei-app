import { MONTH_LONG_NL, isoWeek } from './dateUtils'
import type { CalendarViewMode } from './PlanningCalendarPage'
import CalendarMoonMini from './CalendarMoonMini'
import { useT } from '../../context/LanguageContext'

interface Props {
  year: number
  month1: number
  todayDay: number
  viewMode: CalendarViewMode
  onPrev(): void
  onNext(): void
  onSetView(v: CalendarViewMode): void
  taskCount: number
  bloomCount: number
  openCount: number
}

export default function CalendarMasthead({
  year, month1, todayDay, viewMode, onPrev, onNext, onSetView,
  taskCount, bloomCount, openCount,
}: Props) {
  const t = useT()
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
            <span>{t.calendar.title}</span>
            <span>{t.calendar.gardenYear} {year}</span>
          </div>
          <h1>{t.calendar.heading}<em>.</em></h1>
          <p className="lede">{t.calendar.subtitle}</p>
        </div>

        <CalendarMoonMini year={year} month1={month1} todayDay={todayDay} />

        <div className="month-switch">
          <div className="ms-row">
            <div>
              <div className="ms-year">{t.calendar.week} {wkFirst} — {wkLast}</div>
              <div className="ms-month">{monthName} <em>{year}</em></div>
            </div>
            <div className="ms-arrows">
              <button className="ms-btn" aria-label={t.calendar.previousMonth} onClick={onPrev}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="ms-btn" aria-label={t.calendar.nextMonth} onClick={onNext}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
          <div className="ms-row">
            <div className="view-toggle">
              <button className={viewMode === 'month' ? 'on' : ''} onClick={() => onSetView('month')}>{t.calendar.month}</button>
              <button className={viewMode === 'agenda' ? 'on' : ''} onClick={() => onSetView('agenda')}>{t.calendar.agenda}</button>
            </div>
          </div>
          <div className="ms-meta">
            <span>{t.calendar.thisMonth} <span className="v">{taskCount} <em>{t.calendar.tasks}</em></span></span>
            <span>{t.calendar.bloom} <span className="v">{bloomCount}</span></span>
            <span>{t.calendar.open} <span className="v">{openCount}</span></span>
          </div>
        </div>
      </div>
    </header>
  )
}

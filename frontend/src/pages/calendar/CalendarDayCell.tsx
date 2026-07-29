import CalendarEvent from './CalendarEvent'
import type { CalendarEvent as Ev } from './calendarTypes'
import { moonPhaseFor } from './moon'
import { useT } from '../../context/LanguageContext'
import type { CalendarWeatherAdvisory } from './calendarWeatherAdvisoryModel'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY } from './calendarTypes'

interface Props {
  day: number
  month0: number
  year: number
  otherMonth: boolean
  weekend: boolean
  isToday: boolean
  isSelected: boolean
  events: Ev[]
  weatherAdvisories?: CalendarWeatherAdvisory[]
  load: number
  maxVisible: number
  onClick(): void
}

export default function CalendarDayCell({
  day, month0, year, otherMonth, weekend, isToday, isSelected, events, weatherAdvisories = [], load, maxVisible, onClick,
}: Props) {
  const t = useT()
  const loadClass = load >= 5 ? 'load-high' : load >= 3 ? 'load-medium' : load > 0 ? 'load-low' : ''
  const date = new Date(year, month0, day)
  const dateLabel = new Intl.DateTimeFormat(t.locale, { dateStyle: 'full' }).format(date)
  const sessionLabel = load > 0 ? t.calendar.sessionLoad(load) : null
  const classes = [
    'day',
    otherMonth ? 'other-month' : '',
    weekend ? 'weekend' : '',
    isToday ? 'today' : '',
    isSelected && !isToday ? 'selected' : '',
    !otherMonth ? loadClass : '',
  ].filter(Boolean).join(' ')

  const shown = events.slice(0, Math.max(0, maxVisible - weatherAdvisories.length))
  const moreCount = events.length - shown.length

  let metaHtml: React.ReactNode = null
  if (!otherMonth) {
    const { lit, waxing } = moonPhaseFor(new Date(year, month0, day))
    const quarterDay = lit < 0.04 || lit > 0.96 || Math.abs(lit - 0.5) < 0.04
    if (quarterDay) {
      const pct = Math.round(lit * 100)
      const grad = waxing
        ? `linear-gradient(90deg, #2A2A2A ${100 - pct}%, #F0E4C8 ${100 - pct}%)`
        : `linear-gradient(90deg, #F0E4C8 ${pct}%, #2A2A2A ${pct}%)`
      const label = lit > 0.96 ? t.calendar.fullMoon : lit < 0.04 ? t.calendar.newMoon : t.calendar.quarterMoon
      metaHtml = <div className="day-meta">{label} <span className="moon" style={{ background: grad }} /></div>
    }
  }

  return (
    <div
      className={classes}
      onClick={otherMonth ? undefined : onClick}
      onKeyDown={(event) => {
        if (!otherMonth && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick()
        }
      }}
      role={otherMonth ? undefined : 'button'}
      tabIndex={otherMonth ? -1 : 0}
      aria-label={sessionLabel ? `${dateLabel}, ${sessionLabel}` : dateLabel}
    >
      <div className="day-head">
        <span className="day-num" data-today-label={isToday ? t.calendar.today : undefined}>{day}</span>
        {metaHtml}
      </div>
      {sessionLabel && !otherMonth && (
        <span className="day-load" aria-label={sessionLabel}>{sessionLabel}</span>
      )}
      <div className="ev-list">
        {weatherAdvisories.map(advisory => (
          <div key={advisory.key} className={`ev ${EVENT_TYPE_BY_ID[advisory.type]?.cssClass ?? ''}`} data-weather-chip>
            <span className="ev-label">
              {t.utility[EVENT_TYPE_UTILITY_KEY[advisory.type]]} · {advisory.affectedPlantCount}
            </span>
          </div>
        ))}
        {shown.map(e => <CalendarEvent key={e.id} ev={e} />)}
        {moreCount > 0 && <div className="ev-more">{t.calendar.more(moreCount)}</div>}
      </div>
    </div>
  )
}

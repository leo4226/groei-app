import type { CSSProperties } from 'react'
import CalendarDayCell from './CalendarDayCell'
import type { CalendarEvent } from './calendarTypes'
import { daysInMonth, dowMon, isoWeek, isoDate, DAY_LETTERS_NL, DAY_LETTERS_EN } from './dateUtils'
import { useT } from '../../context/LanguageContext'
import type { CalendarWeatherAdvisory } from './calendarWeatherAdvisoryModel'

interface Props {
  year: number
  month1: number
  events: CalendarEvent[]
  weatherAdvisories?: CalendarWeatherAdvisory[]
  loadByDate: ReadonlyMap<string, number>
  todayIso: string
  selectedIso: string
  onSelect(iso: string): void
}

function getWeekdayHeaders(locale: string) {
  const letters = locale.startsWith('en') ? DAY_LETTERS_EN : DAY_LETTERS_NL
  return [
    { label: letters[0], weekend: false },
    { label: letters[1], weekend: false },
    { label: letters[2], weekend: false },
    { label: letters[3], weekend: false },
    { label: letters[4], weekend: false },
    { label: letters[5], weekend: true },
    { label: letters[6], weekend: true },
  ]
}

export default function CalendarGrid({
  year, month1, events, weatherAdvisories = [], loadByDate, todayIso, selectedIso, onSelect,
}: Props) {
  const t = useT()
  const weekdayHeaders = getWeekdayHeaders(t.locale)
  const dim = daysInMonth(year, month1)
  const firstDow = dowMon(year, month1, 1)
  const lastDow = dowMon(year, month1, dim)
  const leading = firstDow
  const trailing = 6 - lastDow
  const totalCells = leading + dim + trailing
  const rows = totalCells / 7

  const prevMonth1 = month1 === 1 ? 12 : month1 - 1
  const prevYear = month1 === 1 ? year - 1 : year
  const prevDim = daysInMonth(prevYear, prevMonth1)
  const nextMonth1 = month1 === 12 ? 1 : month1 + 1
  const nextYear = month1 === 12 ? year + 1 : year

  const byDate = new Map<string, CalendarEvent[]>()
  events.forEach(e => {
    const arr = byDate.get(e.date) ?? []
    arr.push(e)
    byDate.set(e.date, arr)
  })
  const weatherByDate = new Map<string, CalendarWeatherAdvisory[]>()
  weatherAdvisories.filter(advisory => !advisory.acknowledgedAt).forEach(advisory => {
    const dateAdvisories = weatherByDate.get(advisory.date) ?? []
    dateAdvisories.push(advisory)
    weatherByDate.set(advisory.date, dateAdvisories)
  })

  function cellInfo(idx: number) {
    if (idx < leading) {
      const d = prevDim - leading + 1 + idx
      return { d, otherMonth: true, m: prevMonth1, y: prevYear }
    }
    if (idx < leading + dim) {
      return { d: idx - leading + 1, otherMonth: false, m: month1, y: year }
    }
    const d = idx - leading - dim + 1
    return { d, otherMonth: true, m: nextMonth1, y: nextYear }
  }

  const cells: React.ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    const firstIdx = r * 7
    const firstCell = cellInfo(firstIdx)
    const wk = isoWeek(firstCell.y, firstCell.m, firstCell.d)
    cells.push(
          <div className="wk-num" key={`wk-${r}`}>
            <span className="wk-no">{wk}</span>
          </div>,
        )
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c
      const { d, otherMonth, m, y } = cellInfo(idx)
      const iso = isoDate(new Date(y, m - 1, d))
      const isToday = iso === todayIso
      const isSelected = iso === selectedIso
      const weekend = c >= 5
      const dayEvents = (byDate.get(iso) ?? [])
      const maxVisible = rows >= 6 ? 1 : isToday ? 3 : 2
      cells.push(
        <CalendarDayCell
          key={`d-${iso}`}
          day={d}
          month0={m - 1}
          year={y}
          otherMonth={otherMonth}
          weekend={weekend}
          isToday={isToday}
          isSelected={isSelected}
          events={otherMonth ? [] : dayEvents}
          weatherAdvisories={otherMonth ? [] : (weatherByDate.get(iso) ?? [])}
          load={otherMonth ? 0 : (loadByDate.get(iso) ?? 0)}
          maxVisible={maxVisible}
          onClick={() => { if (!otherMonth) onSelect(iso) }}
        />,
      )
    }
  }

  return (
    <section className="cal-card">
      <div className="week-header">
        <div className="wh-cell wh-num">wk</div>
        {weekdayHeaders.map(h => (
          <div key={h.label} className={`wh-cell ${h.weekend ? 'weekend' : ''}`}>{h.label}</div>
        ))}
      </div>
      <div
        className="cal-grid"
        style={{ '--calendar-week-rows': rows } as CSSProperties}
      >
        {cells}
      </div>
    </section>
  )
}

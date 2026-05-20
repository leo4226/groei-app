import CalendarDayCell from './CalendarDayCell'
import type { CalendarEvent } from './calendarTypes'
import { daysInMonth, dowMon, isoWeek, isoDate } from './dateUtils'

interface Props {
  year: number
  month1: number
  events: CalendarEvent[]
  todayIso: string
  selectedIso: string
  onSelect(iso: string): void
}

const WEEKDAY_HEADER = [
  { label: 'Maandag', weekend: false },
  { label: 'Dinsdag', weekend: false },
  { label: 'Woensdag', weekend: false },
  { label: 'Donderdag', weekend: false },
  { label: 'Vrijdag', weekend: false },
  { label: 'Zaterdag', weekend: true },
  { label: 'Zondag', weekend: true },
]

export default function CalendarGrid({
  year, month1, events, todayIso, selectedIso, onSelect,
}: Props) {
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
        <span className="wk-no">{wk}</span><span>week</span>
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
      const maxVisible = isToday ? 5 : 3
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
        {WEEKDAY_HEADER.map(h => (
          <div key={h.label} className={`wh-cell ${h.weekend ? 'weekend' : ''}`}>{h.label}</div>
        ))}
      </div>
      <div className="cal-grid">{cells}</div>
    </section>
  )
}

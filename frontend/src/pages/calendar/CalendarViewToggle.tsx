import { useT } from '../../context/LanguageContext'
import type { CalendarViewMode } from './calendarViewModel'

interface Props {
  view: CalendarViewMode
  onSet(view: CalendarViewMode): void
}

export default function CalendarViewToggle({ view, onSet }: Props) {
  const t = useT()
  const options: Array<[CalendarViewMode, string]> = [
    ['month', t.calendar.month],
    ['work', t.calendar.agenda],
    ['year', t.calendar.gardenYear],
  ]

  return (
    <div className="view-toggle" role="group" aria-label={t.calendar.heading}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={view === id ? 'on' : ''}
          aria-pressed={view === id}
          onClick={() => onSet(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

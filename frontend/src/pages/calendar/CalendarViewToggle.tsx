import { useT } from '../../context/LanguageContext'
import type { CalendarViewMode } from './calendarViewModel'

interface Props {
  view: CalendarViewMode
  availableModes: readonly CalendarViewMode[]
  onSet(view: CalendarViewMode): void
}

export default function CalendarViewToggle({ view, availableModes, onSet }: Props) {
  const t = useT()
  const labels: Record<CalendarViewMode, string> = {
    month: t.calendar.month,
    work: t.calendar.agenda,
    year: t.calendar.gardenYear,
  }

  return (
    <div className="view-toggle" role="group" aria-label={t.calendar.heading}>
      {availableModes.map((id) => (
        <button
          key={id}
          type="button"
          className={view === id ? 'on' : ''}
          aria-pressed={view === id}
          onClick={() => onSet(id)}
        >
          {labels[id]}
        </button>
      ))}
    </div>
  )
}

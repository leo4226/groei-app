import { EVENT_TYPES, EVENT_TYPE_UTILITY_KEY, type EventTypeId } from './calendarTypes'
import type { CalendarEvent } from './calendarTypes'
import { useT } from '../../context/LanguageContext'

interface Props {
  events: CalendarEvent[]
  activeTypes: Set<EventTypeId>
  onToggle(id: EventTypeId): void
}

export default function CalendarLegend({ events, activeTypes, onToggle }: Props) {
  const t = useT()
  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })

  return (
    <section className="legend-strip">
      <div className="legend-inner">
        <span className="legend-label">{t.calendar.filter}</span>
        {EVENT_TYPES.map(tp => (
          <span
            key={tp.id}
            className={`legend-chip ${activeTypes.has(tp.id) ? '' : 'off'}`}
            onClick={() => onToggle(tp.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(tp.id) }}
          >
            <span className="dot" style={{ background: tp.color }} />
            {t.utility[EVENT_TYPE_UTILITY_KEY[tp.id]]}
            <span className="ct">{counts[tp.id] || 0}</span>
          </span>
        ))}
        <span className="legend-spacer" />
      </div>
    </section>
  )
}

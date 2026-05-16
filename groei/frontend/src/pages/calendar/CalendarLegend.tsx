import { EVENT_TYPES, type EventTypeId } from './calendarTypes'
import type { CalendarEvent } from './calendarTypes'

interface Props {
  events: CalendarEvent[]
  activeTypes: Set<EventTypeId>
  onToggle(id: EventTypeId): void
}

export default function CalendarLegend({ events, activeTypes, onToggle }: Props) {
  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })

  return (
    <section className="legend-strip">
      <div className="legend-inner">
        <span className="legend-label">Filter</span>
        {EVENT_TYPES.map(t => (
          <span
            key={t.id}
            className={`legend-chip ${activeTypes.has(t.id) ? '' : 'off'}`}
            onClick={() => onToggle(t.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(t.id) }}
          >
            <span className="dot" style={{ background: t.color }} />
            {t.labelNl}
            <span className="ct">{counts[t.id] || 0}</span>
          </span>
        ))}
        <span className="legend-spacer" />
      </div>
    </section>
  )
}

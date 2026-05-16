import type { CalendarEvent as Ev } from './calendarTypes'
import { EVENT_TYPE_BY_ID } from './calendarTypes'

export default function CalendarEvent({ ev }: { ev: Ev }) {
  const def = EVENT_TYPE_BY_ID[ev.type]
  const css = def?.cssClass ?? 'water'
  const iconSrc = ev.plant_icon_variant
    ? `/icons/${ev.plant_icon_variant}.svg`
    : ev.plant_id
      ? '/icons/seed.svg'
      : null

  return (
    <div className={`ev ${css}`}>
      {iconSrc && <span className="ev-icon"><img src={iconSrc} alt="" /></span>}
      <span className="ev-label">{ev.plant_name ?? def?.labelNl ?? ev.type}</span>
    </div>
  )
}

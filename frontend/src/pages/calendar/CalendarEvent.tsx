import type { CalendarEvent as Ev } from './calendarTypes'
import { EVENT_TYPE_BY_ID, EVENT_TYPE_UTILITY_KEY } from './calendarTypes'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'

export default function CalendarEvent({ ev }: { ev: Ev }) {
  const t = useT()
  const def = EVENT_TYPE_BY_ID[ev.type]
  const css = def?.cssClass ?? 'water'
  const iconSrc = resolveIconUrl(ev.plant_icon_variant) ?? (ev.plant_id ? '/icons/seed.svg' : null)

  return (
    <div className={`ev ${css}`}>
      {iconSrc && <span className="ev-icon"><img src={iconSrc} alt="" /></span>}
      <span className="ev-label">{ev.plant_name ?? t.utility[EVENT_TYPE_UTILITY_KEY[ev.type]] ?? ev.type}</span>
    </div>
  )
}

import { useT } from '../../context/LanguageContext'
import type { CalendarEvent } from './calendarTypes'

interface Props {
  event: CalendarEvent
}

export default function CalendarWeatherContext({ event }: Props) {
  const t = useT()
  if (!event.weather_triggered) return null

  const english = t.locale.startsWith('en')
  const reason = english ? event.reason_en : event.reason_nl
  const action = english ? event.action_en : event.action_nl

  return (
    <div className="calendar-weather-context" role="note">
      <p className="calendar-weather-kicker">{t.calendar.weatherContext}</p>
      <p className="calendar-weather-reason">
        {reason || t.calendar.weatherExplanationUnavailable}
      </p>
      {action && (
        <p className="calendar-weather-action">
          <strong>{t.calendar.weatherRecommendedAction}:</strong> {action}
        </p>
      )}
    </div>
  )
}

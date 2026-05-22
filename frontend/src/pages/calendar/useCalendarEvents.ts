import { useEffect, useState } from 'react'
import { calendar } from '../../api/client'
import type { CalendarEvent } from './calendarTypes'
import { firstOfMonth, lastOfMonth } from './dateUtils'

export function useCalendarEvents(year: number, month1: number, env?: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    calendar.events(firstOfMonth(year, month1), lastOfMonth(year, month1), env)
      .then(data => { if (!cancelled) { setEvents(data); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(String(e?.message ?? e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [year, month1, env])

  return { events, loading, error }
}

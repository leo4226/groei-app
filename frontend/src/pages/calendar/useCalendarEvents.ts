import { useCallback, useEffect, useMemo, useState } from 'react'
import { calendar } from '../../api/client'
import { useFloreren } from '../../store/useFloreren'
import type { CalendarEvent } from './calendarTypes'
import { firstOfMonth, lastOfMonth } from './dateUtils'

export function useCalendarEventRange(
  from: string,
  to: string,
  env?: string,
  pinOverdue = false,
) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  const careVersions = useFloreren(s => s.careVersions)
  const careVersionsSum = useMemo(
    () => Object.values(careVersions).reduce((a, b) => a + b, 0),
    [careVersions],
  )
  const retry = useCallback(() => setReloadVersion(version => version + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    calendar.events(from, to, env, pinOverdue)
      .then(data => {
        if (!cancelled) {
          setEvents(data)
          setLoading(false)
        }
      })
      .catch(fetchError => {
        if (!cancelled) {
          setError(String(fetchError?.message ?? fetchError))
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [from, to, env, pinOverdue, careVersionsSum, reloadVersion])

  return { events, loading, error, retry }
}

export function useCalendarEvents(year: number, month1: number, env?: string) {
  return useCalendarEventRange(
    firstOfMonth(year, month1),
    lastOfMonth(year, month1),
    env,
  )
}

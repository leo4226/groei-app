import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { calendar } from '../../api/client'
import { useFloreren } from '../../store/useFloreren'
import type { CalendarEvent } from './calendarTypes'
import { firstOfMonth, lastOfMonth } from './dateUtils'
import { CARE_RHYTHM_CHANGED_EVENT } from '../../utils/careRhythmEvents'

export function useCalendarEventRange(
  from: string,
  to: string,
  env?: string,
  pinOverdue = false,
  includeHistory = false,
) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const loadedRangeRef = useRef<string | null>(null)

  const careVersions = useFloreren(s => s.careVersions)
  // Pull-to-refresh / app-foreground refreshes bump refreshTick app-wide.
  const refreshTick = useFloreren(s => s.refreshTick)
  const careVersionsSum = useMemo(
    () => Object.values(careVersions).reduce((a, b) => a + b, 0),
    [careVersions],
  )
  const retry = useCallback(() => setReloadVersion(version => version + 1), [])
  const rangeKey = `${from}|${to}|${env ?? ''}|${pinOverdue}|${includeHistory}`

  useEffect(() => {
    window.addEventListener(CARE_RHYTHM_CHANGED_EVENT, retry)
    return () => window.removeEventListener(CARE_RHYTHM_CHANGED_EVENT, retry)
  }, [retry])

  useEffect(() => {
    let cancelled = false
    const backgroundRefresh = loadedRangeRef.current === rangeKey
    setLoading(!backgroundRefresh)
    setRefreshing(backgroundRefresh)
    setError(null)
    setRefreshError(null)
    calendar.events(from, to, env, pinOverdue, includeHistory)
      .then(data => {
        if (!cancelled) {
          loadedRangeRef.current = rangeKey
          setEvents(data)
          setLoading(false)
          setRefreshing(false)
        }
      })
      .catch(fetchError => {
        if (!cancelled) {
          const message = String(fetchError?.message ?? fetchError)
          if (backgroundRefresh) setRefreshError(message)
          else setError(message)
          setLoading(false)
          setRefreshing(false)
        }
      })
    return () => { cancelled = true }
  }, [from, to, env, pinOverdue, includeHistory, rangeKey, careVersionsSum, reloadVersion, refreshTick])

  return { events, loading, refreshing, error, refreshError, retry }
}

export function useCalendarEvents(year: number, month1: number, env?: string) {
  return useCalendarEventRange(
    firstOfMonth(year, month1),
    lastOfMonth(year, month1),
    env,
    false,
    true,
  )
}

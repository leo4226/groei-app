import type { MapInfo } from '../types'

/**
 * Today's date as `YYYY-MM-DD` in the *local* calendar.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC: in Amsterdam (UTC+1/+2) it
 * returns yesterday between midnight and 01:00/02:00, so a schedule due today
 * compared unequal and rendered as a future date (#878).
 */
export function localCalendarDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Whether the passport should show the garden weather charts (rainfall,
 * temperature) for a plant on this map.
 *
 * Weather is outdoor-only — a houseplant has no use for a rainfall chart. This
 * mirrors `alert_service._INDOOR_SKIP` on the backend, including its treatment
 * of a plant without a map as outdoor (see `routers/plants.py`).
 */
export function showsGardenWeather(map: Pick<MapInfo, 'map_type'> | null | undefined): boolean {
  return map?.map_type !== 'indoor'
}

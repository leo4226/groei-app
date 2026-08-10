import type { MapInfo, CareScheduleInput, CareType } from '../types'

/**
 * How long ago a care action happened, as a day count relative to today's
 * local calendar date. `null` for "never" or an unparseable date.
 *
 * The passport only showed when care is next *due*; "watered 3 days ago" is
 * what tells you whether the soil is still damp (#878).
 */
export function daysSince(isoDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!isoDate) return null
  const then = new Date(isoDate)
  if (Number.isNaN(then.getTime())) return null
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
}

/** Localized "today / yesterday / N days ago", or null when never done. */
export function relativeDayLabel(
  isoDate: string | null | undefined,
  labels: { today: string; yesterday: string; daysAgo: (n: number) => string },
  now: Date = new Date(),
): string | null {
  const days = daysSince(isoDate, now)
  if (days === null || days < 0) return null
  if (days === 0) return labels.today
  if (days === 1) return labels.yesterday
  return labels.daysAgo(days)
}

/**
 * A new schedule row for `care.syncSchedules`, due immediately so the plant
 * shows up in the care lists the user just said it belongs in.
 */
export function nextScheduleInput(careType: string, intervalDays: number, now: Date = new Date()): CareScheduleInput {
  return {
    care_type: careType as CareType,
    interval_days: Math.max(1, Math.round(intervalDays)),
    next_due: localCalendarDate(now),
  }
}

/**
 * Width at which the passport switches from the phone layout to the editorial
 * masthead spread. Matches Plants.tsx / PageMasthead. Lower than the quick
 * sheet's `PLANT_QUICK_SHEET_DESKTOP_MIN_PX` (1024) on purpose — a page only
 * has to reflow, the sheet has to fit three min-width columns side by side.
 */
export const PASSPORT_DESKTOP_MIN_PX = 720

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

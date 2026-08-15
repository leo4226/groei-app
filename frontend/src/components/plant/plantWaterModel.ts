/**
 * The watering picture for ONE plant, which is what the plant page was missing.
 *
 * The page used to show a garden-weather card built from `useRainContext()` — a
 * module-level singleton with no plant argument, so it rendered byte-identical
 * content on every plant in the garden and repeated what the map's weather pill
 * already said. Rain only becomes useful here when it is measured against this
 * plant's own schedule: 14 dry days matters if it wants water every 5, and does
 * not if it wants water every 30.
 */
import type { RainDay } from '../../hooks/useRainContext'

export interface WaterContext {
  /** Days since it was last watered; null when it never has been. */
  daysSinceWatered: number | null
  /** Rain on the garden since that watering, in mm. Null without a last-watered date. */
  mmSinceWatered: number | null
  /** The schedule's own interval, for comparison. */
  intervalDays: number
  /** Days past due; 0 when not due yet. */
  overdueDays: number
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Whole days between two ISO dates, ignoring time of day. */
export function daysBetween(fromIso: string, to: Date): number | null {
  const from = new Date(fromIso)
  if (Number.isNaN(from.getTime())) return null
  return Math.max(0, Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000))
}

/**
 * Total rainfall on or after `sinceIso`.
 *
 * Inclusive of the watering day itself: rain that fell the same day is part of
 * what the plant has had since, and excluding it would under-report on exactly
 * the day the question gets asked.
 */
export function rainSince(days: RainDay[], sinceIso: string): number {
  const since = startOfDay(new Date(sinceIso))
  if (Number.isNaN(since)) return 0
  return days.reduce((total, day) => {
    const at = startOfDay(new Date(day.date))
    return Number.isNaN(at) || at < since ? total : total + (day.mm ?? 0)
  }, 0)
}

export function buildWaterContext(
  schedule: { last_done: string | null; interval_days: number },
  rainDays: RainDay[] | null,
  now: Date = new Date(),
): WaterContext {
  const daysSinceWatered = schedule.last_done ? daysBetween(schedule.last_done, now) : null
  return {
    daysSinceWatered,
    // Without a last-watered date there is no window to measure rain over, and
    // a 14-day garden total would just be the old global number again.
    mmSinceWatered: schedule.last_done && rainDays ? rainSince(rainDays, schedule.last_done) : null,
    intervalDays: schedule.interval_days,
    overdueDays:
      daysSinceWatered != null ? Math.max(0, daysSinceWatered - schedule.interval_days) : 0,
  }
}

/**
 * How much attention the line should draw.
 *
 * 'dry' is the case the old card could never express: past due *and* no
 * meaningful rain since. Past due after a wet week is not the same situation,
 * and colouring both the same is what made the garden-weather badge noise.
 */
export type WaterTone = 'ok' | 'due' | 'dry'

export const DRY_THRESHOLD_MM = 5

export function waterTone(ctx: WaterContext): WaterTone {
  if (ctx.overdueDays <= 0) return 'ok'
  if (ctx.mmSinceWatered != null && ctx.mmSinceWatered < DRY_THRESHOLD_MM) return 'dry'
  return 'due'
}

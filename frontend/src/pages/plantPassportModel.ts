import type { MapInfo, CareSchedule, CareScheduleInput, CareType } from '../types'
import {
  editableCareTypesForEnvironment,
  type CareEnvironment,
  type EditableCareType,
} from './editPlantCareSchedules'

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
 * Full replacement payload for `PUT /plants/{id}/care-schedules` when adding
 * one schedule from the passport.
 *
 * The endpoint replaces the whole list, so existing rows have to be sent back —
 * but it 422s the entire request on any row it considers not user-managed:
 * `photo` (unknown care type), the weather-triggered frost/heat rows, ephemeral
 * rows, and anything invalid for the plant's environment. `plant.care_schedules`
 * contains all of those, so it cannot be echoed back verbatim: a plant with an
 * active photo reminder could never gain a schedule. Filtering to the
 * environment's editable types — the same set the edit form offers — keeps the
 * payload to rows the endpoint accepts.
 */
export function buildAddSchedulePayload(
  existing: Pick<CareSchedule, 'care_type' | 'interval_days' | 'season_adjust' | 'notes' | 'next_due' | 'is_active'>[],
  environment: CareEnvironment,
  newType: string,
  newIntervalDays: number,
  now: Date = new Date(),
): CareScheduleInput[] {
  const allowed = new Set<string>(editableCareTypesForEnvironment(environment))
  const kept = existing
    .filter(s => s.is_active && allowed.has(s.care_type) && s.care_type !== newType)
    .map(s => ({
      care_type: s.care_type,
      interval_days: s.interval_days,
      ...(s.season_adjust ? { season_adjust: s.season_adjust } : {}),
      ...(s.notes ? { notes: s.notes } : {}),
      next_due: s.next_due,
    }))
  return [...kept, nextScheduleInput(newType, newIntervalDays, now)]
}

/**
 * Full replacement payload for changing one existing schedule's interval from
 * the passport.
 *
 * Deliberately *not* `buildAddSchedulePayload` with a new interval. That one
 * stamps `next_due` = today, which is right for a schedule you are creating —
 * it should show up in the care lists straight away — and wrong for one you are
 * retiming: "water every 5 days, not 7" must not also mean "and water it now".
 * Omitting `next_due` for the edited row lets the backend recompute it from
 * `last_done` (`_care_schedule_anchor`), so the next visit lands 5 days after
 * the last one actually happened.
 *
 * The interval was editable only in the edit form, while adding and deleting
 * were possible from the passport — the single most common care edit was the
 * one that needed the other screen (#886).
 */
export function buildIntervalChangePayload(
  existing: Pick<CareSchedule, 'care_type' | 'interval_days' | 'season_adjust' | 'notes' | 'next_due' | 'is_active'>[],
  environment: CareEnvironment,
  careType: string,
  intervalDays: number,
): CareScheduleInput[] {
  const allowed = new Set<string>(editableCareTypesForEnvironment(environment))
  return existing
    .filter(s => s.is_active && allowed.has(s.care_type))
    .map(s => {
      const base = {
        care_type: s.care_type,
        ...(s.season_adjust ? { season_adjust: s.season_adjust } : {}),
        ...(s.notes ? { notes: s.notes } : {}),
      }
      return s.care_type === careType
        ? { ...base, interval_days: Math.max(1, Math.round(intervalDays)) }
        : { ...base, interval_days: s.interval_days, next_due: s.next_due }
    })
}

/** Editable care types for this environment that the plant does not have yet. */
export function addableCareTypes(
  existing: Pick<CareSchedule, 'care_type' | 'is_active'>[],
  environment: CareEnvironment,
): EditableCareType[] {
  const taken = new Set(existing.filter(s => s.is_active).map(s => s.care_type))
  return editableCareTypesForEnvironment(environment).filter(ct => !taken.has(ct))
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

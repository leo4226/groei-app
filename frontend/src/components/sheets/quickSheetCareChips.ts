import type { CareSchedule, CareType } from '../../types'
import { CARE_TYPE_INFO } from '../../types'

/**
 * Display order for the quick sheet's care chips: the two everyday actions
 * first, then the rest in the order a gardener is likely to meet them.
 *
 * Derived from `CARE_TYPE_INFO` rather than hand-written, so a care type added
 * to the model cannot silently go missing here. It used to be a literal array
 * of eight, which left out `pest_check` and `dust` — both ordinary
 * user-schedulable types with icons and localized labels already in place. A
 * plant with either of them overdue was counted in the sheet's "N taken te
 * doen" line but had no chip to tick, so the count could not be worked down to
 * zero from the sheet at all (#888).
 */
const CHIP_PRIORITY: CareType[] = ['water', 'fertilize']

/** Care types that are never chips: weather-triggered, or handled elsewhere. */
const NOT_A_CHIP = new Set<CareType>([
  // The frost/heat advisories are raised and cleared by the weather engine, not
  // completed by hand.
  'frost_protect',
  'heat_protect',
  // The sheet renders its own photo affordance next to the chips.
  'photo',
])

export const QUICK_SHEET_CARE_ORDER: CareType[] = [
  ...CHIP_PRIORITY,
  ...(Object.keys(CARE_TYPE_INFO) as CareType[])
    .filter(ct => !CHIP_PRIORITY.includes(ct) && !NOT_A_CHIP.has(ct)),
]

/** Days until a schedule is due; negative = overdue, 0 = today. */
export function daysUntilDue(nextDue: string, now: Date = new Date()): number {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  return Math.round((new Date(nextDue).getTime() - startOfToday) / 86_400_000)
}

/**
 * Soonest due-day per care type, for the plant's active schedules.
 *
 * A plant can hold more than one row for a type (an old inactive one, a
 * duplicate); the nearest one is what the chip should reflect.
 */
export function dueDaysByType(
  schedules: Pick<CareSchedule, 'care_type' | 'next_due' | 'is_active'>[],
  now: Date = new Date(),
): Map<string, number> {
  const due = new Map<string, number>()
  for (const s of schedules) {
    if (s.is_active === false) continue
    const days = daysUntilDue(s.next_due, now)
    const prev = due.get(s.care_type)
    if (prev === undefined || days < prev) due.set(s.care_type, days)
  }
  return due
}

/**
 * Which chips to render.
 *
 * Water and feed are always offered — they are the two things a gardener does
 * without being asked. Everything else appears when the plant actually has a
 * schedule for it, so the row stays as short as the plant is simple.
 */
export function careChipTypes(dueByType: Map<string, number>): CareType[] {
  return QUICK_SHEET_CARE_ORDER.filter(
    ct => CHIP_PRIORITY.includes(ct) || dueByType.has(ct),
  )
}

/**
 * How many things this plant needs today, excluding what was just ticked off.
 *
 * Must count exactly what `careChipTypes` can render: the status line and the
 * chips used to disagree, promising four tasks while offering two (#888).
 */
export function dueChipCount(
  dueByType: Map<string, number>,
  doneTypes: ReadonlySet<string>,
): number {
  return careChipTypes(dueByType).filter(ct => {
    if (doneTypes.has(ct)) return false
    const days = dueByType.get(ct)
    return days !== undefined && days <= 0
  }).length
}

export interface NextCare {
  careType: string
  days: number
}

/**
 * The soonest care still ahead of this plant, for the sheet's "next up" line.
 *
 * Only future care: anything due or overdue is already shouting from the status
 * line and the chip badges, and repeating it underneath would be noise. Null
 * when nothing is scheduled ahead — the plant has no rhythm to report.
 *
 * The sheet said "Alles op schema" and nothing else, so the pane people open to
 * check on a plant could not tell them when it next needs them, or that its
 * rhythm was editable at all (#888).
 */
export function nextUpcomingCare(dueByType: Map<string, number>): NextCare | null {
  let best: NextCare | null = null
  for (const [careType, days] of dueByType) {
    if (days <= 0) continue
    if (!best || days < best.days) best = { careType, days }
  }
  return best
}

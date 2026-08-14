import { describe, expect, it } from 'vitest'
import type { CareType } from '../../types'
import { CARE_TYPE_INFO } from '../../types'
import {
  QUICK_SHEET_CARE_ORDER,
  careChipTypes,
  daysUntilDue,
  dueChipCount,
  dueDaysByType,
} from './quickSheetCareChips'

const NOW = new Date(2026, 7, 14, 10, 0)
const iso = (offsetDays: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays)
    .toISOString().slice(0, 10)

const sched = (care_type: string, dueIn: number, is_active = true) =>
  ({ care_type, next_due: iso(dueIn), is_active }) as never

describe('QUICK_SHEET_CARE_ORDER', () => {
  it('covers every hand-loggable care type', () => {
    // The bug: the order was a literal array of eight that left out pest_check
    // and dust, so those chips could never render however overdue they were.
    const loggable = (Object.keys(CARE_TYPE_INFO) as CareType[])
      .filter(ct => !['frost_protect', 'heat_protect', 'photo'].includes(ct))
    expect([...QUICK_SHEET_CARE_ORDER].sort()).toEqual([...loggable].sort())
  })

  it('leads with the two everyday actions', () => {
    expect(QUICK_SHEET_CARE_ORDER.slice(0, 2)).toEqual(['water', 'fertilize'])
  })

  it('omits the weather-triggered types and the photo affordance', () => {
    // Frost/heat advisories are raised and cleared by the weather engine, and
    // the sheet renders its own photo button beside the chips.
    for (const ct of ['frost_protect', 'heat_protect', 'photo']) {
      expect(QUICK_SHEET_CARE_ORDER).not.toContain(ct)
    }
  })
})

describe('daysUntilDue', () => {
  it('counts calendar days from the start of today', () => {
    expect(daysUntilDue(iso(0), NOW)).toBe(0)
    expect(daysUntilDue(iso(-3), NOW)).toBe(-3)
    expect(daysUntilDue(iso(4), NOW)).toBe(4)
  })
})

describe('dueDaysByType', () => {
  it('keeps the soonest row when a type has several', () => {
    const due = dueDaysByType([sched('water', 5), sched('water', -2)], NOW)
    expect(due.get('water')).toBe(-2)
  })

  it('ignores inactive schedules', () => {
    const due = dueDaysByType([sched('prune', -9, false)], NOW)
    expect(due.has('prune')).toBe(false)
  })
})

describe('careChipTypes', () => {
  it('always offers water and feed, even unscheduled', () => {
    expect(careChipTypes(new Map())).toEqual(['water', 'fertilize'])
  })

  it('offers pest_check and dust once the plant has them', () => {
    // The regression this file exists for.
    const due = dueDaysByType([sched('pest_check', -5), sched('dust', -1)], NOW)
    const chips = careChipTypes(due)
    expect(chips).toContain('pest_check')
    expect(chips).toContain('dust')
  })

  it('keeps water and feed first', () => {
    const due = dueDaysByType([sched('pest_check', -5), sched('water', 2)], NOW)
    expect(careChipTypes(due).slice(0, 2)).toEqual(['water', 'fertilize'])
  })
})

describe('dueChipCount', () => {
  it('matches what the chips can actually deliver', () => {
    // The sheet promised "4 taken te doen" while rendering two tickable chips,
    // because the count walked every schedule and the chips did not.
    const due = dueDaysByType([
      sched('water', -3), sched('fertilize', 0),
      sched('pest_check', -5), sched('dust', -1),
      sched('mist', 4),
    ], NOW)
    expect(dueChipCount(due, new Set())).toBe(4)
    expect(careChipTypes(due).filter(ct => (due.get(ct) ?? 1) <= 0)).toHaveLength(4)
  })

  it('does not count care that is not due yet', () => {
    const due = dueDaysByType([sched('water', 4), sched('mist', 2)], NOW)
    expect(dueChipCount(due, new Set())).toBe(0)
  })

  it('drops what was just ticked off in this sheet', () => {
    const due = dueDaysByType([sched('water', -3), sched('pest_check', -5)], NOW)
    expect(dueChipCount(due, new Set(['water']))).toBe(1)
    expect(dueChipCount(due, new Set(['water', 'pest_check']))).toBe(0)
  })
})

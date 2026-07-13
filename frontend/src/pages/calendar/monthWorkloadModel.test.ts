import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './calendarTypes'
import { moveCalendarMonth, summarizeMonthWorkload } from './monthWorkloadModel'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:1:water:0',
    date: '2026-07-12',
    type: 'water',
    plant_id: 1,
    plant_name: 'Test plant',
    plant_icon_variant: null,
    schedule_id: 1,
    map_id: 10,
    map_name: 'Back garden',
    overdue: false,
    severity: null,
    color: null,
    icon: null,
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: false,
    ...overrides,
  }
}

describe('summarizeMonthWorkload', () => {
  it('counts a recurring overdue schedule once while keeping its future plan', () => {
    const workload = summarizeMonthWorkload([
      event({ id: 'schedule:1:water:0', date: '2026-07-10', overdue: true }),
      event({ id: 'schedule:1:water:1', date: '2026-07-12', overdue: true }),
      event({ id: 'schedule:1:water:2', date: '2026-07-19' }),
    ])

    expect(workload.open).toBe(1)
    expect(workload.planned).toBe(1)
  })

  it('counts a grouped event as one session regardless of affected plants', () => {
    const workload = summarizeMonthWorkload([
      event({
        id: 'garden-group:10:water:2026-07-20',
        date: '2026-07-20',
        grouped: true,
        plant_id: null,
        schedule_id: null,
        group_count: 12,
        group_member_schedule_ids: [1, 2, 3],
      }),
    ])

    expect(workload.planned).toBe(1)
    expect(workload.byDate.get('2026-07-20')).toBe(1)
  })

  it('excludes informational events from planned, open, and daily workload', () => {
    const workload = summarizeMonthWorkload([
      event({ id: 'bloom:1', type: 'bloom', date: '2026-07-20', schedule_id: null }),
      event({ id: 'rain:1', type: 'rain', date: '2026-07-20', schedule_id: null, overdue: true }),
      event({ id: 'schedule:2:water:0', date: '2026-07-20', schedule_id: 2 }),
    ])

    expect(workload.planned).toBe(1)
    expect(workload.open).toBe(0)
    expect(workload.byDate.get('2026-07-20')).toBe(1)
  })
})

describe('moveCalendarMonth', () => {
  it('clamps the selected day to the last valid day of the target month', () => {
    expect(moveCalendarMonth(2026, 1, '2026-01-31', 1)).toEqual({
      year: 2026,
      month1: 2,
      selectedIso: '2026-02-28',
    })
  })

  it('moves across year boundaries', () => {
    expect(moveCalendarMonth(2026, 1, '2026-01-15', -1)).toEqual({
      year: 2025,
      month1: 12,
      selectedIso: '2025-12-15',
    })
  })
})

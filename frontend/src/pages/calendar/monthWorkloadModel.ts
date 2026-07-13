import type { CalendarEvent } from './calendarTypes'
import { isCareSession } from './calendarTypes'
import { daysInMonth } from './dateUtils'

export interface MonthWorkload {
  open: number
  planned: number
  byDate: Map<string, number>
}

function outstandingIdentity(event: CalendarEvent): string {
  if (event.grouped) return `group:${event.map_id}:${event.type}`
  if (event.schedule_id !== null) return `schedule:${event.schedule_id}`
  return event.id
}

export function summarizeMonthWorkload(events: CalendarEvent[]): MonthWorkload {
  const openItems = new Set<string>()
  const byDate = new Map<string, number>()
  let planned = 0

  events.forEach(event => {
    if (!isCareSession(event)) return

    byDate.set(event.date, (byDate.get(event.date) ?? 0) + 1)
    if (event.overdue) openItems.add(outstandingIdentity(event))
    else planned += 1
  })

  return { open: openItems.size, planned, byDate }
}

export interface CalendarMonthState {
  year: number
  month1: number
  selectedIso: string
}

export function moveCalendarMonth(
  year: number,
  month1: number,
  selectedIso: string,
  delta: -1 | 1,
): CalendarMonthState {
  const target = new Date(year, month1 - 1 + delta, 1)
  const targetYear = target.getFullYear()
  const targetMonth1 = target.getMonth() + 1
  const selectedDay = Number(selectedIso.slice(8, 10)) || 1
  const day = Math.min(selectedDay, daysInMonth(targetYear, targetMonth1))
  const pad = (value: number) => String(value).padStart(2, '0')

  return {
    year: targetYear,
    month1: targetMonth1,
    selectedIso: `${targetYear}-${pad(targetMonth1)}-${pad(day)}`,
  }
}

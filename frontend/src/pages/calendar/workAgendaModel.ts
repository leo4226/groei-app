import type { CalendarEvent } from './calendarTypes'

export function agendaPlantName(event: CalendarEvent, locale: string): string {
  if (event.grouped) return event.map_name?.trim() ?? ''
  const speciesName = locale.startsWith('en')
    ? event.species_common_name_en?.trim()
    : event.species_common_name_nl?.trim()
  return speciesName || event.plant_name?.trim() || ''
}

function agendaKey(event: CalendarEvent): string {
  if (event.grouped) return `group:${event.type}:${event.map_id ?? 'unknown'}`
  if (event.schedule_id !== null) return `schedule:${event.schedule_id}`
  return `event:${event.id}`
}

function prefer(candidate: CalendarEvent, current: CalendarEvent): boolean {
  if (candidate.overdue !== current.overdue) return candidate.overdue
  if (candidate.date !== current.date) return candidate.date < current.date
  return candidate.id < current.id
}

function agendaRank(event: CalendarEvent, todayIso: string): number {
  if (event.overdue) return 0
  return event.date === todayIso ? 1 : 2
}

export function buildWorkAgenda(
  events: CalendarEvent[],
  todayIso: string,
): CalendarEvent[] {
  const nextByJob = new Map<string, CalendarEvent>()

  for (const event of events) {
    const key = agendaKey(event)
    const current = nextByJob.get(key)
    if (!current || prefer(event, current)) nextByJob.set(key, event)
  }

  return [...nextByJob.values()].sort((a, b) => (
    agendaRank(a, todayIso) - agendaRank(b, todayIso)
    || a.date.localeCompare(b.date)
    || a.id.localeCompare(b.id)
  ))
}

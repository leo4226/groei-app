import type { CalendarEvent } from './calendarTypes'

export interface MoistureAdvisoryGroup {
  key: string
  date: string
  reasonNl: string | null
  reasonEn: string | null
  actionNl: string | null
  actionEn: string | null
  mapEvents: CalendarEvent[]
}

interface MoistureAdvisoryExtraction {
  ordinaryEvents: CalendarEvent[]
  advisories: MoistureAdvisoryGroup[]
}

function isMapMoistureSession(event: CalendarEvent): boolean {
  return event.type === 'moisture_check'
    && event.status !== 'completed'
    && event.weather_triggered
    && event.grouped
    && event.map_id !== null
}

function advisoryKey(event: CalendarEvent): string {
  return JSON.stringify([
    event.date,
    event.reason_nl ?? '',
    event.reason_en ?? '',
  ])
}

export function extractMoistureAdvisories(events: CalendarEvent[]): MoistureAdvisoryExtraction {
  const ordinaryEvents: CalendarEvent[] = []
  const byKey = new Map<string, MoistureAdvisoryGroup>()

  events.forEach(event => {
    if (!isMapMoistureSession(event)) {
      ordinaryEvents.push(event)
      return
    }

    const key = advisoryKey(event)
    const existing = byKey.get(key)
    if (existing) {
      existing.mapEvents.push(event)
      return
    }

    byKey.set(key, {
      key,
      date: event.date,
      reasonNl: event.reason_nl ?? null,
      reasonEn: event.reason_en ?? null,
      actionNl: event.action_nl ?? null,
      actionEn: event.action_en ?? null,
      mapEvents: [event],
    })
  })

  return { ordinaryEvents, advisories: [...byKey.values()] }
}

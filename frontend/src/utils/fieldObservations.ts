import type { RecentLogEntry, WeedSightingOut } from '../types'

export type CareLogbookEntry = {
  kind: 'care'
  id: string
  occurred_at: string
  care: RecentLogEntry
}

export type FieldObservationLogbookEntry = {
  kind: 'field-observation'
  id: string
  occurred_at: string
  title: string
  subtitle: string | null
  image_url: string | null
  href: string
  map_id: number
  notes: string | null
  observation: WeedSightingOut
}

export type LogbookTimelineEntry = CareLogbookEntry | FieldObservationLogbookEntry

export const userFacingFieldObservationCopy = [
  'Field journal',
  'Plant observations',
  'Log plants you encounter in gardens, parks and shared outdoor spaces.',
]

export function fieldObservationHeroPhoto(observation: WeedSightingOut): string | null {
  return observation.photo_url ?? null
}

export function buildFieldObservationLogEntry(observation: WeedSightingOut): FieldObservationLogbookEntry {
  return {
    kind: 'field-observation',
    id: `field-observation-${observation.id}`,
    occurred_at: observation.sighted_at,
    title: observation.weed_name,
    subtitle: observation.latin_name,
    image_url: fieldObservationHeroPhoto(observation),
    href: `/field-journal?sighting=${observation.id}`,
    map_id: observation.map_id,
    notes: observation.notes ?? null,
    observation,
  }
}

export function buildCareLogEntry(entry: RecentLogEntry): CareLogbookEntry {
  return {
    kind: 'care',
    id: `care-${entry.id}`,
    occurred_at: entry.done_at,
    care: entry,
  }
}

export function combineLogbookTimeline(
  careEntries: RecentLogEntry[],
  fieldObservations: WeedSightingOut[],
): LogbookTimelineEntry[] {
  return [
    ...careEntries.map(buildCareLogEntry),
    ...fieldObservations.map(buildFieldObservationLogEntry),
  ].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
}

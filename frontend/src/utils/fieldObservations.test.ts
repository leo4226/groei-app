import { describe, expect, it } from 'vitest'

import type { RecentLogEntry, WeedSightingOut } from '../types'
import {
  buildFieldObservationLogEntry,
  combineLogbookTimeline,
  fieldObservationHeroPhoto,
  userFacingFieldObservationCopy,
} from './fieldObservations'

const careEntry: RecentLogEntry = {
  id: 1,
  plant_id: 42,
  plant_name: 'Monstera',
  care_type: 'water',
  done_at: '2026-07-07T08:00:00',
  notes: 'Soaked',
  icon_key: null,
}

const observation: WeedSightingOut = {
  id: 11,
  weed_id: 1,
  weed_name: 'Paardenbloem',
  weed_slug: 'paardenbloem',
  latin_name: 'Taraxacum officinale',
  removal_difficulty: 'makkelijk',
  map_id: 7,
  map_x: 12.5,
  map_y: 34.5,
  notes: 'Bij de vijver',
  sighted_at: '2026-07-07T09:30:00',
  photo_url: 'https://cdn.test/observations/11.jpg',
  created_at: '2026-07-07T09:31:00',
}

describe('field observation logbook model', () => {
  it('uses the user-captured observation photo as the hero image', () => {
    expect(fieldObservationHeroPhoto(observation)).toBe('https://cdn.test/observations/11.jpg')
  })

  it('builds a logbook entry for field observations that links back to the field journal', () => {
    expect(buildFieldObservationLogEntry(observation)).toMatchObject({
      kind: 'field-observation',
      id: 'field-observation-11',
      occurred_at: '2026-07-07T09:30:00',
      title: 'Paardenbloem',
      subtitle: 'Taraxacum officinale',
      image_url: 'https://cdn.test/observations/11.jpg',
      href: '/field-journal?sighting=11',
      map_id: 7,
      notes: 'Bij de vijver',
    })
  })

  it('merges care actions and field observations into one newest-first logbook timeline', () => {
    const timeline = combineLogbookTimeline([careEntry], [observation])

    expect(timeline.map((entry) => entry.id)).toEqual([
      'field-observation-11',
      'care-1',
    ])
  })

  it('keeps public copy about the feature free from weed-sighting language', () => {
    const copy = userFacingFieldObservationCopy.join(' ').toLowerCase()

    expect(copy).toContain('field')
    expect(copy).not.toContain('weed')
  })
})

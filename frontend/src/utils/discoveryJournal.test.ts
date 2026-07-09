import { describe, expect, it } from 'vitest'

import type { PlantDiscovery } from '../api/client'
import type { WeedSightingOut } from '../types'
import {
  buildDiscoveryJournalEntry,
  discoveryDisplayName,
  discoveryFunFact,
  shouldShowLegacyFieldObservationSection,
} from './discoveryJournal'

const discovery: PlantDiscovery = {
  id: 10,
  species_id: 123,
  common_name: 'Paardenbloem',
  species_common_name_nl: 'Paardenbloem',
  species_common_name_en: 'Dandelion',
  latin_name: 'Taraxacum officinale',
  thumbnail_url: 'https://cdn.test/field-journal/10.jpg',
  notes: 'Near the path',
  location_lat: 52.3715,
  location_lon: 4.8499,
  fun_fact_nl: 'Paardenbloemen zijn belangrijk voor vroege bestuivers.',
  fun_fact_en: 'Dandelions feed early pollinators.',
  discovered_at: '2026-07-08T12:00:00',
}

const observation: WeedSightingOut = {
  id: 11,
  weed_id: 1,
  weed_name: 'Paardenbloem',
  weed_slug: 'paardenbloem',
  latin_name: 'Taraxacum officinale',
  removal_difficulty: 'makkelijk',
  map_id: 7,
  map_x: 1,
  map_y: 2,
  notes: undefined,
  sighted_at: '2026-07-08T12:01:00',
  photo_data: undefined,
  photo_url: null,
  created_at: '2026-07-08T12:02:00',
}

describe('discovery journal model', () => {
  it('uses plant discoveries as clickable field journal entries with captured photos', () => {
    expect(buildDiscoveryJournalEntry(discovery)).toMatchObject({
      id: 'discovery-10',
      title: 'Paardenbloem',
      subtitle: 'Taraxacum officinale',
      image_url: 'https://cdn.test/field-journal/10.jpg',
      href: '/field-journal?discovery=10',
      fun_fact: 'Paardenbloemen zijn belangrijk voor vroege bestuivers.',
      location: { lat: 52.3715, lon: 4.8499 },
    })
  })

  it('uses locale-aware species names and facts when species data is available', () => {
    expect(discoveryDisplayName(discovery, 'en-GB')).toBe('Dandelion')
    expect(discoveryFunFact(discovery, 'en-GB')).toBe('Dandelions feed early pollinators.')
  })

  it('falls back to the stored discovery name and other fact language', () => {
    const oldDiscovery = {
      ...discovery,
      species_common_name_nl: null,
      species_common_name_en: null,
      fun_fact_nl: null,
      fun_fact_en: 'Fallback fact',
    }
    expect(discoveryDisplayName(oldDiscovery, 'en-GB')).toBe('Paardenbloem')
    expect(discoveryFunFact(oldDiscovery, 'nl-NL')).toBe('Fallback fact')
  })

  it('does not show the legacy field observation empty state under plant discoveries', () => {
    expect(shouldShowLegacyFieldObservationSection([discovery], [])).toBe(false)
  })

  it('keeps legacy mapped field observations visible only when they exist', () => {
    expect(shouldShowLegacyFieldObservationSection([discovery], [observation])).toBe(true)
  })
})

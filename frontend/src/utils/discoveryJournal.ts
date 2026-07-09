import type { PlantDiscovery } from '../api/client'
import type { WeedSightingOut } from '../types'

export type DiscoveryJournalEntry = {
  id: string
  occurred_at: string
  title: string
  subtitle: string | null
  image_url: string | null
  href: string
  notes: string | null
  fun_fact: string | null
  location: { lat: number; lon: number } | null
  discovery: PlantDiscovery
}

export function discoveryDisplayName(discovery: PlantDiscovery, locale = 'nl-NL'): string {
  const isEnglish = locale.toLowerCase().startsWith('en')
  const localized = isEnglish ? discovery.species_common_name_en : discovery.species_common_name_nl
  return localized?.trim() || discovery.common_name
}

export function discoveryFunFact(discovery: PlantDiscovery, locale = 'nl-NL'): string | null {
  const isEnglish = locale.toLowerCase().startsWith('en')
  const fact = isEnglish ? discovery.fun_fact_en : discovery.fun_fact_nl
  const fallback = isEnglish ? discovery.fun_fact_nl : discovery.fun_fact_en
  return fact?.trim() || fallback?.trim() || null
}

export function buildDiscoveryJournalEntry(discovery: PlantDiscovery, locale = 'nl-NL'): DiscoveryJournalEntry {
  return {
    id: `discovery-${discovery.id}`,
    occurred_at: discovery.discovered_at,
    title: discoveryDisplayName(discovery, locale),
    subtitle: discovery.latin_name,
    image_url: discovery.thumbnail_url,
    href: `/field-journal?discovery=${discovery.id}`,
    notes: discovery.notes,
    fun_fact: discoveryFunFact(discovery, locale),
    location: discovery.location_lat != null && discovery.location_lon != null
      ? { lat: discovery.location_lat, lon: discovery.location_lon }
      : null,
    discovery,
  }
}

export function shouldShowLegacyFieldObservationSection(
  _discoveries: PlantDiscovery[],
  observations: WeedSightingOut[],
): boolean {
  return observations.length > 0
}

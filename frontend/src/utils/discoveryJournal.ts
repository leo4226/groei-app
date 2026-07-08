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
  discovery: PlantDiscovery
}

export function buildDiscoveryJournalEntry(discovery: PlantDiscovery): DiscoveryJournalEntry {
  return {
    id: `discovery-${discovery.id}`,
    occurred_at: discovery.discovered_at,
    title: discovery.common_name,
    subtitle: discovery.latin_name,
    image_url: discovery.thumbnail_url,
    href: `/field-journal?discovery=${discovery.id}`,
    notes: discovery.notes,
    discovery,
  }
}

export function shouldShowLegacyFieldObservationSection(
  _discoveries: PlantDiscovery[],
  observations: WeedSightingOut[],
): boolean {
  return observations.length > 0
}

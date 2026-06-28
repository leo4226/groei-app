import type { AdminBackfillFactsPreview } from '../api/client'

export const FACTS_MAP_ONLY_DEFAULT = true

export function scopedFactsMissingCount(
  preview: AdminBackfillFactsPreview | null,
  mapOnly: boolean = FACTS_MAP_ONLY_DEFAULT,
): number | null {
  if (!preview) return null
  if (preview.scope !== 'in_use') return null
  if (preview.map_only !== mapOnly) return null
  return typeof preview.missing_facts === 'number' ? preview.missing_facts : null
}

export function scopedFactsPreviewIsStaleOrUnsupported(
  preview: AdminBackfillFactsPreview | null,
  mapOnly: boolean = FACTS_MAP_ONLY_DEFAULT,
): boolean {
  return preview != null && scopedFactsMissingCount(preview, mapOnly) == null
}

export function scopedFactsRunParams(limit: number, mapOnly: boolean = FACTS_MAP_ONLY_DEFAULT) {
  return { scope: 'in_use' as const, map_only: mapOnly, limit }
}

export function scopedFactsCountLabel(count: number | null, mapOnly: boolean = FACTS_MAP_ONLY_DEFAULT): string {
  const place = mapOnly ? ' on a map' : ''
  return `My plants${place} needing facts: ${count ?? '…'}`
}

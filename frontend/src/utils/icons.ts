import type { PlantIcon } from '../types'

// Module-level index primed once the catalog loads (see api/client.ts).
// resolveIconUrl stays synchronous so its ~29 call sites are unchanged.
let iconUrlIndex: Record<string, string> = {}

export function indexIconUrls(catalog: Pick<PlantIcon, 'id' | 'url' | 'file'>[]): void {
  const next: Record<string, string> = {}
  for (const e of catalog) {
    next[e.id] = e.url ?? `/icons/${e.file ?? `${e.id}.svg`}`
  }
  iconUrlIndex = next
}

export function resolveIconUrl(iconKey: string | null | undefined): string | null {
  if (!iconKey) return null
  return iconUrlIndex[iconKey] ?? `/icons/${iconKey}.svg`
}

import type { BucketPlantOut, WarningSummaryOut } from '../types'

// Shared care-warning grouping logic, used by both the Dashboard's
// CareWarningsSection and the map's GlobalCareSheet so the two surfaces
// stay in lockstep (same bucketing, same per-care-type grouping).

export interface MapGroup {
  mapName: string
  isIndoor: boolean
  /** True for the fallback bucket holding plants not placed on any map. */
  isUnplaced: boolean
  nu: BucketPlantOut[]
  vandaag: BucketPlantOut[]
  week: BucketPlantOut[]
}

export interface GroupedWarning {
  care_type: string
  plants: BucketPlantOut[]
  severity: string
  maxDaysOverdue: number
  hint: string | null
}

export type BucketItem =
  | { kind: 'individual'; plant: BucketPlantOut }
  | { kind: 'group'; group: GroupedWarning }

/** Group all bucketed plants by their map name, indoor maps first. */
export function buildMapGroups(summary: WarningSummaryOut): MapGroup[] {
  const maps = new Map<string, MapGroup>()
  const add = (plants: BucketPlantOut[], bucket: 'nu' | 'vandaag' | 'week') => {
    for (const p of plants) {
      const key = p.map_name ?? 'Overige planten'
      if (!maps.has(key)) maps.set(key, { mapName: key, isIndoor: p.environment === 'indoor', isUnplaced: p.map_name == null, nu: [], vandaag: [], week: [] })
      maps.get(key)![bucket].push(p)
    }
  }
  add(summary.buckets.nu, 'nu')
  add(summary.buckets.vandaag, 'vandaag')
  add(summary.buckets.komende_week, 'week')
  return [...maps.values()].sort((a, b) => {
    if (a.isIndoor !== b.isIndoor) return a.isIndoor ? -1 : 1
    return a.mapName.localeCompare(b.mapName)
  })
}

/**
 * Turn a flat list of bucketed plants into render items. When `grouped` is
 * true (outdoor maps), plants sharing a care type collapse into a single
 * group row; indoor plants always render individually.
 */
export function buildBucketItems(
  plants: BucketPlantOut[],
  doneIds: Set<string>,
  grouped: boolean,
  locale: string,
): BucketItem[] {
  const visible = plants.filter(p => !doneIds.has(`${p.plant_id}_${p.care_type ?? ''}`))
  if (!grouped) return visible.map(p => ({ kind: 'individual', plant: p }))

  const outdoor = visible.filter(p => p.environment !== 'indoor' && p.care_type)
  const indoor  = visible.filter(p => p.environment === 'indoor' || !p.care_type)

  const byType = new Map<string, BucketPlantOut[]>()
  for (const p of outdoor) {
    const arr = byType.get(p.care_type!) ?? []
    arr.push(p)
    byType.set(p.care_type!, arr)
  }

  const sevOrder: Record<string, number> = { urgent: 0, warning: 1, info: 2 }
  const isEn = locale.startsWith('en')
  const groupItems: BucketItem[] = [...byType.entries()].map(([care_type, ps]) => {
    const sorted = [...ps].sort((a, b) => (sevOrder[a.top_warning?.severity ?? 'info'] ?? 3) - (sevOrder[b.top_warning?.severity ?? 'info'] ?? 3))
    const top = sorted[0]
    const message = isEn ? top?.top_warning?.message_en : top?.top_warning?.message_nl
    return {
      kind: 'group' as const,
      group: {
        care_type,
        plants: sorted,
        severity: top?.top_warning?.severity ?? 'info',
        maxDaysOverdue: Math.max(...ps.map(p => p.days_overdue ?? 0)),
        hint: message ?? null,
      },
    }
  })

  return [...groupItems, ...indoor.map(p => ({ kind: 'individual' as const, plant: p }))]
}

/** Count the plants represented by a list of bucket items (groups expand). */
export function itemsPlantCount(items: BucketItem[]): number {
  return items.reduce((sum, item) => sum + (item.kind === 'group' ? item.group.plants.length : 1), 0)
}

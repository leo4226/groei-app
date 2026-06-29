import type { CareWarningOut, MapObject, MapPlant } from '../../types'
import type { Translations } from '../../i18n/translations'

export type PlantWithMeta = MapPlant & { containerName?: string }
export type WarningPlant = PlantWithMeta & { warning: CareWarningOut }

export interface CareNeedsGroup {
  careType: string
  plants: WarningPlant[]
}

export interface CareNeedsGroups {
  groups: CareNeedsGroup[]
  goodPlants: PlantWithMeta[]
}

export interface LocalizedWarningCopy {
  headline: string
  reason: string | null
  action: string | null
}

export function isWeatherWarning(warning: CareWarningOut | null | undefined): warning is CareWarningOut {
  return warning?.trigger === 'weather_event'
}

export function localizedWarningCopy(warning: CareWarningOut, t: Translations): LocalizedWarningCopy {
  const useEnglish = t.locale.startsWith('en')
  return {
    headline: useEnglish ? (warning.message_en || warning.message_nl) : warning.message_nl,
    reason: useEnglish
      ? (warning.reason_en ?? warning.reason_nl ?? null)
      : (warning.reason_nl ?? warning.reason_en ?? null),
    action: useEnglish
      ? (warning.action_en ?? warning.action_nl ?? null)
      : (warning.action_nl ?? warning.action_en ?? null),
  }
}

const CARE_TYPE_LABEL_FALLBACK: Record<string, { nl: string; en: string }> = {
  repot: { nl: 'Verpotten', en: 'Repot' },
  pest_check: { nl: 'Luizen-check', en: 'Pest check' },
  dust: { nl: 'Bladeren afnemen', en: 'Wipe leaves' },
}

const CARE_TYPE_ALIASES: Record<string, string> = {
  repot: 'repot_check',
}

function warningsForPlant(plant: MapPlant): CareWarningOut[] {
  if (plant.warnings?.length) return plant.warnings
  return plant.top_warning ? [plant.top_warning] : []
}

export function buildCareNeedsGroups(plants: MapPlant[], objects: MapObject[]): CareNeedsGroups {
  const containedPlants: PlantWithMeta[] = objects.flatMap((obj) =>
    obj.contained_plants.map((p) => ({ ...p, containerName: obj.name }))
  )

  const allPlants: PlantWithMeta[] = [...plants, ...containedPlants].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  const groups = new Map<string, WarningPlant[]>()
  const goodPlants: PlantWithMeta[] = []

  for (const plant of allPlants) {
    const warnings = warningsForPlant(plant)
    if (warnings.length === 0) {
      goodPlants.push(plant)
      continue
    }

    for (const warning of warnings) {
      const careType = warning.care_type
      if (!groups.has(careType)) groups.set(careType, [])
      groups.get(careType)!.push({ ...plant, warning })
    }
  }

  const sortedGroups = [...groups.entries()]
    .map(([careType, groupPlants]) => ({ careType, plants: groupPlants }))
    .sort((a, b) => {
      if (b.plants.length !== a.plants.length) return b.plants.length - a.plants.length
      return a.careType.localeCompare(b.careType)
    })

  return { groups: sortedGroups, goodPlants }
}

export function getCareTypeDisplay(careType: string, t: Translations): { label: string } {
  const labelKey = CARE_TYPE_ALIASES[careType] ?? careType
  const translated = (t.care as Record<string, string>)[labelKey]
  const fallback = CARE_TYPE_LABEL_FALLBACK[careType]
  const label = translated ?? (t.locale.startsWith('en') ? fallback?.en : fallback?.nl) ?? careType

  return { label }
}

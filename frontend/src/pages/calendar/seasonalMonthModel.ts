import type { MonthPhenology, Phenology } from '../../types'

const ACTIVE_PHASES = new Set([
  'growing', 'flowering', 'fruiting', 'harvest', 'establishing', 'evergreen',
])

export type SeasonalContextKind = 'bloom' | 'sow' | 'transplant' | 'harvest'

export interface SeasonalPlantSource {
  id: number
  phenology: Phenology | null
}

export interface SeasonalMonthEntry<T extends SeasonalPlantSource> {
  plant: T
  monthData: MonthPhenology
  phenology: Phenology
}

export interface SeasonalMonthSummary<T extends SeasonalPlantSource> {
  needsAction: SeasonalMonthEntry<T>[]
  growing: SeasonalMonthEntry<T>[]
  dormant: SeasonalMonthEntry<T>[]
  noData: T[]
  context: Record<SeasonalContextKind, SeasonalMonthEntry<T>[]>
}

export function seasonalPhaseLabel(monthData: MonthPhenology, locale: string): string | null {
  const label = locale.startsWith('en') ? monthData.phase_label_en : monthData.phase_label_nl
  return label?.trim() || null
}

export type SeasonalEnvironment = 'all' | 'tuin' | 'huis'

export function filterSeasonalPlantsByEnvironment<
  T extends { map_id: number | null },
  M extends { id: number; map_type: 'outdoor' | 'indoor' },
>(plants: T[], maps: M[], environment: string): T[] {
  if (environment === 'all') return plants

  const requiredMapType = environment === 'tuin'
    ? 'outdoor'
    : environment === 'huis'
      ? 'indoor'
      : null
  if (!requiredMapType) return plants

  const mapTypeById = new Map(maps.map(map => [map.id, map.map_type] as const))
  return plants.filter(plant => (
    plant.map_id !== null && mapTypeById.get(plant.map_id) === requiredMapType
  ))
}

export function summarizeSeasonalMonth<T extends SeasonalPlantSource>(
  plants: T[],
  month: number,
): SeasonalMonthSummary<T> {
  const summary: SeasonalMonthSummary<T> = {
    needsAction: [],
    growing: [],
    dormant: [],
    noData: [],
    context: { bloom: [], sow: [], transplant: [], harvest: [] },
  }

  plants.forEach(plant => {
    const phenology = plant.phenology
    const monthData = phenology?.months?.find(candidate => candidate.month === month)
    if (!phenology || !monthData) {
      summary.noData.push(plant)
      return
    }

    const entry = { plant, monthData, phenology }
    const hasSow = phenology.sow_window?.includes(month)
    const hasTransplant = phenology.transplant_window?.includes(month)
    const hasHarvest = phenology.harvest_window?.includes(month)

    if (hasSow || hasTransplant || hasHarvest) summary.needsAction.push(entry)
    else if (ACTIVE_PHASES.has(monthData.phase)) summary.growing.push(entry)
    else summary.dormant.push(entry)

    if (monthData.phase === 'flowering') summary.context.bloom.push(entry)
    if (hasSow) summary.context.sow.push(entry)
    if (hasTransplant) summary.context.transplant.push(entry)
    if (hasHarvest) summary.context.harvest.push(entry)
  })

  return summary
}

import type { CareScheduleInput, MapInfo, Plant } from '../types'

export const EDITABLE_CARE_TYPES = [
  'water', 'fertilize', 'prune', 'repot',
  'pest_check', 'mist', 'rotate', 'dust',
] as const

export type EditableCareType = (typeof EDITABLE_CARE_TYPES)[number]
export type CareEnvironment = 'indoor' | 'outdoor_container' | 'outdoor_ground'
export type ScheduleEditorEntry = { enabled: boolean; days: number }
export type ScheduleEditorState = Record<EditableCareType, ScheduleEditorEntry>

const DEFAULT_INTERVALS: Record<EditableCareType, Record<CareEnvironment, number | null>> = {
  water: { indoor: 7, outdoor_container: 4, outdoor_ground: 7 },
  fertilize: { indoor: 30, outdoor_container: 21, outdoor_ground: 30 },
  prune: { indoor: 365, outdoor_container: 180, outdoor_ground: 180 },
  repot: { indoor: 540, outdoor_container: 540, outdoor_ground: null },
  pest_check: { indoor: 30, outdoor_container: 30, outdoor_ground: 30 },
  mist: { indoor: 7, outdoor_container: null, outdoor_ground: null },
  rotate: { indoor: 7, outdoor_container: null, outdoor_ground: null },
  dust: { indoor: 30, outdoor_container: null, outdoor_ground: null },
}

export function careEnvironmentForPlant(
  plant: Pick<Plant, 'container_id'>,
  map: Pick<MapInfo, 'map_type'> | undefined,
): CareEnvironment {
  if (map?.map_type === 'indoor') return 'indoor'
  if (plant.container_id != null) return 'outdoor_container'
  return 'outdoor_ground'
}

export function editableCareTypesForEnvironment(
  environment: CareEnvironment,
): EditableCareType[] {
  return EDITABLE_CARE_TYPES.filter(type => DEFAULT_INTERVALS[type][environment] != null)
}

export function buildScheduleEditorState(
  plant: Pick<Plant, 'care_schedules'>,
  environment: CareEnvironment,
): ScheduleEditorState {
  return Object.fromEntries(EDITABLE_CARE_TYPES.map(type => {
    const persisted = plant.care_schedules.find(
      schedule => schedule.is_active && schedule.care_type === type,
    )
    const fallback = DEFAULT_INTERVALS[type][environment]
      ?? DEFAULT_INTERVALS[type].indoor
      ?? 7
    return [type, {
      enabled: Boolean(persisted),
      days: persisted?.interval_days ?? fallback,
    }]
  })) as ScheduleEditorState
}

export function buildCareScheduleSyncPayload(
  state: ScheduleEditorState,
  environment: CareEnvironment,
): CareScheduleInput[] {
  return editableCareTypesForEnvironment(environment)
    .filter(type => state[type].enabled && state[type].days > 0)
    .map(type => ({
      care_type: type,
      interval_days: Math.trunc(state[type].days),
    }))
}

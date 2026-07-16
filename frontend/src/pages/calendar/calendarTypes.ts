export type EventTypeId =
  | 'water'
  | 'fertilize'
  | 'prune'
  | 'bloom'
  | 'sow'
  | 'repot'
  | 'harvest'
  | 'scan'
  | 'rain'
  | 'mist'
  | 'rotate'
  | 'pest_check'
  | 'dust'
  | 'frost_protect'
  | 'heat_protect'
  | 'moisture_check'

export interface EventTypeDef {
  id: EventTypeId
  labelNl: string
  labelEn: string
  color: string
  cssClass: string
}

export const EVENT_TYPES: EventTypeDef[] = [
  { id: 'water',         labelNl: 'Water',        labelEn: 'Water',     color: '#6B8FCA', cssClass: 'water' },
  { id: 'fertilize',     labelNl: 'Voeden',       labelEn: 'Feed',      color: '#D9A418', cssClass: 'feed' },
  { id: 'prune',         labelNl: 'Snoeien',      labelEn: 'Prune',     color: '#B2664A', cssClass: 'prune' },
  { id: 'bloom',         labelNl: 'Bloei',        labelEn: 'Bloom',     color: '#2F5D3A', cssClass: 'bloom' },
  { id: 'sow',           labelNl: 'Zaaien',       labelEn: 'Sow',       color: '#4A7C4E', cssClass: 'sow' },
  { id: 'repot',         labelNl: 'Verpotten',    labelEn: 'Repot',     color: '#8E4A33', cssClass: 'repot' },
  { id: 'harvest',       labelNl: 'Oogsten',      labelEn: 'Harvest',   color: '#1F3F26', cssClass: 'harvest' },
  { id: 'scan',          labelNl: 'Plaag · scan', labelEn: 'Pest scan', color: '#4A6BA8', cssClass: 'scan' },
  { id: 'rain',          labelNl: 'Neerslag',     labelEn: 'Rain',      color: '#8A9482', cssClass: 'rain' },
  { id: 'mist',          labelNl: 'Sproeien',     labelEn: 'Mist',      color: '#7BA7C9', cssClass: 'mist' },
  { id: 'rotate',        labelNl: 'Draaien',      labelEn: 'Rotate',    color: '#A38F7A', cssClass: 'rotate' },
  { id: 'pest_check',    labelNl: 'Plaagcheck',   labelEn: 'Pest check',color: '#6B4A8A', cssClass: 'pest-check' },
  { id: 'dust',          labelNl: 'Afstoffen',    labelEn: 'Dust',      color: '#8A7F7A', cssClass: 'dust' },
  { id: 'frost_protect', labelNl: 'Koude bescherming',  labelEn: 'Frost protection', color: '#5B8FA8', cssClass: 'frost-protect' },
  { id: 'heat_protect',  labelNl: 'Hitte bescherming',  labelEn: 'Heat protection',  color: '#C97A4A', cssClass: 'heat-protect' },
  { id: 'moisture_check', labelNl: 'Vochtcontrole', labelEn: 'Moisture check', color: '#4F7C66', cssClass: 'moisture-check' },
]

export const EVENT_TYPE_BY_ID: Record<string, EventTypeDef | undefined> =
  Object.fromEntries(EVENT_TYPES.map(t => [t.id, t]))

import type { Translations } from '../../i18n/translations'

/** Maps EventTypeId to its translation key in t.utility */
export const EVENT_TYPE_UTILITY_KEY: Record<EventTypeId, keyof Translations['utility']> = {
  water: 'eventWater',
  fertilize: 'eventFertilize',
  prune: 'eventPrune',
  bloom: 'eventBloom',
  sow: 'eventSow',
  repot: 'eventRepot',
  harvest: 'eventHarvest',
  scan: 'eventScan',
  rain: 'eventRain',
  mist: 'eventMist',
  rotate: 'eventRotate',
  pest_check: 'eventPestCheck',
  dust: 'eventDust',
  frost_protect: 'eventColdProtection',
  heat_protect: 'eventHeatProtection',
  moisture_check: 'eventMoistureCheck',
}

export interface CalendarEvent {
  id: string
  date: string
  type: EventTypeId
  plant_id: number | null
  plant_name: string | null
  species_common_name_nl?: string | null
  species_common_name_en?: string | null
  plant_icon_variant: string | null
  schedule_id: number | null
  map_id: number | null
  map_name: string | null
  overdue: boolean
  severity: string | null
  color: string | null
  icon: string | null
  grouped: boolean
  group_count: number | null
  group_member_schedule_ids: number[] | null
  group_members?: Array<{
    schedule_id: number
    plant_id: number
    plant_name: string
    plant_icon_variant: string | null
    reason_nl?: string | null
    reason_en?: string | null
  }> | null
  weather_triggered: boolean
  reason_nl?: string | null
  reason_en?: string | null
  action_nl?: string | null
  action_en?: string | null
  weather_metric?: string | null
  weather_value_c?: number | null
  forecast_day_label_nl?: string | null
  forecast_day_label_en?: string | null
}

const CARE_ACTION_TYPES = new Set<EventTypeId>([
  'water', 'fertilize', 'prune', 'mist', 'rotate',
  'pest_check', 'dust', 'repot', 'sow', 'harvest', 'scan',
  'moisture_check',
])

export function isCareSession(event: CalendarEvent): boolean {
  return CARE_ACTION_TYPES.has(event.type) && (event.grouped || event.plant_id !== null)
}

export function isActionable(event: CalendarEvent, todayIso: string): boolean {
  return isCareSession(event) && event.date <= todayIso
}

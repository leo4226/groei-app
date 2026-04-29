export interface User {
  id: number
  name: string
  avatar: string | null
}

export interface Location {
  id: number
  name: string
  icon: string | null
  sort_order: number
}

export interface CareSchedule {
  id: number
  plant_id: number
  care_type: CareType
  interval_days: number
  season_adjust: string | null
  next_due: string
  last_done: string | null
  last_done_by: number | null
  last_done_by_name: string | null
  notes: string | null
  is_active: boolean
}

export interface Plant {
  id: number
  name: string
  species: string | null
  location_id: number | null
  location_name: string | null
  location_icon: string | null
  map_id: number | null
  map_x: number | null
  map_y: number | null
  photo_path: string | null
  acquired_date: string | null
  pot_size_cm: number | null
  container_id: number | null
  last_repotted: string | null
  notes: string | null
  is_active: boolean
  is_locked: boolean
  created_at: string | null
  sun_requirement: string | null
  plant_type: string | null
  icon_key: string | null
  species_id: number | null
  phenology: Phenology | null
  care_schedules: CareSchedule[]
}

export interface CareLogEntry {
  id: number
  plant_id: number
  care_type: string
  done_by: number
  done_by_name: string | null
  done_at: string
  notes: string | null
  skipped: boolean
}

export interface CareTask {
  plant_id: number
  plant_name: string
  plant_photo: string | null
  location: string | null
  care_type: string
  days_overdue: number
  last_done_by: string | null
  last_done_at: string | null
  schedule_id: number
}

export interface DashboardData {
  overdue: CareTask[]
  due_today: CareTask[]
  upcoming: CareTask[]
}

export type CareType = 'water' | 'fertilize' | 'mist' | 'rotate' | 'repot_check' | 'prune'

export interface CareScheduleInput {
  care_type: CareType
  interval_days: number
  season_adjust?: string
  notes?: string
}

export interface PlantCreateInput {
  name: string
  species?: string
  location_id?: number
  acquired_date?: string
  pot_size_cm?: number
  notes?: string
  map_id?: number
  map_x?: number
  map_y?: number
  sun_requirement?: string
  plant_type?: string
  icon_key?: string
  care_schedules: CareScheduleInput[]
}

// --- Maps ---

export interface MapInfo {
  id: number
  name: string
  slug: string
  svg_file: string
  viewbox: string
  scale_info: string | null
  sort_order: number
  canvas_data: string | null
}

// --- Map Editor ---

export type ZoneStyleType = 'deck' | 'soil' | 'gravel' | 'lawn' | 'wall' | 'path' | 'room' | 'water' | 'structure'

export interface EditorZone {
  id: string
  type: ZoneStyleType
  shape: 'rect'
  x: number
  y: number
  width: number
  height: number
  label: string
}

export interface CanvasData {
  zones: EditorZone[]
  scale_px_per_m: number
  canvas_w: number
  canvas_h: number
}

export interface Zone {
  id: number
  map_id: number
  name: string
  zone_type: string
  sun_exposure: string | null
  boundary: string
  color: string | null
  sort_order: number
}

export interface MapDetail extends MapInfo {
  zones: Zone[]
}

export interface MostUrgent {
  care_type: string
  days_overdue: number
  last_done_by: string | null
}

export interface GroundZone {
  id: string
  map_id: number
  name: string
  zone_type: string
  polygon: string   // JSON-encoded [x, y][] array
  soil_note: string | null
}

export interface MonthPhenology {
  month: number
  phase: string
  phase_label_nl: string
  sun_hours_needed: number
  description_nl: string
  actions_nl: string[]
}

export interface Phenology {
  months: MonthPhenology[]
  sow_window: number[]
  transplant_window: number[]
  harvest_window: number[]
  frost_sensitive: boolean
  min_temp_c: number | null
  max_height_cm: number | null
  max_spread_cm: number | null
  interesting_facts_nl: string
  climate_zone: string
}

export interface MapPlant {
  id: number
  name: string
  species: string | null
  map_x: number
  map_y: number
  photo_path: string | null
  container_id: number | null
  ground_zone_id: string | null
  display_radius_cm: number | null
  care_status: 'overdue' | 'due_today' | 'good'
  temp_status: 'comfortable' | 'chilling' | 'freezing' | 'heatstress'
  most_urgent: MostUrgent | null
  sun_requirement: string | null
  plant_type: string | null
  icon_key: string | null
  species_id: number | null
  phenology: Phenology | null
  is_locked: boolean
}

// --- Objects ---

export type ObjectType = 'pot' | 'planter' | 'raised_bed' | 'furniture'
export type ObjectShapeType = 'circle' | 'square' | 'rectangle'
export type ObjectMaterial = 'terracotta' | 'plastic' | 'wood' | 'corten' | 'stone'
export type ObjectCategory = 'container' | 'hardscape' | 'utility'
export type HardscapePreset = 'stepping_stone' | 'bench' | 'table' | 'chair' | 'rain_barrel'

export interface MapObject {
  id: number
  name: string
  object_type: ObjectType
  shape: ObjectShapeType
  diameter_cm: number | null
  width_cm: number | null
  depth_cm: number | null
  material: ObjectMaterial | null
  color: string | null
  map_id: number | null
  map_x: number | null
  map_y: number | null
  rotation: number
  notes: string | null
  is_active: boolean
  created_at: string | null
  updated_at: string | null
  contained_plants: MapPlant[]
  category: ObjectCategory
  label: string | null
  preset: string | null
}

export interface ObjectCreateInput {
  name: string
  object_type: ObjectType
  shape: ObjectShapeType
  diameter_cm?: number
  width_cm?: number
  depth_cm?: number
  material?: string
  color?: string
  map_id?: number
  map_x?: number
  map_y?: number
  rotation?: number
  notes?: string
  category?: ObjectCategory
  label?: string
  preset?: string
}

export interface MapItems {
  plants: MapPlant[]
  objects: MapObject[]
}

// --- Garden water log ---

export interface GardenWaterLog {
  watered_at: string | null  // ISO date string or null
}

// --- Alerts ---

export interface PlantAlert {
  type: string
  severity: 'info' | 'warning' | 'urgent'
  message_nl: string
  icon: string
}

export interface AlertSummary {
  total_count: number
  worst_severity: 'info' | 'warning' | 'urgent' | null
  plant_ids_with_alerts: number[]
}

// --- Icons ---

export interface PlantIcon {
  id: string
  name: string
  sci: string
  cat: string
  form: string
  family: string
  file: string
}

export interface IconSyncResult {
  total_icons: number
  new_icons: number
  new_icon_ids: string[]
  matched_plants: number
  matches: { plant_id: number; plant_name: string; icon_key: string }[]
  unmatched_plants: number
  unmatched: { plant_id: number; plant_name: string }[]
}

export const CARE_TYPE_INFO: Record<CareType, { label: string; icon: string; defaultIndoor: number; defaultOutdoor: number }> = {
  water:       { label: 'Water',       icon: '💧', defaultIndoor: 7,   defaultOutdoor: 3 },
  fertilize:   { label: 'Fertilize',   icon: '🧪', defaultIndoor: 21,  defaultOutdoor: 14 },
  mist:        { label: 'Mist',        icon: '🌫️', defaultIndoor: 3,   defaultOutdoor: 0 },
  rotate:      { label: 'Rotate',      icon: '🔄', defaultIndoor: 14,  defaultOutdoor: 0 },
  repot_check: { label: 'Repot check', icon: '🪴', defaultIndoor: 180, defaultOutdoor: 365 },
  prune:       { label: 'Prune',       icon: '✂️', defaultIndoor: 90,  defaultOutdoor: 30 },
}

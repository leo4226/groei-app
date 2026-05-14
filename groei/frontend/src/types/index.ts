export interface User {
  id: number
  name: string
  avatar: string | null
  language: 'nl' | 'en'
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
  icon_requested: boolean
  phase: 'seed' | 'seedling' | 'mature'
  species_id: number | null
  phenology: Phenology | null
  care_schedules: CareSchedule[]
  care_status: 'overdue' | 'due_today' | 'good'
  temp_status: 'comfortable' | 'chilling' | 'freezing' | 'heatstress'
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
  map_type: string | null
  care_type: string
  days_overdue: number
  last_done_by: string | null
  last_done_at: string | null
  schedule_id: number
  is_ephemeral: boolean
}

export interface DashboardData {
  overdue: CareTask[]
  due_today: CareTask[]
  upcoming: CareTask[]
}

export interface StatusCounts {
  total: number
  on_schedule: number
  thirsty: number
  dry: number
}

export interface RecentLogEntry {
  id: number
  plant_id: number
  plant_name: string
  icon_key: string | null
  care_type: string
  done_at: string
  notes: string | null
}

export interface DashboardV2Data {
  overdue: CareTask[]
  due_today: CareTask[]
  upcoming: CareTask[]
  status_counts: StatusCounts
  recent_log: RecentLogEntry[]
  plant_fact: PlantFactOut | null
}

export type CareType = 'water' | 'fertilize' | 'mist' | 'rotate' | 'repot_check' | 'prune' | 'protect_cold' | 'protect_heat'

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
  phase?: 'seed' | 'seedling' | 'mature'
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
  thumbnail_file: string | null
  map_type: 'outdoor' | 'indoor'
  lat: number | null
  lon: number | null
  bearing: number
}

// --- Map Editor ---

export type ZoneStyleType = 'deck' | 'soil' | 'gravel' | 'lawn' | 'wall' | 'path' | 'room' | 'water' | 'structure' | 'fence'
export type WallThickness = 'exterior' | 'interior'
export type FenceMaterial = 'wood' | 'brick'
export type RoomEdge = 'top' | 'right' | 'bottom' | 'left'
export type MapType = 'outdoor' | 'indoor'

export type CornerPosition = 'tl' | 'tr' | 'bl' | 'br'

export interface CornerCut {
  corner: CornerPosition
  widthPx: number   // pixels, same coordinate space as zone.width
  heightPx: number  // pixels
}

export interface EditorZone {
  id: string
  type: ZoneStyleType
  shape: 'rect'
  x: number
  y: number
  width: number
  height: number
  label: string
  wallThickness?: WallThickness
  roomHeightM?: number   // physical ceiling height in metres (informational only)
  cornerCut?: CornerCut  // single rectangular notch cut from one corner
  fenceMaterial?: FenceMaterial  // wood or brick, only for fence type
  fenceHeightM?: number  // fence height in metres (affects shadow casting)
  structureHeightM?: number  // structure/shed height in metres (affects shadow casting)
}

export interface WallElement {
  id: string
  type: 'door' | 'window'
  zoneId: string
  edge: RoomEdge
  position: number
  widthCm: number
  swingSide?: 'left' | 'right'
  swingDirection?: 'inward' | 'outward'
}

export type ShadowCaster =
  | { id: string; label: string; type: 'rect'; x: number; y: number; width: number; height: number; heightCm: number; opacity?: number }
  | { id: string; label: string; type: 'circle'; cx: number; cy: number; radius: number; heightCm: number; opacity?: number }
  | { id: string; label: string; type: 'polygon'; points: [number, number][]; heightCm: number; opacity?: number }

export interface CanvasData {
  zones: EditorZone[]
  wallElements?: WallElement[]
  scale_px_per_m: number
  canvas_w: number
  canvas_h: number
  mapType?: MapType
  shadowCasters?: ShadowCaster[]  // external casters (buildings, trees) stored alongside zone data
}

export interface MapDetail extends MapInfo {}

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

export interface TopAlert {
  alert_type: string  // overdue_water | due_today | drought | waterlog | cold | heat | bring_inside | fertilise
  severity: 'urgent' | 'warning' | 'info'
  icon: string
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
  is_locked: boolean,
  top_alert: TopAlert | null
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
  phase?: string
  variant_of?: string
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

export interface IconGapItem {
  id?: number
  name: string
  latin?: string
  sci?: string
  species?: string | null
}

export interface IconGapReport {
  requested: IconGapItem[]
  species_without_icon: IconGapItem[]
  icons_without_species: IconGapItem[]
}

export interface PlantFactOut {
  plant_id: number
  plant_name: string
  icon_key: string | null
  fact_nl: string
  species_name: string | null
}

export const CARE_TYPE_INFO: Record<CareType, { label: string; icon: string; defaultIndoor: number; defaultOutdoor: number }> = {
  water:       { label: 'Water',       icon: '💧', defaultIndoor: 7,   defaultOutdoor: 3 },
  fertilize:   { label: 'Fertilize',   icon: '🧪', defaultIndoor: 21,  defaultOutdoor: 14 },
  mist:        { label: 'Mist',        icon: '🌫️', defaultIndoor: 3,   defaultOutdoor: 0 },
  rotate:      { label: 'Rotate',      icon: '🔄', defaultIndoor: 14,  defaultOutdoor: 0 },
  repot_check: { label: 'Repot check', icon: '🪴', defaultIndoor: 180, defaultOutdoor: 365 },
  prune:        { label: 'Prune',        icon: '✂️', defaultIndoor: 90,  defaultOutdoor: 30 },
  protect_cold: { label: 'Protect Cold', icon: '🧤', defaultIndoor: 0,   defaultOutdoor: 0 },
  protect_heat: { label: 'Protect Heat', icon: '🧴', defaultIndoor: 0,   defaultOutdoor: 0 },
}

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
  species_common_name_nl: string | null
  species_common_name_en: string | null
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
  sown_date: string | null
  sun_requirement: string | null
  plant_type: string | null
  icon_key: string | null
  icon_requested: boolean
  phase: 'seed' | 'sprout' | 'seedling' | 'young' | 'established'
  quantity: number
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
  water_amount: number | null
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

export type CareType = 'water' | 'fertilize' | 'mist' | 'rotate' | 'repot' | 'prune' | 'pest_check' | 'dust' | 'frost_protect' | 'heat_protect' | 'photo'

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
  phase?: 'seed' | 'sprout' | 'seedling' | 'young' | 'established'
  sown_date?: string
  quantity?: number
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

export type ZoneStyleType = 'deck' | 'soil' | 'gravel' | 'lawn' | 'wall' | 'path' | 'room' | 'water' | 'structure' | 'fence' | 'raised_bed'
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
  raisedBedHeightM?: number  // raised bed height in metres (affects shadow casting)
  soil_note?: string  // gardener's note for soil quality, only for soil type
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
  | { id: string; label: string; type: 'rect'; x: number; y: number; width: number; height: number; heightCm: number; opacity?: number; excludeSelf?: boolean }
  | { id: string; label: string; type: 'circle'; cx: number; cy: number; radius: number; heightCm: number; opacity?: number; excludeSelf?: boolean }
  | { id: string; label: string; type: 'polygon'; points: [number, number][]; heightCm: number; opacity?: number; excludeSelf?: boolean }

export interface CanvasData {
  zones: EditorZone[]
  wallElements?: WallElement[]
  scale_px_per_m: number
  canvas_w: number
  canvas_h: number
  mapType?: MapType
  shadowCasters?: ShadowCaster[]  // external casters (buildings, trees) stored alongside zone data
  gardenPerimeter?: [number, number][]  // manually saved garden boundary (sun polygon)
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
  phase_label_en?: string
  sun_hours_needed: number
  description_nl: string
  description_en?: string
  actions_nl: string[]
  actions_en?: string[]
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
  interesting_facts_en?: string
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
  species_common_name_nl: string | null
  species_common_name_en: string | null
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
  quantity: number
  top_alert: TopAlert | null
  alerts: TopAlert[]
  top_warning: CareWarningOut | null
  warnings: CareWarningOut[]
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

export interface SecondaryMarker {
  id: number
  plant_id: number
  map_x: number
  map_y: number
  ground_zone_id: string | null
  phase: string | null
  name: string
  icon_key: string | null
}

export interface MapItems {
  plants: MapPlant[]
  objects: MapObject[]
  secondary_markers: SecondaryMarker[]
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
  message_en?: string
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
  url?: string
}

export interface IconSyncResult {
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
  fact_en: string
  species_name_nl: string | null
  species_name_en: string | null
}

export const CARE_TYPE_INFO: Record<CareType, { label: string; defaultIndoor: number; defaultOutdoor: number }> = {
  water:       { label: 'Water',       defaultIndoor: 7,   defaultOutdoor: 3 },
  fertilize:   { label: 'Fertilize',   defaultIndoor: 21,  defaultOutdoor: 14 },
  mist:        { label: 'Mist',        defaultIndoor: 0,   defaultOutdoor: 0 },
  rotate:      { label: 'Rotate',      defaultIndoor: 14,  defaultOutdoor: 0 },
  repot: { label: 'Repot check', defaultIndoor: 180, defaultOutdoor: 365 },
  prune:        { label: 'Prune',        defaultIndoor: 90,  defaultOutdoor: 30 },
  pest_check:   { label: 'Pest check',   defaultIndoor: 30,  defaultOutdoor: 30 },
  dust:         { label: 'Wipe leaves',  defaultIndoor: 30,  defaultOutdoor: 0 },
  frost_protect: { label: 'Protect Cold', defaultIndoor: 0,   defaultOutdoor: 0 },
  heat_protect: { label: 'Protect Heat', defaultIndoor: 0,   defaultOutdoor: 0 },
  photo:        { label: 'Progress photo', defaultIndoor: 30,  defaultOutdoor: 30 },
}

/**
 * Care types that only make sense for indoor plants. Mirror of the backend
 * `is_care_type_valid_for_env` rule — outdoor plants (in the ground or in
 * outdoor containers) never rotate for even light or get misted.
 */
export const INDOOR_ONLY_CARE_TYPES: CareType[] = ['rotate', 'mist', 'dust']

/** Whether a care type applies in the given environment. */
export function isCareTypeValidForEnv(careType: CareType, isIndoor: boolean): boolean {
  return isIndoor || !INDOOR_ONLY_CARE_TYPES.includes(careType)
}

// ── Care warning types (Phase C) ──

export interface CareWarningOut {
  care_type: string
  severity: string
  trigger: string
  days_overdue: number | null
  message_nl: string
  message_en: string
  icon: string
  color: string
  reason_nl?: string | null
  reason_en?: string | null
  action_nl?: string | null
  action_en?: string | null
  weather_metric?: string | null
  weather_value_c?: number | null
  forecast_day_label_nl?: string | null
  forecast_day_label_en?: string | null
}

export interface CareTypeStatusOut {
  care_type: string
  status: string
  days_until_due: number | null
  last_done: string | null
}

export interface PlantWarningStateOut {
  plant_id: number
  environment: string
  active_care_types: string[]
  warnings: CareWarningOut[]
  top_warning: CareWarningOut | null
  care_summary: Record<string, CareTypeStatusOut>
}

// ── Warning Summary (C3 Dashboard) ──

export interface CareTypeKPIOut {
  care_type: string
  icon: string
  label_nl: string
  label_en: string
  count: number
  urgent_count: number
  warning_count: number
  info_count: number
}

export interface BucketPlantOut {
  plant_id: number
  plant_name: string
  plant_icon_variant: string | null
  environment: string
  map_name: string | null
  care_type: string | null
  top_warning: CareWarningOut | null
  days_overdue: number | null
  schedule_id: number | null
}

export interface WarningBucketsOut {
  nu: BucketPlantOut[]
  vandaag: BucketPlantOut[]
  komende_week: BucketPlantOut[]
}

export interface WarningSummaryOut {
  total_plants: number
  on_schedule: number
  kpis: CareTypeKPIOut[]
  buckets: WarningBucketsOut
}

// ── Plant identification (Pl@ntNet) ──

export type IdentifySource = 'bioclip' | 'plantnet'

export type PlantIdCandidate = {
  scientific_name: string
  common_names_nl: string[]
  common_names_en: string[]
  confidence: number
  species_id: number | null
  thumbnail_url: string | null
  source?: IdentifySource
}

export type IdentifyConfidence = 'high' | 'medium' | 'low' | 'no_match'

export type IdentifyResponse = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence    // 4-state confidence level
  // DEPRECATED. Backend now derives this as (confidence !== "high"), which is
  // broader than the old "top1 in [0.10, 0.30)" definition — medium-confidence
  // results now flag as low_confidence too. Read `confidence` directly instead.
  low_confidence: boolean
  source?: IdentifySource
}

export type IdentifyCommitResult = {
  species_id: number
  /** Suggested display name in the language the commit was requested with (?lang=). */
  name_suggested: string
  /** DEPRECATED: Dutch-preferred name; read name_suggested instead. */
  name_nl_suggested: string
  scientific_name: string
  icon_key: string | null
  care_thresholds: Record<string, unknown>
  photo_path: string
}

// ── Weed catalog & sightings ──

export type WeedSpeciesListItem = {
  id: number
  slug: string
  common_name_nl: string
  latin_name: string
  family: string | null
  flower_color: string | null
  places: string[]
}

export type WeedSightingCreate = {
  weed_id: number
  map_id: number
  map_x: number
  map_y: number
  notes?: string
  sighted_at: string
  photo_data?: string
}

export type WeedSightingOut = WeedSightingCreate & {
  id: number
  weed_name: string
  weed_slug: string
  latin_name: string
  removal_difficulty: string | null
  photo_url: string | null
  map_name?: string
  created_at: string
}

export type SightingDetailOut = WeedSightingOut & {
  ecology_data: Record<string, unknown> | null
  fun_fact_nl: string | null
  fun_fact_en: string | null
  removal_json: Record<string, unknown> | null
  common_name_nl: string | null
  common_name_en: string | null
  family: string | null
  flowering_months: number[]
  native_status: string | null
  pollinator_value: string | null
}

// ── Species ecology ──

// ── Garden recommendations (DB-based) ──

export type PlantRecommendation = {
  species_id: number
  dutch_name: string
  english_name?: string | null
  latin_name: string
  sun_preference: string | null
  sun_fit: 'perfect' | 'acceptable' | 'marginal' | 'tolerated'
  is_native: boolean | null
  pollinator_value: number | null      // 0..3
  flowering_months: number[] | null
  gap_months_covered: number[]
  reason: string
  reason_en?: string | null
  caveat: string | null
}

export type RecommendationsOut = {
  recommendations: PlantRecommendation[]
  gap_months: number[]
  biodiversity_score: number
}

// Garden-level suggestions endpoint uses "suggestions" key (vs. spot-level "recommendations").
// The field name difference is intentional — the backends return structurally identical shapes.
export type GardenSuggestionsOut = {
  suggestions: PlantRecommendation[]
  gap_months: number[]
  biodiversity_score: number
}

export type EcologyDataSource = 'gbif' | 'llm' | 'mixed' | 'failed'

export type GardenBiodiversityOut = {
  score: number                                 // 0..100
  species_count: number
  native_count: number
  invasive_count: number
  pollinator_coverage_months: boolean[]         // 12 entries, index 0 = January
  components: {
    pollinator: number
    native: number
    diversity: number
  }
}

export type EcologyOut = {
  native_to_nl: boolean | null
  invasive_nl: boolean | null
  flowering_months: number[] | null    // 1-12
  pollinator_value: number | null       // 0-3
  host_plant_for: string[] | null
  sun_preference: string | null
  data_source: EcologyDataSource
  enriched_at: string                   // ISO timestamp
  score: number | null                  // 0-100; null when no data
}

export interface PlantPhoto {
  id: number
  plant_id: number
  url: string
  note: string | null
  taken_at: string
  care_log_id: number | null
  species_mismatch: boolean
}

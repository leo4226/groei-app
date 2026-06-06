// Pure, unit-testable helpers for the Add Plant flow.
//
// AddPlant.tsx reaches the form via three `location.state.from` paths —
// `identify` (photo ID → IdentifyCommitResult), `pick` (database → LocalPlant),
// and `manual` ({ name }). The prefill duck-typing, the create payload builder,
// and the threshold/sun mapping all used to live tangled inside the component,
// where the node-env vitest suite can't reach them. They live here now.

import type { LocalPlant } from '../../data/plants-dataset'
import type { IdentifyCommitResult, PlantIcon, CareType, PlantCreateInput, CareScheduleInput } from '../../types'
import { CARE_TYPE_INFO } from '../../types'

// ── Constant maps (moved from AddPlant.tsx, co-located here) ──

/** Map database (Dutch) plant type to the backend's system plant_type. */
export const DUTCH_TYPE_TO_SYSTEM: Record<string, string> = {
  vaste_plant: 'herb',
  heester: 'shrub',
  klimmer: 'climber',
  gras: 'grass',
  bol: 'bulb',
  eenjarig: 'flower',
  boom: 'tree',
}

/** Map LocalPlant waterNeeds to a water interval in days. */
export const WATER_NEEDS_TO_DAYS: Record<string, number> = {
  laag: 14,
  gemiddeld: 7,
  hoog: 3,
}

/**
 * Map database / species `sun_preference` values to TileGrid IDs.
 * Covers both the `LocalPlant.sunRequirement` vocabulary and the species
 * ecology `sun_preference` vocabulary — they share the same three values
 * (`shade` | `partial_sun` | `full_sun`, see backend models.py).
 */
export const SUN_DB_TO_TILE: Record<string, string> = {
  shade: 'shade',
  partial_sun: 'indirect',
  full_sun: 'full-sun',
}

/** Reverse: map TileGrid sunRequirement IDs back to database values. */
export const SUN_TILE_TO_DB: Record<string, string> = {
  shade: 'shade',
  indirect: 'partial_sun',
  'full-sun': 'full_sun',
}

/** Map database plant type to form type. */
export const TYPE_TO_FORM: Record<string, string> = {
  boom: 'tree',
  heester: 'tree',
  gras: 'pot',
  bol: 'pot',
  vaste_plant: 'pot',
  eenjarig: 'pot',
  klimmer: 'pot',
}

// ── Prefill type guards ──

export function isIdentifyPrefill(p: unknown): p is IdentifyCommitResult {
  return !!p && typeof p === 'object' && 'name_nl_suggested' in (p as Record<string, unknown>)
}

export function isLocalPlantPrefill(p: unknown): p is LocalPlant {
  return !!p && typeof p === 'object' && 'latinName' in (p as Record<string, unknown>)
}

// ── findMatchingIcon (moved verbatim from AddPlant.tsx) ──

/** Try to find the best-matching icon for a LocalPlant in the icon catalog. */
export function findMatchingIcon(plant: LocalPlant, catalog: PlantIcon[]): string | null {
  // 1. Check if iconKey from dataset exists in catalog
  if (plant.iconKey) {
    const direct = catalog.find(i => i.id === plant.iconKey)
    if (direct) return direct.variant_of || direct.id
  }
  // 2. Match by exact Latin name
  if (plant.latinName) {
    const latin = plant.latinName.toLowerCase()
    const exact = catalog.find(i => i.sci?.toLowerCase() === latin)
    if (exact) return exact.variant_of || exact.id
  }
  // 3. Match by exact Dutch name
  if (plant.dutchName) {
    const name = plant.dutchName.toLowerCase()
    const byName = catalog.find(i => i.name?.toLowerCase() === name)
    if (byName) return byName.variant_of || byName.id
  }
  // 4. Match by genus (first word of Latin name)
  if (plant.latinName) {
    const genus = plant.latinName.split(' × ')[0].split(' ')[0].toLowerCase()
    const byGenus = catalog.find(i => i.sci?.toLowerCase().startsWith(genus) || i.id === genus)
    if (byGenus) return byGenus.variant_of || byGenus.id
  }
  return null
}

// ── Schedule helpers ──

export type ScheduleEntry = { enabled: boolean; days: number }
export type ScheduleMap = Record<CareType, ScheduleEntry>

/** Build an initial schedules map, optionally prefilled from a LocalPlant. (moved verbatim) */
export function buildInitialSchedules(prefill: unknown): ScheduleMap {
  const initial: Record<string, ScheduleEntry> = {}
  for (const [type, info] of Object.entries(CARE_TYPE_INFO)) {
    let days = info.defaultIndoor
    if (
      type === 'water' &&
      prefill &&
      !isIdentifyPrefill(prefill) &&
      'waterNeeds' in (prefill as Record<string, unknown>)
    ) {
      days = WATER_NEEDS_TO_DAYS[(prefill as LocalPlant).waterNeeds] ?? days
    }
    initial[type] = { enabled: type === 'repot_check' ? false : days > 0, days }
  }
  return initial as ScheduleMap
}

/**
 * Map a photo-ID `care_thresholds` payload to schedule overrides.
 * - `water_interval_days > 0` → water interval.
 * - `fertilise_months` non-empty → fertilize interval, mirroring the backend
 *   math in `_seed_care_schedules` (`max(30, 365 // len)`) so the in-form
 *   preview matches what the server seeds.
 * Keys the thresholds don't speak to are left to `buildInitialSchedules`.
 */
export function thresholdsToScheduleOverrides(
  thresholds: Record<string, unknown> | null | undefined,
): Partial<Record<CareType, ScheduleEntry>> {
  const overrides: Partial<Record<CareType, ScheduleEntry>> = {}
  if (!thresholds || typeof thresholds !== 'object') return overrides

  const waterInterval = thresholds['water_interval_days']
  if (typeof waterInterval === 'number' && waterInterval > 0) {
    overrides.water = { enabled: true, days: waterInterval }
  }

  const fertiliseMonths = thresholds['fertilise_months']
  if (Array.isArray(fertiliseMonths) && fertiliseMonths.length > 0) {
    overrides.fertilize = { enabled: true, days: Math.max(30, Math.floor(365 / fertiliseMonths.length)) }
  }

  return overrides
}

/** Initial schedules for a prefill, with photo-ID `care_thresholds` overlaid on top. */
export function buildSchedules(
  rawPrefill: unknown,
  careThresholds: Record<string, unknown> | null,
): ScheduleMap {
  const base = buildInitialSchedules(rawPrefill)
  const overrides = thresholdsToScheduleOverrides(careThresholds)
  return { ...base, ...overrides } as ScheduleMap
}

// ── Sun mapping ──

/**
 * Map a species ecology `sun_preference` (`full_sun` | `partial_sun` | `shade`)
 * to a Light TileGrid id. Unknown / missing → null (no sun set, rather than a
 * wrong tile).
 */
export function sunPreferenceToTile(sunPreference: string | null | undefined): string | null {
  if (!sunPreference) return null
  return SUN_DB_TO_TILE[sunPreference] ?? null
}

// ── normalizePrefill: consolidate the three-path duck-typing into one shape ──

export type PrefillKind = 'identify' | 'database' | 'manual' | 'none'

export interface NormalizedPrefill {
  kind: PrefillKind
  name: string
  species: string
  notes: string
  sunRequirement: string | null
  formType: string
  iconKeyHint: string | null
  // identify-only extras the form consumes downstream:
  speciesId: number | null
  careThresholds: Record<string, unknown> | null
  photoPath: string | null
}

export function normalizePrefill(
  prefill: LocalPlant | { name: string } | IdentifyCommitResult | null | undefined,
): NormalizedPrefill {
  if (!prefill) {
    return {
      kind: 'none', name: '', species: '', notes: '',
      sunRequirement: null, formType: 'pot', iconKeyHint: null,
      speciesId: null, careThresholds: null, photoPath: null,
    }
  }

  if (isIdentifyPrefill(prefill)) {
    return {
      kind: 'identify',
      name: prefill.name_nl_suggested,
      species: prefill.scientific_name,
      notes: '',
      sunRequirement: null, // filled lazily from the species ecology profile
      formType: 'pot',
      iconKeyHint: prefill.icon_key ?? null,
      speciesId: typeof prefill.species_id === 'number' ? prefill.species_id : null,
      careThresholds: prefill.care_thresholds ?? null,
      photoPath: prefill.photo_path ?? null,
    }
  }

  if (isLocalPlantPrefill(prefill)) {
    return {
      kind: 'database',
      name: prefill.dutchName,
      species: prefill.latinName,
      notes: prefill.amsterdamNotes ?? '',
      sunRequirement: SUN_DB_TO_TILE[prefill.sunRequirement] ?? prefill.sunRequirement ?? null,
      formType: TYPE_TO_FORM[prefill.type] ?? 'pot',
      iconKeyHint: prefill.iconKey ?? null,
      speciesId: null, careThresholds: null, photoPath: null,
    }
  }

  // manual { name } — preserve the legacy behaviour where the species field
  // defaults to the typed name (the old initializer fell back to it).
  const name = String((prefill as { name?: string }).name ?? '')
  return {
    kind: 'manual', name, species: name, notes: '',
    sunRequirement: null, formType: 'pot', iconKeyHint: null,
    speciesId: null, careThresholds: null, photoPath: null,
  }
}

// ── buildCreatePayload: extract the inline handleSubmit payload ──

export interface CreatePayloadFormState {
  name: string
  species: string
  locationId?: number
  mapId?: number
  mapX?: number
  mapY?: number
  potSizeCm?: number
  acquiredDate?: string
  notes: string
  iconKey?: string
  kind: PrefillKind
  /** LocalPlant.type, used for the database-path DUTCH_TYPE_TO_SYSTEM mapping. */
  databaseType?: string
  /** Icon-derived plant_type (already resolves from the icon `cat`). */
  derivedPlantType?: string
  sunRequirement: string | null
  phase?: PlantCreateInput['phase']
  sownDate?: string
  careSchedules: CareScheduleInput[]
}

/** Resolve plant_type: database uses the Dutch→system map; identify/manual use the icon-derived type (Task 4: omit when unresolved). */
function resolvePlantType(s: CreatePayloadFormState): string | undefined {
  if (s.kind === 'database' && s.databaseType) {
    return DUTCH_TYPE_TO_SYSTEM[s.databaseType] ?? s.databaseType
  }
  return s.derivedPlantType ?? undefined
}

export function buildCreatePayload(s: CreatePayloadFormState): PlantCreateInput {
  return {
    name: s.name.trim(),
    species: s.species.trim() || undefined,
    location_id: s.locationId,
    map_id: s.mapId,
    map_x: s.mapX,
    map_y: s.mapY,
    pot_size_cm: s.potSizeCm,
    acquired_date: s.acquiredDate,
    notes: s.notes.trim() || undefined,
    icon_key: s.iconKey,
    plant_type: resolvePlantType(s),
    sun_requirement: s.sunRequirement ? (SUN_TILE_TO_DB[s.sunRequirement] ?? s.sunRequirement) : undefined,
    phase: s.phase,
    sown_date: s.sownDate,
    care_schedules: s.careSchedules,
  }
}

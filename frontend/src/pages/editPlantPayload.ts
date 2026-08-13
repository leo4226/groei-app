import type { MapInfo, Plant } from '../types'
import { displayToIso } from '../utils/dateFormat'
import { normalizeSunRequirement } from '../utils/plantSunRequirements'

/**
 * Form types that describe a plant growing out of a pot. Everything else sits
 * in the ground, which is the only distinction the icon set can draw — there
 * are `potted` and `bare` variants and nothing finer.
 */
const BARE_FORM_TYPES = ['ground', 'seedling', 'tree']

/**
 * Which Form tile to select when the editor opens.
 *
 * The icon's actual form is authoritative on the potted/bare axis, because it
 * is the half that map placement keeps up to date: dropping a plant into a bed
 * rewrites `icon_key` (`resolve_placement_icon`) but never `form_type`.
 * Initialising the tile from the stored `form_type` alone would show "In pot"
 * for a plant that is visibly in the ground, and the icon effect would then
 * write the potted icon back on save — the potted/bare drift bug.
 *
 * Within the bare half the stored value is the better answer, though: `tree`
 * and `seedling` are both drawn bare, so re-deriving from the icon flattened
 * them to `ground` and the user's choice was lost on every reopen (#886).
 */
export function resolveFormType(
  storedFormType: string | null | undefined,
  iconIsBare: boolean,
): string {
  if (!iconIsBare) return 'pot'
  return storedFormType && BARE_FORM_TYPES.includes(storedFormType)
    ? storedFormType
    : 'ground'
}

/** A pot dimension in whole cm, or null for blank/nonsense input. */
function parseCm(value: string): number | null {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

type PlacementMap = Pick<MapInfo, 'id' | 'viewbox'>

type MapPosition = { x: number; y: number }

export interface BuildEditPlantPayloadInput {
  plant: Pick<Plant, 'map_id'>
  maps: PlacementMap[]
  selectedZoneId: string | null
  name: string
  species: string
  acquiredDateInput: string
  lastRepottedInput: string
  notes: string
  iconKey: string | null
  formType: string
  potMaterial: string
  potDiameter: string
  potHeight: string
  hasDrainage: boolean
  substrate: string[]
  acquiredFrom: string
  sunRequirement: string | null
  measuredSun: number | null
  phase: Plant['phase']
  sownDateInput: string
  quantity?: number
  mulch: boolean
  randomMapPos: (viewbox: string) => MapPosition
}

export function buildEditPlantPayload(input: BuildEditPlantPayloadInput): Partial<Plant> {
  const payload: Partial<Plant> = {
    name: input.name.trim(),
    species: input.species.trim() || null,
    acquired_date: displayToIso(input.acquiredDateInput) || null,
    last_repotted: displayToIso(input.lastRepottedInput) || null,
    notes: input.notes.trim() || null,
    icon_key: input.iconKey,
    // Written, not just used to pick the icon variant: re-deriving it from the
    // icon on reopen flattened `tree`/`seedling` back to `ground` (#886).
    form_type: input.formType,
    pot_material: input.potMaterial || null,
    pot_diameter_cm: parseCm(input.potDiameter),
    pot_height_cm: parseCm(input.potHeight),
    // pot_size_cm is the canonical container size (create_plant seeds it from
    // the diameter). Keep the two in step so an edit cannot leave a stale size
    // behind the value the user can actually see.
    pot_size_cm: parseCm(input.potDiameter),
    has_drainage: input.hasDrainage,
    substrate: input.substrate,
    acquired_from: input.acquiredFrom.trim() || null,
    sun_requirement: normalizeSunRequirement(input.sunRequirement),
    phase: input.phase,
    sown_date: displayToIso(input.sownDateInput) || null,
    // The form owns this now (#886 §4.3) — it used to have no control for it
    // and had to carry the stored value through so an edit would not wipe a
    // value it could not show.
    measured_sun_hours: input.measuredSun,
    // Mulch toggle: unknown (null) is treated as bare by the pressure engine,
    // so saving the current toggle state is always safe.
    mulch: input.mulch,
  }

  if (input.quantity != null) {
    payload.quantity = Math.max(1, input.quantity)
  }

  const selectedMapId = input.selectedZoneId ? Number(input.selectedZoneId) : null
  const existingMapId = input.plant.map_id ?? null

  if (selectedMapId !== existingMapId) {
    const placedMap = selectedMapId == null
      ? undefined
      : input.maps.find((map) => map.id === selectedMapId)

    // Do not mirror the map selection into location_id: maps and locations are
    // different tables. The Locations feature owns location_id; this form only
    // edits map placement.
    if (placedMap) {
      const mapPos = input.randomMapPos(placedMap.viewbox)
      payload.map_id = placedMap.id
      payload.map_x = mapPos.x
      payload.map_y = mapPos.y
    } else {
      payload.map_id = null
      payload.map_x = null
      payload.map_y = null
    }
  }

  return payload
}

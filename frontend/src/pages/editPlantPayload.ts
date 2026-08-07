import type { MapInfo, Plant } from '../types'
import { displayToIso } from '../utils/dateFormat'

export const SUN_DB_TO_TILE: Record<string, string> = {
  shade: 'shade',
  partial_sun: 'indirect',
  full_sun: 'full-sun',
}

export const SUN_TILE_TO_DB: Record<string, string> = {
  shade: 'shade',
  indirect: 'partial_sun',
  'full-sun': 'full_sun',
}

type PlacementMap = Pick<MapInfo, 'id' | 'viewbox'>

type MapPosition = { x: number; y: number }

export interface BuildEditPlantPayloadInput {
  plant: Pick<Plant, 'map_id' | 'measured_sun_hours'>
  maps: PlacementMap[]
  selectedZoneId: string | null
  name: string
  species: string
  acquiredDateInput: string
  lastRepottedInput: string
  notes: string
  iconKey: string | null
  sunRequirement: string | null
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
    sun_requirement: input.sunRequirement
      ? (SUN_TILE_TO_DB[input.sunRequirement] ?? input.sunRequirement)
      : null,
    phase: input.phase,
    sown_date: displayToIso(input.sownDateInput) || null,
    // The edit form has no measured-sun control (that lives in the map quick
    // sheet, #645); carry the stored value through so an edit never wipes it.
    measured_sun_hours: input.plant.measured_sun_hours ?? null,
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

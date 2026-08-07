import { describe, expect, it } from 'vitest'
import { buildEditPlantPayload } from './editPlantPayload'
import type { Plant, MapInfo } from '../types'

function plant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: 1,
    name: 'Existing name',
    species: 'Monstera deliciosa',
    species_common_name_nl: null,
    species_common_name_en: null,
    location_id: 7,
    location_name: 'Living room',
    location_icon: '🪴',
    map_id: 3,
    map_x: 12.5,
    map_y: 33.5,
    photo_path: null,
    acquired_date: '2026-01-01',
    pot_size_cm: 21,
    container_id: null,
    last_repotted: null,
    notes: 'Old notes',
    is_active: true,
    is_locked: false,
    created_at: null,
    sown_date: null,
    sun_requirement: 'partial_sun',
    measured_sun_hours: null,
    plant_type: 'grass',
    icon_key: 'monstera',
    icon_requested: false,
    phase: 'established',
    quantity: 1,
    form_type: null,
    pot_material: null,
    pot_diameter_cm: null,
    pot_height_cm: null,
    has_drainage: null,
    substrate: [],
    acquired_from: null,
    species_id: null,
    phenology: null,
    care_schedules: [],
    care_status: 'good',
    temp_status: 'comfortable',
    ...overrides,
  }
}

const maps: Pick<MapInfo, 'id' | 'viewbox'>[] = [
  { id: 3, viewbox: '0 0 100 100' },
  { id: 9, viewbox: '0 0 200 200' },
]

const baseInput = {
  plant: plant(),
  maps,
  selectedZoneId: '3',
  name: 'Renamed plant',
  species: 'Monstera deliciosa',
  acquiredDateInput: '01-01-2026',
  lastRepottedInput: '',
  notes: 'Still healthy',
  iconKey: 'monstera',
  sunRequirement: 'indirect',
  phase: 'established' as const,
  sownDateInput: '',
  randomMapPos: () => ({ x: 99, y: 88 }),
}

describe('buildEditPlantPayload', () => {
  it('omits placement, location, pot and botanical category fields when only ordinary fields change', () => {
    const payload = buildEditPlantPayload(baseInput)

    expect(payload).toMatchObject({
      name: 'Renamed plant',
      species: 'Monstera deliciosa',
      notes: 'Still healthy',
      sun_requirement: 'partial_sun',
      measured_sun_hours: null,
    })
    expect(payload).not.toHaveProperty('location_id')
    expect(payload).not.toHaveProperty('pot_size_cm')
    // The edit form's visual potted/bare choice must not overwrite the saved
    // botanical category (this plant is grass).
    expect(payload).not.toHaveProperty('plant_type')
    expect(payload).not.toHaveProperty('map_id')
    expect(payload).not.toHaveProperty('map_x')
    expect(payload).not.toHaveProperty('map_y')
  })

  it('sends a new random position only when the selected map changes', () => {
    const payload = buildEditPlantPayload({ ...baseInput, selectedZoneId: '9' })

    expect(payload).toMatchObject({
      map_id: 9,
      map_x: 99,
      map_y: 88,
    })
    expect(payload).not.toHaveProperty('location_id')
  })

  it('clears map fields when the user removes the plant from a map', () => {
    const payload = buildEditPlantPayload({ ...baseInput, selectedZoneId: null })

    expect(payload).toMatchObject({
      map_id: null,
      map_x: null,
      map_y: null,
    })
    expect(payload).not.toHaveProperty('location_id')
  })
})

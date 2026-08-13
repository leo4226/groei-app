import { describe, expect, it } from 'vitest'
import { buildEditPlantPayload, resolveFormType } from './editPlantPayload'
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
    mulch: null,
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
  formType: 'pot',
  potMaterial: 'terracotta',
  potDiameter: '18',
  potHeight: '22',
  hasDrainage: true,
  substrate: ['potgrond'],
  acquiredFrom: 'Tuincentrum',
  sunRequirement: 'partial_sun',
  phase: 'established' as const,
  sownDateInput: '',
  mulch: false,
  randomMapPos: () => ({ x: 99, y: 88 }),
}

describe('buildEditPlantPayload', () => {
  it('omits placement, location, pot and botanical category fields when only ordinary fields change', () => {
    // "pot" no longer holds: the form gained the pot fields in #886, so they
    // are sent now and the container tests below own that behaviour.
    const payload = buildEditPlantPayload(baseInput)

    expect(payload).toMatchObject({
      name: 'Renamed plant',
      species: 'Monstera deliciosa',
      notes: 'Still healthy',
      sun_requirement: 'partial_sun',
      measured_sun_hours: null,
    })
    expect(payload).not.toHaveProperty('location_id')
    // pot_size_cm used to be asserted absent here, which pinned the gap rather
    // than a rule: the form had no pot fields at all, so there was nothing to
    // send. It does now, and the dedicated container tests below cover it.
    //
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

// ── #886 P2-1: the Form tile round-trip ─────────────────────────────────────
//
// formType used to be display-only: it picked the potted/bare icon variant and
// was never sent. On reopen it was re-derived from the icon, which can only be
// potted or bare — so "Boomvorm" came back as "In de grond" and the user's
// choice was quietly lost on every save.

describe('resolveFormType', () => {
  it('keeps the finer bare forms the icon cannot express', () => {
    expect(resolveFormType('tree', true)).toBe('tree')
    expect(resolveFormType('seedling', true)).toBe('seedling')
    expect(resolveFormType('ground', true)).toBe('ground')
  })

  it('lets the icon win on the potted/bare axis', () => {
    // The drift bug: map placement rewrites icon_key but never form_type, so a
    // plant dropped into a bed is bare while form_type still says pot. Showing
    // "In pot" there would write the potted icon back on the next save.
    expect(resolveFormType('pot', true)).toBe('ground')
    expect(resolveFormType('tree', false)).toBe('pot')
  })

  it('falls back cleanly when nothing is stored', () => {
    // Plants created before form_type existed, or placed from the map.
    expect(resolveFormType(null, true)).toBe('ground')
    expect(resolveFormType(undefined, false)).toBe('pot')
    expect(resolveFormType('nonsense', true)).toBe('ground')
  })
})

describe('buildEditPlantPayload form_type', () => {
  it('persists the selected form so it survives a reopen', () => {
    const payload = buildEditPlantPayload({ ...baseInput, formType: 'tree' })
    expect(payload.form_type).toBe('tree')
  })
})

// ── #886 §2.3: container + provenance detail must be correctable ────────────
//
// Add Plant has collected all of this since #823 and PlantUpdate accepts it,
// but the edit payload sent none of it — write-once data with no correction
// path. Repotting is one of the few genuinely recurring plant events, and the
// only pot field the form offered was the date you did it.

describe('buildEditPlantPayload container + provenance', () => {
  it('sends the pot detail the form now collects', () => {
    const payload = buildEditPlantPayload(baseInput)

    expect(payload).toMatchObject({
      pot_material: 'terracotta',
      pot_diameter_cm: 18,
      pot_height_cm: 22,
      has_drainage: true,
      substrate: ['potgrond'],
      acquired_from: 'Tuincentrum',
    })
  })

  it('keeps pot_size_cm in step with the diameter the user can see', () => {
    // create_plant seeds pot_size_cm from the diameter; letting an edit change
    // one and not the other would leave a stale canonical size behind.
    const payload = buildEditPlantPayload({ ...baseInput, potDiameter: '24' })
    expect(payload.pot_size_cm).toBe(24)
    expect(payload.pot_diameter_cm).toBe(24)
  })

  it('treats blank and nonsense dimensions as unset rather than 0 or NaN', () => {
    const payload = buildEditPlantPayload({
      ...baseInput, potDiameter: '', potHeight: 'abc',
    })
    expect(payload.pot_diameter_cm).toBeNull()
    expect(payload.pot_size_cm).toBeNull()
    expect(payload.pot_height_cm).toBeNull()
  })

  it('clears a blanked provenance instead of writing an empty string', () => {
    const payload = buildEditPlantPayload({ ...baseInput, acquiredFrom: '   ' })
    expect(payload.acquired_from).toBeNull()
  })
})

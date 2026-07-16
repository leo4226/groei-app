import { describe, it, expect } from 'vitest'
import { selectUnplacedPlants, viewboxCenter } from '../unplacedPlants'
import type { Plant } from '../../../types'

function plant(over: Partial<Plant>): Plant {
  return {
    id: 1, name: 'P', species: null, species_common_name_nl: null,
    species_common_name_en: null, location_id: null, location_name: null,
    location_icon: null, map_id: null, map_x: null, map_y: null, photo_path: null,
    acquired_date: null, pot_size_cm: null, container_id: null, last_repotted: null,
    notes: null, is_active: true, is_locked: false, created_at: null, sown_date: null,
    sun_requirement: null,
    measured_sun_hours: null, plant_type: null, icon_key: null, icon_requested: false,
    phase: 'established', quantity: 1, species_id: null, phenology: null, care_schedules: [],
    care_status: 'good', temp_status: 'comfortable',
    ...over,
  }
}

describe('selectUnplacedPlants', () => {
  it('keeps active plants with no map_id', () => {
    const result = selectUnplacedPlants([plant({ id: 1, map_id: null })])
    expect(result.map((p) => p.id)).toEqual([1])
  })
  it('drops plants already placed on a map', () => {
    expect(selectUnplacedPlants([plant({ id: 2, map_id: 5 })])).toEqual([])
  })
  it('drops inactive (archived) plants', () => {
    expect(selectUnplacedPlants([plant({ id: 3, map_id: null, is_active: false })])).toEqual([])
  })
})

describe('viewboxCenter', () => {
  it('returns the integer centre of "x y w h"', () => {
    expect(viewboxCenter('0 0 100 50')).toEqual({ x: 50, y: 25 })
  })
  it('handles a non-zero origin', () => {
    expect(viewboxCenter('10 20 100 100')).toEqual({ x: 60, y: 70 })
  })
  it('falls back to {0,0} on malformed input', () => {
    expect(viewboxCenter('garbage')).toEqual({ x: 0, y: 0 })
  })
})

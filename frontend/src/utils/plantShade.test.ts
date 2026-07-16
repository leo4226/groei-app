import { describe, it, expect } from 'vitest'
import type { MapPlant } from '../types'
import { derivePlantShadowCasters, plantCanopyRadiusCm, PLANT_SHADE_MIN_HEIGHT_CM } from './plantShade'

function mapPlant(overrides: Partial<MapPlant> = {}): MapPlant {
  return {
    id: 1,
    name: 'Plant',
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: 100,
    map_y: 100,
    photo_path: null,
    container_id: null,
    ground_zone_id: null,
    display_radius_cm: null,
    care_status: 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: 'full_sun',
    measured_sun_hours: null,
    plant_type: 'shrub',
    icon_key: null,
    species_id: null,
    phenology: null,
    is_locked: false,
    quantity: 1,
    top_alert: null,
    alerts: [],
    top_warning: null,
    warnings: [],
    ...overrides,
  }
}

function withHeight(id: number, heightCm: number, extra: Partial<MapPlant> = {}): MapPlant {
  return mapPlant({ id, phenology: { max_height_cm: heightCm } as MapPlant['phenology'], ...extra })
}

describe('plantCanopyRadiusCm', () => {
  it('uses half the known spread when available', () => {
    const p = mapPlant({ phenology: { max_spread_cm: 200 } as MapPlant['phenology'] })
    expect(plantCanopyRadiusCm(p, 300)).toBe(100)
  })

  it('falls back to a growth-form fraction of height when spread is unknown', () => {
    const tree = mapPlant({ plant_type: 'tree', phenology: null })
    expect(plantCanopyRadiusCm(tree, 400)).toBeCloseTo(400 * 0.35, 5)
  })
})

describe('derivePlantShadowCasters', () => {
  const opts = { scalePxPerM: 46 }

  it('emits a circle caster only for plants above the height threshold', () => {
    const plants = [
      withHeight(1, PLANT_SHADE_MIN_HEIGHT_CM + 30),
      withHeight(2, 40),   // too short
    ]
    const casters = derivePlantShadowCasters(plants, opts)
    expect(casters).toHaveLength(1)
    const [c] = casters
    expect(c.type).toBe('circle')
    expect(c.id).toBe('plant-shade-1')
    expect(c.heightCm).toBe(PLANT_SHADE_MIN_HEIGHT_CM + 30)
    if (c.type === 'circle') {
      expect(c.cx).toBe(100)
      expect(c.cy).toBe(100)
      expect(c.excludeSelf).toBe(true)
      expect(c.radius).toBeGreaterThan(0)
    }
  })

  it('skips plants with a measured-sun override (#645 wins)', () => {
    const plants = [withHeight(1, 200, { measured_sun_hours: 5 })]
    expect(derivePlantShadowCasters(plants, opts)).toEqual([])
  })

  it('skips plants without a position', () => {
    const plants = [withHeight(1, 200, { map_x: null as unknown as number, map_y: null as unknown as number })]
    expect(derivePlantShadowCasters(plants, opts)).toEqual([])
  })

  it('caps the number of casters, keeping the tallest', () => {
    const plants = Array.from({ length: 10 }, (_, i) => withHeight(i + 1, 130 + i * 10))
    const casters = derivePlantShadowCasters(plants, { ...opts, maxCasters: 3 })
    expect(casters).toHaveLength(3)
    // Tallest three are ids 10, 9, 8.
    expect(casters.map((c) => c.id)).toEqual(['plant-shade-10', 'plant-shade-9', 'plant-shade-8'])
  })
})

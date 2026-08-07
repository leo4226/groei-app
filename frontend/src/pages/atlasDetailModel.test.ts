import { describe, expect, it } from 'vitest'
import {
  publicGardenToMapDetail,
  publicPlantToMapPlant,
  publicGardenViewBox,
} from './atlasDetailModel'
import type { PublicGardenDetail } from '../types'

const GARDEN: PublicGardenDetail = {
  slug: 'demo-tuin',
  name: 'Demo tuin',
  city: 'Amsterdam',
  country_code: 'nl',
  approx_lat: 52.37,
  approx_lon: 4.89,
  biodiversity_score: 42,
  species_count: 3,
  plant_count: 4,
  flower_months: [6, 7, 8],
  streek_slug: 'amsterdam',
  streek_name: 'Amsterdam',
  thumbnail_file: null,
  viewbox: '0 0 680 680',
  canvas_data: JSON.stringify({
    zones: [
      { id: 'lawn', type: 'lawn', shape: 'rect', x: 10, y: 10, width: 300, height: 200, label: 'Gazon' },
    ],
    canvas_w: 680,
    canvas_h: 680,
    scale_px_per_m: 46,
  }),
  zones: [],
  ground_zones: [],
  plants: [
    {
      id: 1,
      name: 'Mint',
      latin_name: 'Mentha',
      species_common_name_nl: null,
      species_common_name_en: null,
      map_x: 50,
      map_y: 60,
      display_radius_cm: 30,
      plant_type: 'herb',
      icon_key: 'mint',
      photo_path: null,
    },
  ],
}

describe('atlasDetailModel', () => {
  describe('publicGardenToMapDetail', () => {
    it('builds a MapDetail-shaped object with neutral care fields', () => {
      const map = publicGardenToMapDetail(GARDEN)
      expect(map.name).toBe('Demo tuin')
      expect(map.slug).toBe('demo-tuin')
      expect(map.map_type).toBe('outdoor')
      expect(map.canvas_data).toBe(GARDEN.canvas_data)
      expect(map.lat).toBe(52.37)
      expect(map.bearing).toBe(0)
    })
  })

  describe('publicPlantToMapPlant', () => {
    it('prefers the latin name for the map label (scientific names, #804)', () => {
      const p = publicPlantToMapPlant(GARDEN.plants[0])
      expect(p.name).toBe('Mentha')
      expect(p.species).toBe('Mentha')
      expect(p.care_status).toBe('good')
      expect(p.is_locked).toBe(false)
    })

    it('falls back to the owner name when no latin name exists', () => {
      const p = publicPlantToMapPlant({ ...GARDEN.plants[0], latin_name: null })
      expect(p.name).toBe('Mint')
    })
  })

  describe('publicGardenViewBox', () => {
    it('derives a tight viewbox around the zones', () => {
      const vb = publicGardenViewBox(GARDEN)
      const parts = vb.split(/\s+/).map(Number)
      expect(parts).toHaveLength(4)
      expect(parts[2]).toBeLessThan(680)
    })

    it('falls back to the stored viewbox when canvas_data is absent', () => {
      const vb = publicGardenViewBox({ ...GARDEN, canvas_data: null })
      expect(vb).toBe('0 0 680 680')
    })
  })
})

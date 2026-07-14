import { describe, expect, it } from 'vitest'
import {
  containedPlantLayout,
  objectShapeBound,
  topLevelPlantIconRadius,
} from '../plantMarkerGeometry'

describe('topLevelPlantIconRadius', () => {
  it('uses the default rendered radius when no display radius is set', () => {
    expect(topLevelPlantIconRadius({ display_radius_cm: null, is_locked: false })).toBe(11.9)
  })

  it('caps the rendered radius for locked plants', () => {
    expect(topLevelPlantIconRadius({ display_radius_cm: 100, is_locked: true })).toBe(28)
  })
})

describe('objectShapeBound', () => {
  it('uses the rendered radius for circles', () => {
    expect(objectShapeBound({ shape: 'circle', diameter_cm: 100, width_cm: null, depth_cm: null })).toBe(23)
  })

  it('uses half the rendered depth for rectangles', () => {
    expect(objectShapeBound({ shape: 'rectangle', diameter_cm: null, width_cm: 100, depth_cm: 40 })).toBeCloseTo(9.2)
  })
})

describe('containedPlantLayout', () => {
  it('lays out two contained plants with their rendered radii', () => {
    expect(containedPlantLayout(2, 20, 'circle')).toEqual([
      { x: -5.5, y: 0, radius: 8.333333333333334 },
      { x: 5.5, y: 0, radius: 8.333333333333334 },
    ])
  })
})

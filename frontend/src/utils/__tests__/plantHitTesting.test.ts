import { describe, expect, it } from 'vitest'
import type { FixedPlant } from '../../constants/fixedPlants'
import type { MapObject, MapPlant, SecondaryMarker } from '../../types'
import {
  buildPlantHitCandidates,
  projectPlantHitCandidates,
  resolvePlantHit,
  type PlantHitCandidate,
  type ScreenPlantHitCandidate,
} from '../plantHitTesting'

function plant(id: number, overrides: Partial<MapPlant> = {}): MapPlant {
  return {
    id,
    name: `Plant ${id}`,
    species: null,
    species_common_name_nl: null,
    species_common_name_en: null,
    map_x: id * 10,
    map_y: id * 5,
    photo_path: null,
    container_id: null,
    ground_zone_id: null,
    display_radius_cm: null,
    care_status: 'good',
    temp_status: 'comfortable',
    most_urgent: null,
    sun_requirement: null,
    plant_type: null,
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

function object(id: number, containedPlants: MapPlant[], overrides: Partial<MapObject> = {}): MapObject {
  return {
    id,
    name: `Container ${id}`,
    object_type: 'planter',
    shape: 'circle',
    diameter_cm: 100,
    width_cm: null,
    depth_cm: null,
    material: 'terracotta',
    color: null,
    map_id: 1,
    map_x: 100,
    map_y: 200,
    rotation: 0,
    notes: null,
    is_active: true,
    created_at: null,
    updated_at: null,
    contained_plants: containedPlants,
    category: 'container',
    label: null,
    preset: null,
    ...overrides,
  }
}

function secondary(id: number, plantId: number, overrides: Partial<SecondaryMarker> = {}): SecondaryMarker {
  return {
    id,
    plant_id: plantId,
    map_x: 300,
    map_y: 400,
    ground_zone_id: null,
    phase: null,
    name: `Secondary ${id}`,
    icon_key: null,
    ...overrides,
  }
}

const fixedOak: FixedPlant = {
  id: 'oak',
  name: 'Oak',
  x: 500,
  y: 600,
  displayRadiusCm: 40,
  markerColor: '#345612',
}

describe('buildPlantHitCandidates', () => {
  it('builds every visible marker kind in deterministic category order', () => {
    const result = buildPlantHitCandidates({
      plants: [
        plant(1, { icon_key: 'herb', species_common_name_en: 'Basil' }),
        plant(9, { is_locked: true }),
      ],
      objects: [object(10, [plant(2, { container_id: 10 })])],
      secondaryMarkers: [secondary(30, 1, { icon_key: 'sprout' })],
      fixedPlants: [fixedOak],
      dragPositions: { 'plant-1': { x: 21, y: 31 } },
      locale: 'en',
    })

    expect(result.map((candidate) => candidate.key)).toEqual([
      'plant-1',
      'plant-9',
      'contained-2-in-10',
      'secondary-30',
      'fixed-oak',
    ])
    expect(result[0]).toMatchObject({
      kind: 'plant',
      x: 21,
      y: 31,
      movable: true,
      plantId: 1,
      label: 'Basil',
      iconKey: 'herb',
    })
    expect(result.find((candidate) => candidate.key === 'plant-9')).toMatchObject({
      kind: 'plant',
      movable: false,
      plantId: 9,
    })
    expect(result.find((candidate) => candidate.key === 'secondary-30')).toMatchObject({
      kind: 'secondary',
      movable: false,
      plantId: 1,
      label: 'Secondary 30',
      iconKey: 'sprout',
    })
    expect(result.find((candidate) => candidate.key === 'fixed-oak')).toMatchObject({
      kind: 'fixed',
      movable: false,
      plantId: null,
      label: 'Oak',
      iconKey: null,
    })
  })

  it('rotates shared contained-marker layout around the displayed container position', () => {
    const containedPlants = [
      plant(2, { container_id: 10 }),
      plant(3, { container_id: 10 }),
    ]

    const result = buildPlantHitCandidates({
      plants: [],
      objects: [object(10, containedPlants, { rotation: 90 })],
      secondaryMarkers: [],
      fixedPlants: [],
      dragPositions: { 'container-10': { x: 120, y: 220 } },
      locale: 'nl',
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      key: 'contained-2-in-10',
      kind: 'contained',
      x: 120,
      y: 213.675,
      radius: 9.583333333333334,
      movable: false,
      plantId: 2,
    })
    expect(result[1]).toMatchObject({
      key: 'contained-3-in-10',
      x: 120,
      y: 226.325,
    })
  })

  it('keeps primary and secondary instances of one plant separate', () => {
    const result = buildPlantHitCandidates({
      plants: [plant(7)],
      objects: [],
      secondaryMarkers: [secondary(41, 7)],
      fixedPlants: [],
      dragPositions: {},
      locale: 'nl',
    })

    expect(result.map((candidate) => candidate.key)).toEqual(['plant-7', 'secondary-41'])
    expect(result.map((candidate) => candidate.plantId)).toEqual([7, 7])
  })
})

function candidate(key: string, x: number, y: number, radius = 10): PlantHitCandidate {
  const payload = plant(Number(key.replace(/\D/g, '')) || 1)
  return {
    key,
    kind: 'plant',
    x,
    y,
    radius,
    movable: true,
    plantId: payload.id,
    label: payload.name,
    iconKey: payload.icon_key,
    payload,
  }
}

function screenCandidate(key: string, x: number, y: number, radius = 10): ScreenPlantHitCandidate {
  return candidate(key, x, y, radius)
}

describe('projectPlantHitCandidates', () => {
  it('projects centres through CTM scale and translation', () => {
    const source = candidate('plant-1', 10, 10, 7)

    const result = projectPlantHitCandidates(
      [source],
      { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 },
    )

    expect(result[0]).toMatchObject({
      key: 'plant-1',
      x: 30,
      y: 40,
      radius: 14,
      payload: source.payload,
    })
    expect(source).toMatchObject({ x: 10, y: 10, radius: 7 })
  })

  it('projects centres and radii through a rotated CTM', () => {
    const result = projectPlantHitCandidates(
      [candidate('plant-2', 3, 4, 5)],
      { a: 0, b: 2, c: -2, d: 0, e: 20, f: 10 },
    )

    expect(result[0]).toMatchObject({ x: 12, y: 16, radius: 10 })
  })

  it('uses the mean transformed basis magnitude for radius scaling', () => {
    const result = projectPlantHitCandidates(
      [candidate('plant-3', 0, 0, 4)],
      { a: 3, b: 4, c: 0, d: 2, e: 0, f: 0 },
    )

    expect(result[0].radius).toBe(14)
  })
})

describe('resolvePlantHit', () => {
  it('returns none when no candidate is within the pointer target', () => {
    expect(resolvePlantHit(
      { x: 100, y: 100 },
      [screenCandidate('plant-1', 0, 0)],
      'mouse',
    )).toEqual({ type: 'none' })
  })

  it('adds six CSS pixels to the rendered mouse radius', () => {
    const candidates = [screenCandidate('plant-1', 0, 0, 15)]

    expect(resolvePlantHit({ x: 21, y: 0 }, candidates, 'mouse').type).toBe('selected')
    expect(resolvePlantHit({ x: 21.01, y: 0 }, candidates, 'mouse')).toEqual({ type: 'none' })
  })

  it('uses a 24 CSS pixel minimum radius for touch and pen', () => {
    const candidates = [screenCandidate('plant-1', 0, 0, 6)]

    expect(resolvePlantHit({ x: 23, y: 0 }, candidates, 'mouse')).toEqual({ type: 'none' })
    expect(resolvePlantHit({ x: 23, y: 0 }, candidates, 'touch').type).toBe('selected')
    expect(resolvePlantHit({ x: 23, y: 0 }, candidates, 'pen').type).toBe('selected')
  })

  it('selects the clear nearest centre independent of candidate order', () => {
    const nearest = screenCandidate('plant-z', 10, 0, 30)
    const farther = screenCandidate('plant-a', 30, 0, 30)

    for (const candidates of [[farther, nearest], [nearest, farther]]) {
      expect(resolvePlantHit({ x: 11, y: 0 }, candidates, 'mouse')).toMatchObject({
        type: 'selected',
        candidate: { key: 'plant-z' },
      })
    }
  })

  it('returns mouse candidates within the inclusive eight-pixel ambiguity delta', () => {
    const result = resolvePlantHit(
      { x: 0, y: 0 },
      [
        screenCandidate('plant-z', 8, 0, 30),
        screenCandidate('plant-a', 0, 0, 30),
        screenCandidate('plant-far', 20, 0, 30),
      ],
      'mouse',
    )

    expect(result.type).toBe('ambiguous')
    if (result.type !== 'ambiguous') throw new Error('expected ambiguous result')
    expect(result.candidates.map((item) => item.key)).toEqual(['plant-a', 'plant-z'])
  })

  it('selects when mouse scores differ by more than eight pixels', () => {
    expect(resolvePlantHit(
      { x: 0, y: 0 },
      [screenCandidate('plant-2', 8.01, 0, 30), screenCandidate('plant-1', 0, 0, 30)],
      'mouse',
    )).toMatchObject({ type: 'selected', candidate: { key: 'plant-1' } })
  })

  it('uses the inclusive twelve-pixel ambiguity delta for touch and pen', () => {
    const candidates = [
      screenCandidate('plant-2', 12, 0, 30),
      screenCandidate('plant-1', 0, 0, 30),
    ]

    expect(resolvePlantHit({ x: 0, y: 0 }, candidates, 'touch').type).toBe('ambiguous')
    expect(resolvePlantHit({ x: 0, y: 0 }, candidates, 'pen').type).toBe('ambiguous')
    expect(resolvePlantHit(
      { x: 0, y: 0 },
      [screenCandidate('plant-2', 12.01, 0, 30), candidates[1]],
      'touch',
    ).type).toBe('selected')
  })

  it('uses the candidate key to order equal-distance ambiguous hits', () => {
    const result = resolvePlantHit(
      { x: 0, y: 0 },
      [screenCandidate('plant-z', 0, 0), screenCandidate('plant-a', 0, 0)],
      'touch',
    )

    expect(result.type).toBe('ambiguous')
    if (result.type !== 'ambiguous') throw new Error('expected ambiguous result')
    expect(result.candidates.map((item) => item.key)).toEqual(['plant-a', 'plant-z'])
  })

  it('does not consider a close-scoring candidate outside its own hit radius', () => {
    expect(resolvePlantHit(
      { x: 0, y: 0 },
      [screenCandidate('plant-1', 0, 0), screenCandidate('plant-2', 17, 0, 10)],
      'mouse',
    )).toMatchObject({ type: 'selected', candidate: { key: 'plant-1' } })
  })
})

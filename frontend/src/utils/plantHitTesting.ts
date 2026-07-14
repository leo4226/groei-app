import type { FixedPlant } from '../constants/fixedPlants'
import type { MapObject, MapPlant, SecondaryMarker } from '../types'
import { containedPlantLayout, objectShapeBound, topLevelPlantIconRadius } from '../components/map/plantMarkerGeometry'
import { resolveDisplayedDragPosition } from '../components/map/plantDragPermissions'
import { PX_PER_CM } from './gardenStructures'
import { plantDisplayName } from './plantDisplayName'

export type PlantHitKind = 'plant' | 'contained' | 'secondary' | 'fixed'

type PlantHitCandidateBase = {
  key: string
  kind: PlantHitKind
  x: number
  y: number
  radius: number
  movable: boolean
  plantId: number | null
  label: string
  iconKey: string | null
}

export type PlantHitCandidate =
  | (PlantHitCandidateBase & { kind: 'plant'; payload: MapPlant })
  | (PlantHitCandidateBase & { kind: 'contained'; payload: MapPlant })
  | (PlantHitCandidateBase & { kind: 'secondary'; payload: SecondaryMarker })
  | (PlantHitCandidateBase & { kind: 'fixed'; payload: FixedPlant })

export interface PlantHitCandidateInput {
  plants: readonly MapPlant[]
  objects: readonly MapObject[]
  secondaryMarkers: readonly SecondaryMarker[]
  fixedPlants: readonly FixedPlant[]
  dragPositions: Readonly<Record<string, { x: number; y: number }>>
  locale: string
}

export interface PlantHitTransformMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export type ScreenPlantHitCandidate = PlantHitCandidate

export type PlantPointerType = 'mouse' | 'touch' | 'pen'

export type PlantHitResult =
  | { type: 'none' }
  | { type: 'selected'; candidate: ScreenPlantHitCandidate }
  | { type: 'ambiguous'; candidates: ScreenPlantHitCandidate[] }

const SECONDARY_MARKER_RADIUS = 9

export function buildPlantHitCandidates(input: PlantHitCandidateInput): PlantHitCandidate[] {
  const candidates: PlantHitCandidate[] = []

  for (const plant of input.plants) {
    const key = `plant-${plant.id}`
    const position = resolveDisplayedDragPosition(
      key,
      input.dragPositions,
      { x: plant.map_x, y: plant.map_y },
    )
    candidates.push({
      key,
      kind: 'plant',
      x: position.x,
      y: position.y,
      radius: topLevelPlantIconRadius(plant),
      movable: !plant.is_locked,
      plantId: plant.id,
      label: plantDisplayName(plant, input.locale),
      iconKey: plant.icon_key,
      payload: plant,
    })
  }

  for (const object of input.objects) {
    const plants = object.contained_plants ?? []
    if (plants.length === 0) continue

    const position = resolveDisplayedDragPosition(
      `container-${object.id}`,
      input.dragPositions,
      { x: object.map_x ?? 0, y: object.map_y ?? 0 },
    )
    const layout = containedPlantLayout(
      plants.length,
      objectShapeBound(object),
      object.shape,
    )
    const radians = (object.rotation ?? 0) * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)

    for (let index = 0; index < plants.length; index += 1) {
      const plant = plants[index]
      const local = layout[index]
      candidates.push({
        key: `contained-${plant.id}-in-${object.id}`,
        kind: 'contained',
        x: position.x + local.x * cos - local.y * sin,
        y: position.y + local.x * sin + local.y * cos,
        radius: local.radius,
        movable: false,
        plantId: plant.id,
        label: plantDisplayName(plant, input.locale),
        iconKey: plant.icon_key,
        payload: plant,
      })
    }
  }

  for (const marker of input.secondaryMarkers) {
    candidates.push({
      key: `secondary-${marker.id}`,
      kind: 'secondary',
      x: marker.map_x,
      y: marker.map_y,
      radius: SECONDARY_MARKER_RADIUS,
      movable: false,
      plantId: marker.plant_id,
      label: marker.name,
      iconKey: marker.icon_key,
      payload: marker,
    })
  }

  for (const plant of input.fixedPlants) {
    candidates.push({
      key: `fixed-${plant.id}`,
      kind: 'fixed',
      x: plant.x,
      y: plant.y,
      radius: plant.displayRadiusCm * PX_PER_CM,
      movable: false,
      plantId: null,
      label: plant.name,
      iconKey: null,
      payload: plant,
    })
  }

  return candidates
}

export function projectPlantHitCandidates(
  candidates: readonly PlantHitCandidate[],
  matrix: PlantHitTransformMatrix,
): ScreenPlantHitCandidate[] {
  const xScale = Math.hypot(matrix.a, matrix.b)
  const yScale = Math.hypot(matrix.c, matrix.d)
  const radiusScale = (xScale + yScale) / 2

  return candidates.map((candidate): ScreenPlantHitCandidate => ({
    ...candidate,
    x: matrix.a * candidate.x + matrix.c * candidate.y + matrix.e,
    y: matrix.b * candidate.x + matrix.d * candidate.y + matrix.f,
    radius: candidate.radius * radiusScale,
  }))
}

export function resolvePlantHit(
  point: { x: number; y: number },
  candidates: readonly ScreenPlantHitCandidate[],
  pointerType: PlantPointerType,
): PlantHitResult {
  const isMouse = pointerType === 'mouse'
  const ambiguityDelta = isMouse ? 8 : 12
  const scored = candidates
    .map((candidate) => ({
      candidate,
      distance: Math.hypot(candidate.x - point.x, candidate.y - point.y),
    }))
    .filter(({ candidate, distance }) => {
      const effectiveRadius = isMouse
        ? candidate.radius + 6
        : Math.max(candidate.radius, 24)
      return distance <= effectiveRadius
    })
    .sort((left, right) => {
      const distanceDifference = left.distance - right.distance
      if (distanceDifference !== 0) return distanceDifference
      if (left.candidate.key < right.candidate.key) return -1
      if (left.candidate.key > right.candidate.key) return 1
      return 0
    })

  if (scored.length === 0) return { type: 'none' }

  const nearest = scored[0]
  if (scored.length > 1 && scored[1].distance - nearest.distance <= ambiguityDelta) {
    return {
      type: 'ambiguous',
      candidates: scored
        .filter(({ distance }) => distance - nearest.distance <= ambiguityDelta)
        .map(({ candidate }) => candidate),
    }
  }

  return { type: 'selected', candidate: nearest.candidate }
}

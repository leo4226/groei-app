import type { PlantHitCandidate } from '../../utils/plantHitTesting'

export function filterMovablePlantHitCandidates<T extends PlantHitCandidate>(
  candidates: readonly T[],
  movePlantId: number | null,
): T[] {
  return candidates.filter((candidate) => (
    candidate.kind === 'plant'
    && candidate.movable
    && (movePlantId === null || candidate.plantId === movePlantId)
  ))
}

export function resolveMovablePlantHit(
  resultCandidates: readonly PlantHitCandidate[],
  movePlantId: number | null,
): PlantHitCandidate | null {
  return filterMovablePlantHitCandidates(resultCandidates, movePlantId)[0] ?? null
}

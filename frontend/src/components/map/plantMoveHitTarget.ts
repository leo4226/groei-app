import type { PlantHitCandidate } from '../../utils/plantHitTesting'

const handledMovePointerEvents = new WeakSet<Event>()

export function markMovePointerEventHandled(event: Event): void {
  handledMovePointerEvents.add(event)
}

export function isMovePointerEventHandled(event: Event): boolean {
  return handledMovePointerEvents.has(event)
}

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

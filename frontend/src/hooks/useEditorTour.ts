import { useState, useCallback } from 'react'
import type { Translations } from '../i18n/translations'
import { useIsTouch } from './useIsTouch'

export interface TourStep {
  id: string
  title: string
  body: string
  tourTargetId?: string
  action?: 'settings'
}

export interface UseEditorTourReturn {
  isActive: boolean
  currentStep: number
  steps: TourStep[]
  start: () => void
  next: () => void
  skip: () => void
}

/** Steps that name a control carry two wordings. The sidebar the pointer copy
 *  points at does not exist on a phone — there the same control is a button in
 *  the bottom dock — so the first instruction a new mobile user read described
 *  furniture that was not on screen. */
function copy(step: { title: string; body: string; bodyTouch?: string }, isTouch: boolean) {
  return { title: step.title, body: (isTouch && step.bodyTouch) || step.body }
}

export function buildSteps(
  mapType: 'outdoor' | 'indoor',
  tour: Translations['editor']['tour'],
  isTouch: boolean,
): TourStep[] {
  if (mapType === 'indoor') {
    return [
      { id: 'indoor-1', ...copy(tour.indoor.step1, isTouch) },
      { id: 'indoor-2', ...copy(tour.indoor.step2, isTouch), tourTargetId: 'tool-draw' },
      { id: 'indoor-3', ...copy(tour.indoor.step3, isTouch), tourTargetId: 'tool-place-door' },
    ]
  }
  return [
    { id: 'outdoor-1', ...copy(tour.outdoor.step1, isTouch) },
    { id: 'outdoor-2', ...copy(tour.outdoor.step2, isTouch), tourTargetId: 'tool-draw' },
    { id: 'outdoor-3', ...copy(tour.outdoor.step3, isTouch), tourTargetId: 'tool-shadow-caster' },
    { id: 'outdoor-4', ...copy(tour.outdoor.step4, isTouch), action: 'settings' },
  ]
}

function storageKey(mapId: number) {
  return `floreren_editor_tour_seen_${mapId}`
}

export function hasTourBeenSeen(mapId: number): boolean {
  return !!localStorage.getItem(storageKey(mapId))
}

/** Mark the intro as seen without launching the tour — used when the first-run
 *  wizard (#646) already served as the introduction for a new map. */
export function markTourSeen(mapId: number): void {
  localStorage.setItem(storageKey(mapId), '1')
}

export function useEditorTour(
  mapId: number | null,
  mapType: 'outdoor' | 'indoor',
  tour: Translations['editor']['tour'],
): UseEditorTourReturn {
  const isTouch = useIsTouch()
  const steps = buildSteps(mapType, tour, isTouch)
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const start = useCallback(() => {
    setCurrentStep(0)
    setIsActive(true)
    if (mapId !== null) localStorage.setItem(storageKey(mapId), '1')
  }, [mapId])

  const skip = useCallback(() => {
    setIsActive(false)
    if (mapId !== null) localStorage.setItem(storageKey(mapId), '1')
  }, [mapId])

  const next = useCallback(() => {
    setCurrentStep((s) => {
      if (s >= steps.length - 1) {
        setIsActive(false)
        return s
      }
      return s + 1
    })
  }, [steps.length])

  return { isActive, currentStep, steps, start, next, skip }
}

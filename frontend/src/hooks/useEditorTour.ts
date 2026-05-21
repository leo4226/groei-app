import { useState, useCallback } from 'react'
import type { Translations } from '../i18n/translations'

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

function buildSteps(
  mapType: 'outdoor' | 'indoor',
  tour: Translations['editor']['tour'],
): TourStep[] {
  if (mapType === 'indoor') {
    return [
      { id: 'indoor-1', ...tour.indoor.step1 },
      { id: 'indoor-2', ...tour.indoor.step2, tourTargetId: 'tool-draw' },
      { id: 'indoor-3', ...tour.indoor.step3, tourTargetId: 'tool-place-door' },
    ]
  }
  return [
    { id: 'outdoor-1', ...tour.outdoor.step1 },
    { id: 'outdoor-2', ...tour.outdoor.step2, tourTargetId: 'tool-draw' },
    { id: 'outdoor-3', ...tour.outdoor.step3, tourTargetId: 'tool-shadow-caster' },
    { id: 'outdoor-4', ...tour.outdoor.step4, action: 'settings' },
  ]
}

function storageKey(mapId: number) {
  return `floreren_editor_tour_seen_${mapId}`
}

export function hasTourBeenSeen(mapId: number): boolean {
  return !!localStorage.getItem(storageKey(mapId))
}

export function useEditorTour(
  mapId: number | null,
  mapType: 'outdoor' | 'indoor',
  tour: Translations['editor']['tour'],
): UseEditorTourReturn {
  const steps = buildSteps(mapType, tour)
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

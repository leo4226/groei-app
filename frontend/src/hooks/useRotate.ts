import { useRef, useState, useCallback } from 'react'

export function useRotate() {
  const [currentRotation, setCurrentRotation] = useState<number | null>(null)
  const stateRef = useRef<{ initialAngle: number; initialRotation: number } | null>(null)

  const startRotate = useCallback((
    center: { x: number; y: number },
    initialRotation: number,
    pointerSVG: { x: number; y: number },
  ) => {
    const initialAngle = Math.atan2(pointerSVG.y - center.y, pointerSVG.x - center.x) * 180 / Math.PI
    stateRef.current = { initialAngle, initialRotation }
    setCurrentRotation(initialRotation)
  }, [])

  const updateRotate = useCallback((
    center: { x: number; y: number },
    pointerSVG: { x: number; y: number },
  ) => {
    const state = stateRef.current
    if (!state) return
    const currentAngle = Math.atan2(pointerSVG.y - center.y, pointerSVG.x - center.x) * 180 / Math.PI
    const delta = currentAngle - state.initialAngle
    const raw = ((state.initialRotation + delta) % 360 + 360) % 360
    // Snap to 5° increments
    setCurrentRotation(Math.round(raw / 5) * 5)
  }, [])

  const endRotate = useCallback((): number | null => {
    const rot = currentRotation
    stateRef.current = null
    setCurrentRotation(null)
    return rot
  }, [currentRotation])

  return { liveRotation: currentRotation, startRotate, updateRotate, endRotate }
}

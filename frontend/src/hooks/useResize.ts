import { useRef, useState, useCallback } from 'react'
import type { MapObject, ObjectShapeType } from '../types'
import { svgToObjectLocal } from '../utils/svgCoords'

const PX_PER_CM = 0.46
const MIN_CM = 10

export interface ResizeDimensions {
  width_cm: number | null
  depth_cm: number | null
  diameter_cm: number | null
}

interface ResizeState {
  object: MapObject
  handle: string
  initialDims: ResizeDimensions
  initialPointerLocal: { x: number; y: number }
}

export function useResize() {
  const [currentDims, setCurrentDims] = useState<ResizeDimensions | null>(null)
  const stateRef = useRef<ResizeState | null>(null)

  const startResize = useCallback((
    object: MapObject,
    handle: string,
    svgPoint: { x: number; y: number },
  ) => {
    const localPt = svgToObjectLocal(
      svgPoint.x, svgPoint.y,
      object.map_x ?? 0, object.map_y ?? 0,
      object.rotation || 0,
    )
    const dims: ResizeDimensions = {
      width_cm: object.width_cm,
      depth_cm: object.depth_cm,
      diameter_cm: object.diameter_cm,
    }
    stateRef.current = {
      object,
      handle,
      initialDims: dims,
      initialPointerLocal: localPt,
    }
    setCurrentDims(dims)
  }, [])

  const updateResize = useCallback((svgPoint: { x: number; y: number }) => {
    const state = stateRef.current
    if (!state) return

    const obj = state.object
    const localPt = svgToObjectLocal(
      svgPoint.x, svgPoint.y,
      obj.map_x ?? 0, obj.map_y ?? 0,
      obj.rotation || 0,
    )

    const dx = localPt.x - state.initialPointerLocal.x
    const dy = localPt.y - state.initialPointerLocal.y

    const newDims = computeNewDimensions(
      obj.shape,
      state.initialDims,
      state.handle,
      dx, dy,
    )
    setCurrentDims(newDims)
  }, [])

  const endResize = useCallback((): ResizeDimensions | null => {
    const dims = currentDims
    stateRef.current = null
    setCurrentDims(null)
    return dims
  }, [currentDims])

  return { resizeDims: currentDims, startResize, updateResize, endResize }
}

function computeNewDimensions(
  shape: ObjectShapeType,
  initial: ResizeDimensions,
  handle: string,
  dxPx: number,
  dyPx: number,
): ResizeDimensions {
  const dxCm = dxPx / PX_PER_CM
  const dyCm = dyPx / PX_PER_CM

  if (shape === 'circle') {
    // Cardinal handles: compute radial delta
    const initR = (initial.diameter_cm || 30) / 2
    let deltaR = 0
    if (handle === 'e') deltaR = dxCm
    else if (handle === 'w') deltaR = -dxCm
    else if (handle === 's') deltaR = dyCm
    else if (handle === 'n') deltaR = -dyCm

    const newDiameter = Math.max(MIN_CM, (initR + deltaR) * 2)
    return { ...initial, diameter_cm: Math.round(newDiameter) }
  }

  if (shape === 'square') {
    // Corner handles only, constrained width===depth
    const initSize = initial.width_cm || 30
    // Use the dominant axis delta based on handle direction
    let delta = 0
    if (handle === 'se') delta = Math.max(dxCm, dyCm)
    else if (handle === 'nw') delta = Math.max(-dxCm, -dyCm)
    else if (handle === 'ne') delta = Math.max(dxCm, -dyCm)
    else if (handle === 'sw') delta = Math.max(-dxCm, dyCm)

    const newSize = Math.max(MIN_CM, Math.round(initSize + delta))
    return { ...initial, width_cm: newSize, depth_cm: newSize }
  }

  // Rectangle: corners resize both axes, edges resize one axis
  let newWidth = initial.width_cm || 80
  let newDepth = initial.depth_cm || 40

  // Horizontal component
  if (['e', 'ne', 'se'].includes(handle)) newWidth = initial.width_cm! + dxCm
  else if (['w', 'nw', 'sw'].includes(handle)) newWidth = initial.width_cm! - dxCm

  // Vertical component
  if (['s', 'se', 'sw'].includes(handle)) newDepth = initial.depth_cm! + dyCm
  else if (['n', 'ne', 'nw'].includes(handle)) newDepth = initial.depth_cm! - dyCm

  return {
    ...initial,
    width_cm: Math.max(MIN_CM, Math.round(newWidth)),
    depth_cm: Math.max(MIN_CM, Math.round(newDepth)),
  }
}

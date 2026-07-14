import { useRef, useState, useCallback, useEffect } from 'react'
import type { MapPlant, MapObject, CanvasData, GroundZone } from '../types'
import { plants as plantsApi, objects as objectsApi } from '../api/client'
import { screenToSVG, resolveDropTarget } from '../utils/svgCoords'
import type { DropTarget } from '../utils/svgCoords'
import { useMapSelection } from './useMapSelection'
import type { MapSelection } from './useMapSelection'
import { canStartContainerDrag, canStartPlantDrag, resolveDisplayedDragPosition } from '../components/map/plantDragPermissions'
import { resolvePlantDropPersistenceAction } from '../components/map/plantDropPersistence'

type DragItem = { type: 'plant'; id: number } | { type: 'container'; id: number }

export interface UseMapInteractionConfig {
  svgRef: React.RefObject<SVGSVGElement>
  plants: MapPlant[]
  objects: MapObject[]
  soilGroundZones: GroundZone[]
  mapId: number
  isHouseMap: boolean
  canvasData: CanvasData | null
  gardenBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  isMobile: boolean
  moveMode?: boolean
  movePlantId?: number | null
  onPlantMoveComplete?: (plantId: number) => void | Promise<void>
  /** Patch a plant in place after a move (e.g. the recomputed bare/potted icon_key). */
  onPlantUpdated?: (plantId: number, patch: Partial<MapPlant>) => void
  onPlantTap?: (plant: MapPlant) => void
  onObjectTap?: (obj: MapObject) => void
  onOpenDetails?: (type: 'plant' | 'object', id: number) => void
  onPositionUpdate?: () => void
  onRemoveItem?: (type: 'plant' | 'object', id: number) => void
  onMapTap?: () => void
}

export interface MapInteraction {
  selection: MapSelection
  dragging: DragItem | null
  dragPositions: Record<string, { x: number; y: number }>
  dragKey: string | null
  dropTarget: DropTarget | null
  hoveredContainerId: number | null
  hoveredZoneId: string | null
  hoveredZoneName: string | null
  removeTarget: { type: 'plant'; id: number; x: number; y: number } | null
  setRemoveTarget: (t: { type: 'plant'; id: number; x: number; y: number } | null) => void
  plantResizeRadius: number | null
  isResizing: boolean
  activeResizeHandle: string | null
  selectedPlant: MapPlant | null
  selectedPlantPos: { x: number; y: number } | null
  handlePlantPointerDown: (e: React.PointerEvent, plant: MapPlant, dragElementOverride?: SVGGElement | null) => void
  handleContainerPointerDown: (e: React.PointerEvent, obj: MapObject) => void
  handlePointerMove: (e: React.PointerEvent) => void
  handlePointerUp: () => Promise<void>
  handleItemSelect: (itemType: 'plant' | 'object', id: number) => void
  handleMapClick: () => void
  handlePlantResizeDown: (e: React.PointerEvent, handle: string) => void
}

export function useMapInteraction({
  svgRef,
  plants,
  objects,
  soilGroundZones,
  mapId,
  isHouseMap,
  canvasData,
  gardenBounds,
  isMobile,
  moveMode = false,
  movePlantId = null,
  onPlantMoveComplete,
  onPlantUpdated,
  onPlantTap,
  onObjectTap,
  onOpenDetails,
  onPositionUpdate,
  onMapTap,
}: UseMapInteractionConfig): MapInteraction {
  const { selection, dispatch } = useMapSelection()

  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const didDrag = useRef(false)
  const lastTapRef = useRef<{ id: string; time: number } | null>(null)
  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafThrottleRef = useRef<number | null>(null)
  const dragPositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const ptrMoveRef = useRef<((e: React.PointerEvent) => void) | null>(null)
  const ptrUpRef = useRef<((e: React.PointerEvent) => void) | null>(null)

    // Reference to the DOM element being dragged, so we can imperatively
  // set transform during drag and avoid React re-renders on every frame.
  const dragElementRef = useRef<SVGGElement | null>(null)

  const [removeTarget, setRemoveTarget] = useState<{ type: 'plant'; id: number; x: number; y: number } | null>(null)
  const [plantResizeRadius, setPlantResizeRadius] = useState<number | null>(null)
  const plantResizeRadiusRef = useRef<number | null>(null)
  const plantResizeRef = useRef<{ plantId: number; initialRadius: number; initialPt: { x: number; y: number }; handle: string } | null>(null)

  const setPlantRadius = (r: number | null) => {
    setPlantResizeRadius(r)
    plantResizeRadiusRef.current = r
  }

  // Stable document-level listeners — attach during drag, remove on pointer-up.
  // Always call through ptrMoveRef/ptrUpRef to avoid stale closures.
  const onDocMove = useCallback((e: PointerEvent) => {
    e.preventDefault()
    ptrMoveRef.current?.(e as unknown as React.PointerEvent<SVGSVGElement>)
  }, [])

  const onDocUp = useCallback((e: PointerEvent) => {
    document.removeEventListener('pointermove', onDocMove)
    document.removeEventListener('pointerup', onDocUp)
    document.removeEventListener('pointercancel', onDocUp)
    ptrUpRef.current?.(e as unknown as React.PointerEvent<SVGSVGElement>)
  }, [onDocMove])

  useEffect(() => () => {
    document.removeEventListener('pointermove', onDocMove)
    document.removeEventListener('pointerup', onDocUp)
    document.removeEventListener('pointercancel', onDocUp)
  }, [onDocMove, onDocUp])

  const handleItemSelect = useCallback((itemType: 'plant' | 'object', id: number) => {
    // Objects are static — single tap always opens the sheet immediately
    if (itemType === 'object') {
      const obj = objects.find((o) => o.id === id)
      if (obj) onObjectTap?.(obj)
      onOpenDetails?.('object', id)
      return
    }

    const key = `${itemType}-${id}`
    const now = Date.now()
    const last = lastTapRef.current

    const openDetails = () => {
      lastTapRef.current = null
      pendingTapRef.current = null
      onOpenDetails?.(itemType, id)
      const plant = plants.find((p) => p.id === id)
      if (plant) onPlantTap?.(plant)
    }

    // Double-click detected
    if (last && last.id === key && now - last.time < 300) {
      if (pendingTapRef.current) {
        clearTimeout(pendingTapRef.current)
        pendingTapRef.current = null
      }
      lastTapRef.current = null

      if (selection.selectedId === key) {
        const plant = plants.find((p) => p.id === id)
        const pos = plant ? { x: plant.map_x, y: plant.map_y } : { x: 0, y: 0 }
        setRemoveTarget({ type: 'plant', id, x: pos.x, y: pos.y })
        return
      }

      setRemoveTarget(null)
      dispatch({ type: 'SELECT', id: key, itemType })
      return
    }

    lastTapRef.current = { id: key, time: now }
    setRemoveTarget(null)
    if (pendingTapRef.current) clearTimeout(pendingTapRef.current)
    pendingTapRef.current = setTimeout(openDetails, 280)
  }, [selection.selectedId, dispatch, onOpenDetails, onPlantTap, onObjectTap, plants, objects])

  const handlePlantPointerDown = useCallback((e: React.PointerEvent, plant: MapPlant, dragElementOverride?: SVGGElement | null) => {
    if (selection.mode === 'resizing') return
    if (!canStartPlantDrag(plant, { moveMode, movePlantId })) return
    e.stopPropagation()
    // Register the SVG <g> element for imperative DOM transform during drag
    dragElementRef.current = dragElementOverride === undefined
      ? e.currentTarget as SVGGElement | null
      : dragElementOverride
    // Document-level listeners instead of setPointerCapture (unreliable on SVG <g>
    // elements with CSS transforms on mobile browsers).
    document.addEventListener('pointermove', onDocMove, { passive: false })
    document.addEventListener('pointerup', onDocUp)
    document.addEventListener('pointercancel', onDocUp)
    const key = `plant-${plant.id}`
    const startPos = resolveDisplayedDragPosition(key, dragPositions, { x: plant.map_x, y: plant.map_y })
    if (svgRef.current) {
      const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
      dragOffsetRef.current = pt ? { x: startPos.x - pt.x, y: startPos.y - pt.y } : { x: 0, y: 0 }
    }
    setDragging({ type: 'plant', id: plant.id })
    didDrag.current = false
    setDragPositions((prev) => ({ ...prev, [key]: prev[key] ?? startPos }))
  }, [selection.mode, svgRef, onDocMove, onDocUp, moveMode, movePlantId, dragPositions])

  const handleContainerPointerDown = useCallback((e: React.PointerEvent, obj: MapObject) => {
    if (!canStartContainerDrag({ moveMode, movePlantId })) return
    e.stopPropagation()
    // Register the SVG element for imperative DOM transform during drag
    dragElementRef.current = e.currentTarget as SVGGElement | null
    // Document-level listeners instead of setPointerCapture
    document.addEventListener('pointermove', onDocMove, { passive: false })
    document.addEventListener('pointerup', onDocUp)
    document.addEventListener('pointercancel', onDocUp)
    const key = `container-${obj.id}`
    if (svgRef.current) {
      const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
      const ox = obj.map_x ?? 0
      const oy = obj.map_y ?? 0
      dragOffsetRef.current = pt ? { x: ox - pt.x, y: oy - pt.y } : { x: 0, y: 0 }
    }
    setDragging({ type: 'container', id: obj.id })
    didDrag.current = false
    setDragPositions((prev) => ({ ...prev, [key]: { x: obj.map_x ?? 0, y: obj.map_y ?? 0 } }))
  }, [svgRef, onDocMove, onDocUp, moveMode, movePlantId])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!svgRef.current) return

    // Resize takes priority (plants only)
    if (selection.mode === 'resizing') {
      const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
      if (!pt) return

      if (plantResizeRef.current) {
        const prs = plantResizeRef.current
        const dx = pt.x - prs.initialPt.x
        const dy = pt.y - prs.initialPt.y
        let delta = 0
        if (prs.handle === 'e') delta = dx / 0.46
        else if (prs.handle === 'w') delta = -dx / 0.46
        else if (prs.handle === 's') delta = dy / 0.46
        else if (prs.handle === 'n') delta = -dy / 0.46
        setPlantRadius(Math.max(10, Math.min(400, Math.round(prs.initialRadius + delta))))
        return
      }

      return
    }

    // Drag logic
    if (!dragging) return
    const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
    if (!pt) return
    didDrag.current = true
    const key = `${dragging.type}-${dragging.id}`
    // Apply grab offset so the item centre follows the grab point, not the cursor centre
    const rawX = pt.x + dragOffsetRef.current.x
    const rawY = pt.y + dragOffsetRef.current.y
    const gb = gardenBounds
    // Mobile uses simpler viewBox clamping (works around narrow gardenBounds
    // ranges making lateral drag impossible). Desktop uses gardenBounds when
    // they're reasonably-sized.
    if (isMobile) {
      const maxW = canvasData ? canvasData.canvas_w : 680
      const maxH = canvasData ? canvasData.canvas_h : 680
      dragPositionsRef.current = { ...dragPositionsRef.current, [key]: { x: Math.max(0, Math.min(maxW, rawX)), y: Math.max(0, Math.min(maxH, rawY)) } }
      if (dragElementRef.current) {
        dragElementRef.current.setAttribute('transform', `translate(${Math.max(0, Math.min(maxW, rawX))}, ${Math.max(0, Math.min(maxH, rawY))})`)
      } else if (!rafThrottleRef.current) {
        rafThrottleRef.current = requestAnimationFrame(() => {
          rafThrottleRef.current = null
          setDragPositions((prev) => ({ ...prev, [key]: { x: Math.max(0, Math.min(maxW, rawX)), y: Math.max(0, Math.min(maxH, rawY)) } }))
        })
      }
      if (dragging.type === 'plant') {
        setDropTarget(resolveDropTarget(rawX, rawY, objects, soilGroundZones))
      }
      return
    }
    // Desktop: use gardenBounds clamping with a sanity check for narrow ranges.
    const hasUsableX = gb && (gb.maxX - gb.minX) > 20
    const hasUsableY = gb && (gb.maxY - gb.minY) > 20
    const clampedX = isHouseMap && canvasData
      ? Math.max(0, Math.min(canvasData.canvas_w, rawX))
      : hasUsableX ? Math.max(gb!.minX, Math.min(gb!.maxX, rawX))
      : Math.max(0, Math.min(680, rawX))
    const clampedY = isHouseMap && canvasData
      ? Math.max(0, Math.min(canvasData.canvas_h, rawY))
      : hasUsableY ? Math.max(gb!.minY, Math.min(gb!.maxY, rawY))
      : Math.max(0, Math.min(680, rawY))

    // Update ref immediately (zero-latency, no re-render)
    dragPositionsRef.current = { ...dragPositionsRef.current, [key]: { x: clampedX, y: clampedY } }

    // Imperatively move the dragged element via DOM transform — no React state
    // update, avoiding a full re-render of all PlantMarkers on every frame.
    if (dragElementRef.current) {
      dragElementRef.current.setAttribute('transform', `translate(${clampedX}, ${clampedY})`)
    } else if (!rafThrottleRef.current) {
      // Fallback: throttle React state updates to at most once per frame
      rafThrottleRef.current = requestAnimationFrame(() => {
        rafThrottleRef.current = null
        setDragPositions((prev) => ({ ...prev, [key]: { x: clampedX, y: clampedY } }))
      })
    }

    if (dragging.type === 'plant') {
      setDropTarget(resolveDropTarget(rawX, rawY, objects, soilGroundZones))
    }
  }, [dragging, selection.mode, objects, soilGroundZones, isMobile, canvasData, isHouseMap, gardenBounds, svgRef])

  const handlePointerUp = useCallback(async () => {
    // Cancel any pending throttle frame
    if (rafThrottleRef.current !== null) {
      cancelAnimationFrame(rafThrottleRef.current)
      rafThrottleRef.current = null
    }

    // End resize (plants only)
    if (selection.mode === 'resizing') {
      if (plantResizeRef.current && plantResizeRadiusRef.current !== null) {
        const plantId = plantResizeRef.current.plantId
        const finalRadius = plantResizeRadiusRef.current
        plantResizeRef.current = null
        dispatch({ type: 'END_RESIZE' })
        setPlantRadius(null)
        try {
          await plantsApi.setRadius(plantId, finalRadius)
          onPositionUpdate?.()
        } catch (err) {
          console.error('Failed to update plant size:', err)
        }
      }
      return
    }

    // Clear imperative DOM ref
    dragElementRef.current = null

    // End drag (plants and containers)
    if (!dragging) return
    const key = `${dragging.type}-${dragging.id}`
    // Use ref for final position (guarantees latest value, independent of RAF throttle)
    const pos = dragPositionsRef.current[key]
    if (pos && didDrag.current) {
      try {
        if (dragging.type === 'plant') {
          const action = resolvePlantDropPersistenceAction({
            finalPosition: pos,
            mapId,
            objects,
            soilGroundZones,
          })
          let updated
          if (action.type === 'container') {
            updated = await plantsApi.setContainer(dragging.id, action.containerId)
          } else if (action.type === 'ground-zone') {
            updated = await plantsApi.setGroundZone(dragging.id, action.groundZoneId, action.map_x, action.map_y)
          } else {
            updated = await plantsApi.setPosition(dragging.id, {
              map_id: action.mapId,
              map_x: action.map_x,
              map_y: action.map_y,
              ground_zone_id: action.ground_zone_id,
            })
          }
          // Reflect the server-recomputed placement (esp. the bare/potted
          // icon_key) and final persisted placement fields on the marker
          // without a full reload.
          if (updated) {
            onPlantUpdated?.(dragging.id, {
              icon_key: updated.icon_key,
              container_id: updated.container_id,
              ground_zone_id: action.type === 'ground-zone' ? action.groundZoneId : null,
              ...(action.type !== 'container'
                ? { map_x: action.map_x, map_y: action.map_y }
                : {}),
            })
          }
        } else if (dragging.type === 'container') {
          const rounded = { map_x: Math.round(pos.x * 10) / 10, map_y: Math.round(pos.y * 10) / 10 }
          await objectsApi.setPosition(dragging.id, rounded)
        }
        // Optimistic update: keep dragPositions entry so the plant stays
        // at the dropped position without a full data reload. Skip the full
        // refresh — the API call already persisted the change.
        setDragPositions((prev) => ({ ...prev, [key]: pos }))
        if (dragging.type === 'plant') {
          await onPlantMoveComplete?.(dragging.id)
        }
      } catch (err) {
        console.error('Failed to update position:', err)
        // On error: clean up dragPositions so the plant snaps back to its
        // original position on next render.
        setDragPositions((prev) => {
          if (!(key in prev)) return prev
          const { [key]: _, ...rest } = prev
          return rest
        })
      }
    }
    // Always clean up the ref (imperative DOM transform no longer needed)
    const { [key]: _, ...restRef } = dragPositionsRef.current
    dragPositionsRef.current = restRef
    setDragging(null)
    setDropTarget(null)
    didDrag.current = false
  }, [dragging, mapId, dropTarget, onPositionUpdate, selection.mode, dispatch, onPlantMoveComplete, onPlantUpdated])

  // Keep ptrMoveRef/ptrUpRef in sync with latest handler callbacks
  useEffect(() => {
    ptrMoveRef.current = handlePointerMove
    ptrUpRef.current = handlePointerUp
  })

  const handlePlantResizeDown = useCallback((e: React.PointerEvent, handle: string) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)

    if (!svgRef.current || !selection.selectedId) return
    const plantId = parseInt(selection.selectedId.replace('plant-', ''))
    const plant = plants.find((p) => p.id === plantId)
    if (!plant) return

    const pt = screenToSVG(svgRef.current, e.clientX, e.clientY)
    if (!pt) return

    const currentRadius = plant.display_radius_cm ?? 30
    plantResizeRef.current = { plantId, initialRadius: currentRadius, initialPt: pt, handle }
    setPlantRadius(currentRadius)
    dispatch({ type: 'START_RESIZE', handle })
  }, [selection.selectedId, plants, dispatch, svgRef])

  const handleMapClick = useCallback(() => {
    if (pendingTapRef.current) {
      clearTimeout(pendingTapRef.current)
      pendingTapRef.current = null
    }
    lastTapRef.current = null

    if (removeTarget) {
      setRemoveTarget(null)
      return
    }
    if (selection.selectedId) {
      dispatch({ type: 'DESELECT' })
    }
    onMapTap?.()
  }, [selection.selectedId, dispatch, onMapTap, removeTarget])

  // Derived display values
  const dragKey = dragging ? `${dragging.type}-${dragging.id}` : null
  const hoveredContainerId = dropTarget?.type === 'container' ? dropTarget.target.id : null
  const hoveredZoneId = dropTarget?.type === 'zone' ? dropTarget.target.id : null
  const hoveredZoneName = dropTarget?.type === 'zone' ? dropTarget.target.name : null

  const selectedPlant = selection.selectedType === 'plant' && selection.selectedId
    ? plants.find((p) => p.id === parseInt(selection.selectedId!.replace('plant-', '')))
    ?? null
    : null

  const selectedPlantPos = selectedPlant
    ? (dragPositions[selection.selectedId!] ?? { x: selectedPlant.map_x, y: selectedPlant.map_y })
    : null

  const isResizing = selection.mode === 'resizing' && !!plantResizeRef.current
  const activeResizeHandle = plantResizeRef.current ? selection.resizeHandle : null

  return {
    selection,
    dragging,
    dragPositions,
    dragKey,
    dropTarget,
    hoveredContainerId,
    hoveredZoneId,
    hoveredZoneName,
    removeTarget,
    setRemoveTarget,
    plantResizeRadius,
    isResizing,
    activeResizeHandle,
    selectedPlant,
    selectedPlantPos,
    handlePlantPointerDown,
    handleContainerPointerDown,
    handlePointerMove,
    handlePointerUp,
    handleItemSelect,
    handleMapClick,
    handlePlantResizeDown,
  }
}

import { describe, expect, it } from 'vitest'
import {
  canStartContainerDrag,
  canStartPlantDrag,
  getPlantDragHitRadius,
  resolveDisplayedDragPosition,
  shouldStartMapPan,
} from '../plantDragPermissions'

describe('canStartPlantDrag', () => {
  const unlocked = { id: 1, is_locked: false }
  const locked = { id: 1, is_locked: true }

  it('blocks ordinary plant drags in browse mode', () => {
    expect(canStartPlantDrag(unlocked, { moveMode: false, movePlantId: null })).toBe(false)
  })

  it('allows unlocked plants in global move mode', () => {
    expect(canStartPlantDrag(unlocked, { moveMode: true, movePlantId: null })).toBe(true)
  })

  it('keeps locked plants fixed even in global move mode', () => {
    expect(canStartPlantDrag(locked, { moveMode: true, movePlantId: null })).toBe(false)
  })

  it('allows only the targeted plant during one-plant move mode', () => {
    expect(canStartPlantDrag({ id: 1, is_locked: false }, { moveMode: false, movePlantId: 1 })).toBe(true)
    expect(canStartPlantDrag({ id: 2, is_locked: false }, { moveMode: false, movePlantId: 1 })).toBe(false)
  })
})

describe('canStartContainerDrag', () => {
  it('blocks container drags in browse mode', () => {
    expect(canStartContainerDrag({ moveMode: false, movePlantId: null })).toBe(false)
  })

  it('allows containers in global move mode', () => {
    expect(canStartContainerDrag({ moveMode: true, movePlantId: null })).toBe(true)
  })

  it('blocks containers during one-plant move mode', () => {
    expect(canStartContainerDrag({ moveMode: false, movePlantId: 1 })).toBe(false)
  })
})

describe('resolveDisplayedDragPosition', () => {
  it('keeps using the optimistic display position instead of stale plant coordinates', () => {
    expect(resolveDisplayedDragPosition('plant-1', { 'plant-1': { x: 220, y: 180 } }, { x: 80, y: 90 })).toEqual({ x: 220, y: 180 })
  })

  it('falls back to the plant coordinates when there is no optimistic position yet', () => {
    expect(resolveDisplayedDragPosition('plant-1', {}, { x: 80, y: 90 })).toEqual({ x: 80, y: 90 })
  })
})

describe('shouldStartMapPan', () => {
  it('allows one-finger map pan while browsing', () => {
    expect(shouldStartMapPan({ moveMode: false, movePlantId: null })).toBe(true)
  })

  it('disables background pan while reposition mode is active', () => {
    expect(shouldStartMapPan({ moveMode: true, movePlantId: null })).toBe(false)
    expect(shouldStartMapPan({ moveMode: false, movePlantId: 1 })).toBe(false)
  })
})

describe('getPlantDragHitRadius', () => {
  it('uses a larger touch target for draggable plants', () => {
    expect(getPlantDragHitRadius(14, true)).toBe(32)
  })

  it('keeps the normal browse-mode target smaller', () => {
    expect(getPlantDragHitRadius(14, false)).toBe(20)
  })
})

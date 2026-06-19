import { describe, expect, it } from 'vitest'
import { canStartContainerDrag, canStartPlantDrag } from '../plantDragPermissions'

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

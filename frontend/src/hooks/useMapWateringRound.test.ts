// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  complete: vi.fn(),
  undo: vi.fn(),
}))

vi.mock('../api/client', () => ({
  mapWateringRound: {
    get: mocks.get,
    complete: mocks.complete,
  },
  gardenCare: {
    undo: mocks.undo,
  },
}))

import {
  useMapWateringRound,
  type UseMapWateringRoundReturn,
} from './useMapWateringRound'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const round = {
  map_id: 1,
  map_name: 'Back garden',
  members: [{
    schedule_id: 10,
    plant_id: 1,
    plant_name: 'Rose',
    plant_icon_variant: 'rose',
    canonical_date: '2026-07-25',
    rhythm_opt_out: false,
  }],
  history: [{
    operation_id: 30,
    completed_at: '2026-07-20',
    completed_by: 1,
    completed_by_name: 'Leon',
    affected_count: 1,
    can_undo: true,
  }],
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useMapWateringRound', () => {
  let container: HTMLDivElement
  let root: Root
  let latest: UseMapWateringRoundReturn | null = null

  function Harness({ mapId = 1 }: { mapId?: number | null }) {
    latest = useMapWateringRound(mapId)
    return null
  }

  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue(round)
    mocks.complete.mockReset().mockResolvedValue({
      operation_id: 31,
      care_type: 'water',
      completed_at: '2026-07-23',
      affected_count: 1,
    })
    mocks.undo.mockReset().mockResolvedValue({ ok: true })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latest = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('loads badge data and refreshes after open, complete, and undo', async () => {
    await act(async () => {
      root.render(createElement(Harness))
    })
    await flush()

    expect(mocks.get).toHaveBeenCalledWith(1)
    expect(latest?.data).toEqual(round)

    await act(async () => {
      await latest?.open()
    })
    expect(latest?.isOpen).toBe(true)
    expect(mocks.get).toHaveBeenCalledTimes(2)

    await act(async () => {
      await latest?.complete('2026-07-23', 1, [10])
    })
    expect(mocks.complete).toHaveBeenCalledWith(1, '2026-07-23', 1, [10])
    expect(mocks.get).toHaveBeenCalledTimes(3)
    expect(latest?.isOpen).toBe(false)

    await act(async () => {
      await latest?.undo(30)
    })
    expect(mocks.undo).toHaveBeenCalledWith(30)
    expect(mocks.get).toHaveBeenCalledTimes(4)
  })

  it('exposes load, completion, and undo failures without closing the sheet', async () => {
    mocks.get.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      root.render(createElement(Harness))
    })
    await flush()
    expect(latest?.data).toBeNull()
    expect(latest?.error).toBe('load_failed')

    mocks.get.mockResolvedValue(round)
    await act(async () => {
      await latest?.open()
    })
    expect(latest?.isOpen).toBe(true)

    mocks.complete.mockRejectedValueOnce(new Error('save failed'))
    let completeError: unknown
    await act(async () => {
      try {
        await latest?.complete('2026-07-23', 1, [10])
      } catch (cause) {
        completeError = cause
      }
    })
    expect(completeError).toEqual(new Error('save failed'))
    expect(latest?.isOpen).toBe(true)
    expect(latest?.saving).toBe(false)
    expect(latest?.error).toBe('complete_failed')

    mocks.undo.mockRejectedValueOnce(new Error('conflict'))
    let undoError: unknown
    await act(async () => {
      try {
        await latest?.undo(30)
      } catch (cause) {
        undoError = cause
      }
    })
    expect(undoError).toEqual(new Error('conflict'))
    expect(latest?.saving).toBe(false)
    expect(latest?.error).toBe('undo_failed')
  })

  it('ignores a stale response after switching maps', async () => {
    let resolveFirst: ((value: typeof round) => void) | undefined
    let resolveSecond: ((value: typeof round) => void) | undefined
    const first = new Promise<typeof round>((resolve) => { resolveFirst = resolve })
    const second = new Promise<typeof round>((resolve) => { resolveSecond = resolve })
    mocks.get.mockImplementation((mapId: number) => mapId === 1 ? first : second)

    await act(async () => {
      root.render(createElement(Harness, { mapId: 1 }))
    })
    await act(async () => {
      root.render(createElement(Harness, { mapId: 2 }))
    })
    expect(latest?.data).toBeNull()

    const secondRound = { ...round, map_id: 2, map_name: 'Living room' }
    await act(async () => {
      resolveSecond?.(secondRound)
      await second
    })
    expect(latest?.data).toEqual(secondRound)

    await act(async () => {
      resolveFirst?.(round)
      await first
    })
    expect(latest?.data).toEqual(secondRound)
  })
})

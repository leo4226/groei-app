// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calendar } from '../../api/client'
import type { CalendarEvent } from './calendarTypes'
import { useCalendarEventRange } from './useCalendarEvents'

vi.mock('../../api/client', () => ({
  calendar: { events: vi.fn() },
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector: (state: { careVersions: Record<string, number>, refreshTick: number }) => unknown) => (
    selector({ careVersions: {}, refreshTick: 0 })
  ),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

function Harness() {
  const { events, loading, refreshing, refreshError } = useCalendarEventRange(
    '2026-07-01', '2026-07-31', 'all',
  )
  const state = loading
    ? 'initial-loading'
    : refreshing
      ? 'background-refresh'
      : refreshError
        ? 'stale-error'
        : 'ready'
  return createElement('span', null, `${state}:${events.length}`)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('useCalendarEventRange Care-rhythm refresh', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.mocked(calendar.events).mockResolvedValue([])
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('reloads the active range after a Care-rhythm change and removes the listener on unmount', async () => {
    await act(async () => {
      root.render(createElement(Harness))
      await flush()
    })
    expect(calendar.events).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('floreren-care-rhythm-changed'))
      await flush()
    })
    expect(calendar.events).toHaveBeenCalledTimes(2)

    act(() => root.unmount())
    window.dispatchEvent(new Event('floreren-care-rhythm-changed'))
    await flush()
    expect(calendar.events).toHaveBeenCalledTimes(2)
  })

  it('keeps cached events visible during a background refresh and after its failure', async () => {
    const initial = deferred<CalendarEvent[]>()
    const refresh = deferred<CalendarEvent[]>()
    vi.mocked(calendar.events)
      .mockReset()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise)

    act(() => root.render(createElement(Harness)))
    expect(container.textContent).toBe('initial-loading:0')

    await act(async () => {
      initial.resolve([{ id: 'cached-event' } as CalendarEvent])
      await flush()
    })
    expect(container.textContent).toBe('ready:1')

    act(() => window.dispatchEvent(new Event('floreren-care-rhythm-changed')))
    expect(container.textContent).toBe('background-refresh:1')

    await act(async () => {
      refresh.reject(new Error('offline'))
      await flush()
    })
    expect(container.textContent).toBe('stale-error:1')
  })
})

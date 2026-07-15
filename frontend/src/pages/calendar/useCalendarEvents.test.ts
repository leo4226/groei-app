// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calendar } from '../../api/client'
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
  const { events, loading } = useCalendarEventRange('2026-07-01', '2026-07-31', 'all')
  return createElement('span', null, loading ? 'loading' : String(events.length))
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
})

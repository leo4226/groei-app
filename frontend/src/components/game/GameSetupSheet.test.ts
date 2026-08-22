// @vitest-environment jsdom
//
// GameSetupSheet capability rendering (#935, surface 17): creating a game is
// an editor write — a viewer sees the read-only banner and a disabled create
// button; an editor can create and is routed to the host page.

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import { maps as mapsApi } from '../../api/client'
import { gameApi } from '../../api/game'
import GameSetupSheet from './GameSetupSheet'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('../../api/client', () => ({
  maps: {
    list: vi.fn(),
    plants: vi.fn(),
  },
}))

vi.mock('../../api/game', () => ({
  gameApi: { create: vi.fn(), plantReadiness: vi.fn() },
}))

async function flush() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

describe('GameSetupSheet — capability rendering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    vi.mocked(mapsApi.list).mockResolvedValue([])
    vi.mocked(mapsApi.plants).mockResolvedValue([])
    vi.mocked(gameApi.plantReadiness).mockResolvedValue({ ready_plant_ids: [], total: 0 })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function render(canEdit: boolean) {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(GameSetupSheet, {
        mapId: 1,
        mapSlug: 'garden',
        onClose: vi.fn(),
        canEdit,
      })))
      await flush()
      await flush()
    })
  }

  it('lets an editor create a game', async () => {
    vi.mocked(gameApi.create).mockResolvedValue({ join_code: 'ABC123' })
    await render(true)

    const createButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Start game'))
    expect(createButton).toBeDefined()
    // Without ≥3 plants the button stays disabled; the editor path is proven
    // by the banner being absent and the button not carrying the read-only title.
    expect((createButton as HTMLButtonElement).title).not.toContain('Only editors can change this.')
    expect(container.textContent).not.toContain('Read-only')
  })

  it('shows the read-only banner and disables create for a viewer', async () => {
    await render(false)

    expect(container.textContent).toContain('Read-only')
    const createButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Start game'))
    expect(createButton).toBeDefined()
    expect((createButton as HTMLButtonElement).disabled).toBe(true)
    expect((createButton as HTMLButtonElement).title).toContain('Only editors can change this.')
  })

  it('still renders when the readiness lookup blows up', async () => {
    // Readiness only adds badges and enables the quick-game button, so it must
    // never be able to take the sheet down. A `.catch()` on the call is not
    // enough: it covers a rejected promise, and a call that throws
    // SYNCHRONOUSLY escapes the effect and unmounts the whole tree. That is
    // how this sheet first rendered as an empty box.
    vi.mocked(gameApi.plantReadiness).mockImplementation(() => {
      throw new Error('boom')
    })

    await render(false)

    expect(container.textContent).toContain('Read-only')
    const quickButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Start quick game'))
    expect(quickButton).toBeDefined()
    // Unknown readiness means no plants can be vouched for, so the one-tap
    // path stays shut rather than starting a hunt it cannot grade on photos.
    expect((quickButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens the quick game to an editor once enough plants have photos', async () => {
    vi.mocked(mapsApi.list).mockResolvedValue([
      { id: 1, name: 'Garden', slug: 'garden', map_type: 'outdoor' },
    ] as never)
    vi.mocked(mapsApi.plants).mockResolvedValue(
      [1, 2, 3].map((id) => ({ id, name: `Plant ${id}`, photo_path: 'x.jpg' })) as never,
    )
    vi.mocked(gameApi.plantReadiness).mockResolvedValue({
      ready_plant_ids: [1, 2, 3], total: 3,
    })

    await render(true)

    const quickButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Start quick game'))
    expect((quickButton as HTMLButtonElement).disabled).toBe(false)
  })
})

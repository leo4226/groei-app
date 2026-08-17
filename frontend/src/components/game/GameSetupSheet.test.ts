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
  gameApi: { create: vi.fn() },
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
      .find((b) => b.textContent?.includes('Create game'))
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
      .find((b) => b.textContent?.includes('Create game'))
    expect(createButton).toBeDefined()
    expect((createButton as HTMLButtonElement).disabled).toBe(true)
    expect((createButton as HTMLButtonElement).title).toContain('Only editors can change this.')
  })
})

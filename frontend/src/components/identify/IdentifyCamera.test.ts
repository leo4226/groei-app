// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentifyCamera } from './IdentifyCamera'
import { LanguageProvider } from '../../context/LanguageContext'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  getUserMedia: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { users: [], activeUserId: null }
    return selector ? selector(state) : state
  },
}))

describe('IdentifyCamera', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.stop.mockReset()
    mocks.getUserMedia.mockReset().mockResolvedValue({
      getTracks: () => [{ stop: mocks.stop }],
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: mocks.getUserMedia },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('stops the camera stream when the capture UI unmounts', async () => {
    await act(async () => {
      root.render(createElement(LanguageProvider, null,
        createElement(IdentifyCamera, { onCapture: vi.fn(), onCancel: vi.fn() }),
      ))
    })

    expect(mocks.getUserMedia).toHaveBeenCalledOnce()
    act(() => root.unmount())
    expect(mocks.stop).toHaveBeenCalledOnce()
  })
})

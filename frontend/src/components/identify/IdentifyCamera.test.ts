// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentifyCamera, type RetakeReason } from './IdentifyCamera'
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

function renderCamera(retakeReason?: RetakeReason) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(LanguageProvider, null,
      createElement(IdentifyCamera, {
        onCapture: vi.fn(),
        onCancel: vi.fn(),
        ...(retakeReason !== undefined ? { retakeReason } : {}),
      }),
    ))
  })
  return { container, root }
}

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
    localStorage.clear()
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

  it('shows the close-up/light hint on first open (NL)', () => {
    const { container: c } = renderCamera()
    expect(c.textContent).toContain('Eén blad of bloem van dichtbij, bij goed licht')
  })

  it('shows the close-up/light hint in English when the account language is English', () => {
    localStorage.setItem('floreren_lang', 'en')
    const { container: c } = renderCamera()
    expect(c.textContent).toContain('One leaf or flower close-up, in good light')
  })

  it('dismisses the hint when the close button is clicked', () => {
    const { container: c } = renderCamera()
    const dismiss = c.querySelector('[aria-label="Tip sluiten"]') as HTMLButtonElement
    expect(dismiss).not.toBeNull()
    act(() => dismiss.click())
    expect(c.textContent).not.toContain('Fotografeer een blad of bloem van dichtbij, bij goed licht')
  })

  it('shows the targeted "move closer" tip after a no-match retake, hiding the generic hint', () => {
    const { container: c } = renderCamera('no-match')
    expect(c.textContent).toContain('Ga dichterbij — vul het beeld met één blad of bloem')
    expect(c.textContent).not.toContain('Fotografeer een blad of bloem van dichtbij, bij goed licht')
  })

  it('shows the lighting tip after a low-confidence retake', () => {
    const { container: c } = renderCamera('low-confidence')
    expect(c.textContent).toContain('Vermijd harde schaduwen; zoek gelijkmatig licht')
    expect(c.textContent).not.toContain('Fotografeer een blad of bloem van dichtbij, bij goed licht')
  })
})

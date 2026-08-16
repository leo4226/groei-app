// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import ReadOnlyWritePage from './ReadOnlyWritePage'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ReadOnlyWritePage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  function render(props: { title?: string; body?: string; onBack?: () => void }) {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(ReadOnlyWritePage, props),
      ))
    })
  }

  it('shows the shared read-only banner and the given title/body', () => {
    render({ title: 'Blocked title', body: 'Blocked body.' })
    const text = container.textContent ?? ''
    expect(text).toContain('Read-only')
    expect(text).toContain('Blocked title')
    expect(text).toContain('Blocked body.')
  })

  it('falls back to the shared editing-page copy when no title is given', () => {
    render({})
    const text = container.textContent ?? ''
    expect(text).toContain('This is an editing page. Ask an editor to do this.')
  })

  it('renders no back button when onBack is omitted', () => {
    render({})
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders a back button that calls onBack', () => {
    const onBack = vi.fn()
    render({ onBack })
    const back = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Back'))
    expect(back).toBeDefined()
    act(() => back!.click())
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

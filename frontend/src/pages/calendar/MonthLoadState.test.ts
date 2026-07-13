// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MonthLoadState from './MonthLoadState'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('MonthLoadState', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows a localized failure and retries on request', () => {
    const onRetry = vi.fn()
    act(() => root.render(createElement(MonthLoadState, {
      loading: false,
      error: 'Network down',
      onRetry,
    })))

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('De maand kon niet worden geladen.')
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Opnieuw proberen')

    act(() => button?.click())
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

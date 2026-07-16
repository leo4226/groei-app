// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PassportEditLink } from './PassportEditLink'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PassportEditLink', () => {
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

  it.each(['Bewerk', 'Edit'])('keeps the %s label accessible without rendering it inside the compact circle', (label) => {
    act(() => root.render(
      createElement(MemoryRouter, null,
        createElement(PassportEditLink, { to: '/plants/1/edit', label }),
      ),
    ))

    const link = container.querySelector('[data-passport-edit-action]') as HTMLAnchorElement | null
    expect(link).not.toBeNull()
    expect(link?.getAttribute('aria-label')).toBe(label)
    expect(link?.getAttribute('title')).toBe(label)
    expect(link?.textContent).toBe('')
    expect(link?.querySelector('svg')).not.toBeNull()
  })
})

// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import CalendarCompletionNotice from './CalendarCompletionNotice'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CalendarCompletionNotice', () => {
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
  })

  it('links an individual completion to its care history without suggesting a photo', () => {
    const onDismiss = vi.fn()
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(MemoryRouter, null,
          createElement(CalendarCompletionNotice, {
            completion: { kind: 'plant', plantId: 3, plantName: 'Fern', careLogId: 77 },
            mapSlugs: new Map<number, string>(),
            onDismiss,
          }),
        ),
      ),
    ))

    expect(container.textContent).toContain('Care logged')
    expect(container.textContent).toContain('Fern')
    expect(Array.from(container.querySelectorAll('a')).map(link => link.getAttribute('href')))
      .toEqual(['/plants/3#care-log-77'])
    expect(container.textContent).not.toContain('Add photo')

    act(() => container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('links grouped completion to its canonical map when a slug exists', () => {
    act(() => root.render(
      createElement(LanguageProvider, null,
        createElement(MemoryRouter, null,
          createElement(CalendarCompletionNotice, {
            completion: { kind: 'map', mapId: 9, mapName: 'Back garden' },
            mapSlugs: new Map([[9, 'back-garden']]),
            onDismiss: vi.fn(),
          }),
        ),
      ),
    ))

    expect(container.textContent).toContain('Back garden')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/map/back-garden')
  })
})

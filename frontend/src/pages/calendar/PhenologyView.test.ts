// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import PhenologyView from './PhenologyView'

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector: (state: { plants: never[]; users: never[]; activeUserId: null }) => unknown) => selector({
    plants: [],
    users: [],
    activeUserId: null,
  }),
}))

vi.mock('../../api/client', () => ({
  alerts: { summary: vi.fn().mockResolvedValue({ plant_ids_with_alerts: [] }) },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PhenologyView editorial shell', () => {
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

  it('renders no view-local cover (the shared page masthead owns the title) and an accessible 12-month selector', async () => {
    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(PhenologyView)))
      await Promise.resolve()
    })

    const view = container.querySelector('[data-calendar-view="year"]')
    const selector = view?.querySelector('[data-garden-year-months]')
    const sections = view?.querySelector('[data-garden-year-sections]')
    const monthButtons = Array.from(selector?.querySelectorAll('button') ?? [])

    expect(view).not.toBeNull()
    // One cover, three spreads: the page-level CalendarPageMasthead renders the
    // single "Calendar." title; the view must not add its own h1.
    expect(view?.querySelector('h1')).toBeNull()
    expect(sections).not.toBeNull()
    expect(selector?.getAttribute('aria-label')).toMatch(/garden year/i)
    expect(monthButtons).toHaveLength(12)
    expect(monthButtons.every((button) => button.className.includes('min-h-11'))).toBe(true)
    expect(monthButtons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })
})

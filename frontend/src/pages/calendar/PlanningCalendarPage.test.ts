// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import PlanningCalendarPage from './PlanningCalendarPage'

vi.mock('./MonthView', async () => {
  const { createElement } = await import('react')
  return { default: () => createElement('div', { 'data-active-calendar-view': 'month' }) }
})

vi.mock('./WorkAgendaView', async () => {
  const { createElement } = await import('react')
  return { default: () => createElement('div', { 'data-active-calendar-view': 'work' }) }
})

vi.mock('./PhenologyView', async () => {
  const { createElement } = await import('react')
  return { default: () => createElement('div', { 'data-active-calendar-view': 'year' }) }
})

vi.mock('./useIsNarrow', () => ({ useIsNarrow: () => false }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PlanningCalendarPage view navigation', () => {
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

  it('keeps one shared navigation before Month, Work Agenda, and Garden Year', () => {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(PlanningCalendarPage)))
    })

    const navigation = container.querySelector('[data-calendar-view-navigation]')
    expect(navigation).not.toBeNull()

    const assertStableNavigation = (view: string) => {
      const currentNavigation = container.querySelector('[data-calendar-view-navigation]')
      const activeView = container.querySelector(`[data-active-calendar-view="${view}"]`)
      expect(container.querySelectorAll('[data-calendar-view-navigation]')).toHaveLength(1)
      expect(currentNavigation).toBe(navigation)
      expect(activeView).not.toBeNull()
      expect(currentNavigation!.compareDocumentPosition(activeView as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }

    assertStableNavigation('month')

    const viewButtons = Array.from(navigation?.querySelectorAll('button') ?? [])
    expect(viewButtons).toHaveLength(3)

    act(() => viewButtons[1].click())
    assertStableNavigation('work')

    act(() => viewButtons[2].click())
    assertStableNavigation('year')
  })
})

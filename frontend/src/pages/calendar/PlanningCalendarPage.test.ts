// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import PlanningCalendarPage from './PlanningCalendarPage'

vi.mock('./MonthView', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ viewNavigation }: { viewNavigation: ReactNode }) => (
      createElement('div', { 'data-active-calendar-view': 'month' }, viewNavigation)
    ),
  }
})

vi.mock('./WorkAgendaView', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ viewNavigation }: { viewNavigation: ReactNode }) => (
      createElement('div', { 'data-active-calendar-view': 'work' }, viewNavigation)
    ),
  }
})

vi.mock('./PhenologyView', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ viewNavigation }: { viewNavigation: ReactNode }) => (
      createElement('div', { 'data-active-calendar-view': 'year' }, viewNavigation)
    ),
  }
})

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PlanningCalendarPage view navigation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
      writable: true,
    })
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
      expect(currentNavigation).not.toBeNull()
      expect(activeView).not.toBeNull()
      expect(activeView!.contains(currentNavigation)).toBe(true)
    }

    assertStableNavigation('month')

    const viewButtons = Array.from(navigation?.querySelectorAll('button') ?? [])
    expect(viewButtons).toHaveLength(3)

    act(() => viewButtons[1].click())
    assertStableNavigation('work')

    const currentButtons = Array.from(
      container.querySelectorAll('[data-calendar-view-navigation] button'),
    ) as HTMLButtonElement[]
    act(() => currentButtons[2].click())
    assertStableNavigation('year')
  })

  it('offers only Work Agenda and Garden Year on a phone', () => {
    window.innerWidth = 720

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(PlanningCalendarPage)))
    })

    const navigation = container.querySelector('[data-calendar-view-navigation]')
    const labels = Array.from(navigation?.querySelectorAll('button') ?? [])
      .map((button) => button.textContent)

    expect(labels).toEqual(['Work agenda', 'Garden Year'])
    expect(container.querySelector('[data-active-calendar-view="work"]')).not.toBeNull()
    expect(container.querySelector('.masthead-context')).toBeNull()
  })

  it('moves desktop Month to Work Agenda when the layout becomes narrow', () => {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(PlanningCalendarPage)))
    })
    expect(container.querySelector('[data-active-calendar-view="month"]')).not.toBeNull()

    act(() => {
      window.innerWidth = 390
      window.dispatchEvent(new Event('resize'))
    })

    expect(container.querySelector('[data-active-calendar-view="work"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-calendar-view-navigation] button')).toHaveLength(2)
  })
})

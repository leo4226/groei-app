// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarMasthead from './CalendarMasthead'
import { CalendarPageMasthead } from './PlanningCalendarPage'
import { LanguageProvider } from '../../context/LanguageContext'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CalendarMasthead workload metrics', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows planned sessions and unique open work without a fake bloom metric', () => {
    act(() => root.render(createElement(CalendarMasthead, {
      year: 2026,
      month1: 7,
      onPrev: vi.fn(),
      onNext: vi.fn(),
      plannedCount: 9,
      openCount: 2,
      environmentFilter: null,
      viewNavigation: createElement('nav', { 'data-test-view-navigation': true }),
    })))

    expect(container.textContent).toContain('Gepland 9')
    expect(container.textContent).toContain('Open 2')
    expect(container.textContent).not.toContain('Bloei')
    expect(container.querySelector('[data-test-view-navigation]')).not.toBeNull()
    expect(container.textContent).not.toContain('Veldnotitie')
  })

  it('uses English month and metric labels for an English profile', () => {
    localStorage.setItem('floreren_lang', 'en')
    const masthead = createElement(CalendarMasthead, {
      year: 2026,
      month1: 7,
      onPrev: vi.fn(),
      onNext: vi.fn(),
      plannedCount: 4,
      openCount: 1,
      environmentFilter: null,
      viewNavigation: null,
    })

    act(() => root.render(createElement(LanguageProvider, null, masthead)))

    expect(container.textContent).toContain('July 2026')
    expect(container.textContent).toContain('Planned 4')
    expect(container.textContent).not.toContain('Juli')
  })

  it('exposes the monthly field note through a native disclosure', () => {
    localStorage.setItem('floreren_lang', 'en')
    const masthead = createElement(CalendarPageMasthead, {
      view: 'month',
      year: 2026,
      month1: 7,
      todayDay: 15,
    })

    act(() => root.render(createElement(LanguageProvider, null, masthead)))

    const disclosure = container.querySelector('details.calendar-field-note') as HTMLDetailsElement | null
    const trigger = disclosure?.querySelector('summary') as HTMLElement | null

    expect(container.querySelector('.masthead-title-row .moon-mini')).not.toBeNull()
    expect(container.querySelector('.masthead-title-row .calendar-field-note')).not.toBeNull()
    expect(disclosure).not.toBeNull()
    expect(disclosure?.open).toBe(false)
    expect(trigger?.textContent).toContain('Field note')
    expect(trigger?.textContent).toContain('Midsummer water')

    act(() => trigger?.click())

    expect(disclosure?.open).toBe(true)
    expect(disclosure?.textContent).toContain('July asks for water and an eye for shade.')
    expect(disclosure?.textContent).toContain('Day length')
  })
})

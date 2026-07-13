// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarMasthead from './CalendarMasthead'
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
      todayDay: 13,
      viewMode: 'month',
      onPrev: vi.fn(),
      onNext: vi.fn(),
      onSetView: vi.fn(),
      plannedCount: 9,
      openCount: 2,
      environmentFilter: null,
    })))

    expect(container.textContent).toContain('Gepland 9')
    expect(container.textContent).toContain('Open 2')
    expect(container.textContent).not.toContain('Bloei')
  })

  it('uses English month and metric labels for an English profile', () => {
    localStorage.setItem('floreren_lang', 'en')
    const masthead = createElement(CalendarMasthead, {
      year: 2026,
      month1: 7,
      todayDay: 13,
      viewMode: 'month',
      onPrev: vi.fn(),
      onNext: vi.fn(),
      onSetView: vi.fn(),
      plannedCount: 4,
      openCount: 1,
      environmentFilter: null,
    })

    act(() => root.render(createElement(LanguageProvider, null, masthead)))

    expect(container.textContent).toContain('July 2026')
    expect(container.textContent).toContain('Planned 4')
    expect(container.textContent).not.toContain('Juli')
  })
})

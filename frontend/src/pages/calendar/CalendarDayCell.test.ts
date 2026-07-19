// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarDayCell from './CalendarDayCell'
import type { CalendarEvent } from './calendarTypes'
import { LanguageProvider } from '../../context/LanguageContext'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function event(id: number): CalendarEvent {
  return {
    id: `schedule:${id}:water:0`,
    date: '2026-07-13',
    type: 'water',
    plant_id: id,
    plant_name: `Plant ${id}`,
    plant_icon_variant: null,
    schedule_id: id,
    map_id: 10,
    map_name: 'Achtertuin',
    overdue: false,
    severity: null,
    color: null,
    icon: null,
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: false,
  }
}

describe('CalendarDayCell workload', () => {
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

  it('communicates medium load with visible text and accessible date selection', () => {
    const onClick = vi.fn()
    act(() => root.render(createElement(CalendarDayCell, {
      day: 13,
      month0: 6,
      year: 2026,
      otherMonth: false,
      weekend: false,
      isToday: false,
      isSelected: false,
      events: [event(1), event(2), event(3)],
      load: 3,
      maxVisible: 2,
      onClick,
    })))

    const cell = container.querySelector('.day')
    expect(cell?.getAttribute('role')).toBe('button')
    expect(cell?.classList.contains('load-medium')).toBe(true)
    expect(container.querySelector('.day-load')?.textContent).toBe('3 sessies')
    expect(container.querySelector('.day-load')?.getAttribute('aria-label')).toBe('3 sessies')
  })

  it('provides an English today label to the CSS marker in English mode', () => {
    localStorage.setItem('floreren_lang', 'en')
    const cell = createElement(CalendarDayCell, {
      day: 13,
      month0: 6,
      year: 2026,
      otherMonth: false,
      weekend: false,
      isToday: true,
      isSelected: true,
      events: [],
      load: 0,
      maxVisible: 2,
      onClick: vi.fn(),
    })

    act(() => root.render(createElement(LanguageProvider, null, cell)))

    expect(container.querySelector('.day-num')?.getAttribute('data-today-label')).toBe('today')
  })

  it('renders completed care as a checked, read-only history marker', () => {
    localStorage.setItem('floreren_lang', 'en')
    const completed = {
      ...event(1),
      id: 'care-log:1',
      status: 'completed' as const,
    }
    const cell = createElement(CalendarDayCell, {
      day: 13,
      month0: 6,
      year: 2026,
      otherMonth: false,
      weekend: false,
      isToday: false,
      isSelected: false,
      events: [completed],
      load: 0,
      maxVisible: 2,
      onClick: vi.fn(),
    })

    act(() => root.render(createElement(LanguageProvider, null, cell)))

    const marker = container.querySelector('.ev.completed')
    expect(marker).not.toBeNull()
    expect(marker?.querySelector('.ev-completed-mark svg')).not.toBeNull()
    expect(marker?.getAttribute('aria-label')).toContain('Completed')
  })
})

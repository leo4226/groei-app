// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { CalendarEvent } from './calendarTypes'
import MoistureCheckDialog from './MoistureCheckDialog'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const session: CalendarEvent = {
  id: 'moisture:1:2026-07-16',
  date: '2026-07-16',
  type: 'moisture_check',
  plant_id: null,
  plant_name: null,
  plant_icon_variant: null,
  schedule_id: null,
  map_id: 1,
  map_name: 'Back garden',
  overdue: false,
  severity: 'info',
  color: null,
  icon: null,
  grouped: true,
  group_count: 2,
  group_member_schedule_ids: [11, 21],
  group_members: [
    {
      schedule_id: 11,
      plant_id: 1,
      plant_name: 'Rose',
      plant_icon_variant: null,
      reason_nl: 'De roos droogt sneller uit.',
      reason_en: 'The rose is drying faster.',
    },
    {
      schedule_id: 21,
      plant_id: 2,
      plant_name: 'Basil',
      plant_icon_variant: null,
      reason_nl: 'De basilicum droogt sneller uit.',
      reason_en: 'The basil is drying faster.',
    },
  ],
  weather_triggered: true,
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

describe('MoistureCheckDialog', () => {
  let container: HTMLDivElement
  let root: Root
  const onResolve = vi.fn()
  const onCancel = vi.fn()

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

  it('shows per-plant reasons and resolves only selected checks as watered', () => {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MoistureCheckDialog, {
          event: session,
          saving: false,
          onResolve,
          onCancel,
        }),
      ))
    })

    expect(container.textContent).toContain('Moisture check')
    expect(container.textContent).toContain('Back garden')
    expect(container.textContent).toContain('The rose is drying faster.')
    expect(container.textContent).toContain('The basil is drying faster.')

    const basil = container.querySelector('input[value="21"]') as HTMLInputElement
    act(() => basil.click())
    act(() => buttonWithText(container, 'Watered · 1 plant').click())

    expect(onResolve).toHaveBeenCalledWith([11], 'watered')
  })

  it('offers still moist without changing the plant selection implicitly', () => {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MoistureCheckDialog, {
          event: session,
          saving: false,
          onResolve,
          onCancel,
        }),
      ))
    })

    act(() => buttonWithText(container, 'Still moist · 2 plants').click())
    expect(onResolve).toHaveBeenCalledWith([11, 21], 'still_moist')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('disables both outcomes when no plants are selected', () => {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MoistureCheckDialog, {
          event: session,
          saving: false,
          onResolve,
          onCancel,
        }),
      ))
    })

    act(() => buttonWithText(container, 'Select none').click())
    expect(buttonWithText(container, 'Select at least one plant').disabled).toBe(true)
    const stillMoist = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Still moist')) as HTMLButtonElement
    expect(stillMoist.disabled).toBe(true)
  })
})

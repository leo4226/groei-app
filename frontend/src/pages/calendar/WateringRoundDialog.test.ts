// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { CalendarEvent } from './calendarTypes'
import WateringRoundDialog from './WateringRoundDialog'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const round: CalendarEvent = {
  id: 'garden:1:water:2026-07-15',
  date: '2026-07-15',
  type: 'water',
  plant_id: null,
  plant_name: null,
  plant_icon_variant: null,
  schedule_id: null,
  map_id: 1,
  map_name: 'Back garden',
  overdue: false,
  severity: null,
  color: null,
  icon: null,
  grouped: true,
  group_count: 2,
  group_member_schedule_ids: [10, 11],
  group_members: [
    {
      schedule_id: 10,
      plant_id: 1,
      plant_name: 'Rose',
      plant_icon_variant: null,
      canonical_date: '2026-07-16',
    },
    {
      schedule_id: 11,
      plant_id: 2,
      plant_name: 'Basil',
      plant_icon_variant: null,
      canonical_date: '2026-07-18',
    },
  ],
  weather_triggered: false,
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

describe('WateringRoundDialog', () => {
  let container: HTMLDivElement
  let root: Root
  const onConfirm = vi.fn()
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

  it('starts with all plants selected and confirms only plants still checked', () => {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(WateringRoundDialog, {
          event: round,
          saving: false,
          onConfirm,
          onCancel,
        }),
      ))
    })

    expect(container.textContent).toContain('Watering round')
    expect(container.textContent).toContain('Back garden')
    expect(container.textContent).toContain('Rose')
    expect(container.textContent).toContain('Basil')
    expect(container.textContent).toContain('Due 16-07-2026')
    const dueLabel = container.querySelector('[data-canonical-due="10"]')
    expect(dueLabel?.className).toContain('text-text-muted')
    expect(dueLabel?.className).not.toContain('text-amber')
    expect(dueLabel?.className).not.toContain('text-red')
    expect(buttonWithText(container, 'Water 2 plants').disabled).toBe(false)

    const basil = container.querySelector('input[value="11"]') as HTMLInputElement
    act(() => basil.click())
    expect(buttonWithText(container, 'Water 1 plant').disabled).toBe(false)

    act(() => buttonWithText(container, 'Water 1 plant').click())
    expect(onConfirm).toHaveBeenCalledWith([10])
  })

  it('supports clearing selection and canceling without a care request', () => {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(WateringRoundDialog, {
          event: round,
          saving: false,
          onConfirm,
          onCancel,
        }),
      ))
    })

    act(() => buttonWithText(container, 'Select none').click())
    expect(buttonWithText(container, 'Select at least one plant').disabled).toBe(true)

    act(() => buttonWithText(container, 'Cancel').click())
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps keyboard focus inside the modal and restores previous focus', () => {
    const previousButton = document.createElement('button')
    previousButton.textContent = 'Open watering round'
    document.body.insertBefore(previousButton, container)
    previousButton.focus()

    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(WateringRoundDialog, {
          event: round,
          saving: false,
          onConfirm,
          onCancel,
        }),
      ))
    })

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('*'))
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled'))
    const firstButton = focusable[0]
    const lastButton = focusable.at(-1)
    expect(document.activeElement).toBe(dialog)

    lastButton?.focus()
    act(() => document.dispatchEvent(new KeyboardEvent(
      'keydown', { key: 'Tab', bubbles: true },
    )))
    expect(document.activeElement).toBe(firstButton)

    firstButton.focus()
    act(() => document.dispatchEvent(new KeyboardEvent(
      'keydown', { key: 'Tab', shiftKey: true, bubbles: true },
    )))
    expect(document.activeElement).toBe(lastButton)

    act(() => root.render(null))
    expect(document.activeElement).toBe(previousButton)
    previousButton.remove()
  })
})

// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import type { MapWateringRoundData } from '../../api/client'
import MapWateringRoundSheet from './MapWateringRoundSheet'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const data: MapWateringRoundData = {
  map_id: 1,
  map_name: 'Back garden',
  members: [
    {
      schedule_id: 10,
      plant_id: 1,
      plant_name: 'Rose',
      plant_icon_variant: 'rose',
      canonical_date: '2026-07-25',
      rhythm_opt_out: false,
    },
    {
      schedule_id: 11,
      plant_id: 2,
      plant_name: 'Basil',
      plant_icon_variant: 'basil',
      canonical_date: '2026-07-26',
      rhythm_opt_out: true,
    },
  ],
  history: [
    {
      operation_id: 30,
      completed_at: '2026-07-20',
      completed_by: 1,
      completed_by_name: 'Leon',
      affected_count: 2,
      can_undo: true,
    },
    {
      operation_id: 29,
      completed_at: '2026-07-13',
      completed_by: 2,
      completed_by_name: 'Lisbeth',
      affected_count: 1,
      can_undo: false,
    },
    {
      operation_id: 28,
      completed_at: '2026-07-06',
      completed_by: 1,
      completed_by_name: 'Leon',
      affected_count: 2,
      can_undo: false,
    },
  ],
}

function buttonWithText(scope: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

describe('MapWateringRoundSheet', () => {
  let container: HTMLDivElement
  let root: Root
  const onConfirm = vi.fn()
  const onUndo = vi.fn()
  const onCancel = vi.fn()
  const onDateChange = vi.fn()
  const onRetry = vi.fn()

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

  it('selects all plants, confirms checked members, and exposes compact history', () => {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapWateringRoundSheet, {
          data,
          completedAt: '2026-07-23',
          saving: false,
          loading: false,
          error: 'complete_failed',
          onCompletedAtChange: onDateChange,
          onConfirm,
          onUndo,
          onRetry,
          onCancel,
        }),
      ))
    })

    expect(document.body.textContent).toContain('Watering round')
    expect(document.body.textContent).toContain('Back garden')
    expect(document.body.textContent).toContain('Last round')
    expect(document.body.textContent).toContain('Could not update the watering round')
    expect(document.body.textContent).toContain('20-07-2026')
    expect(document.body.textContent).toContain('Leon')
    expect(document.body.textContent).toContain('2 plants')
    expect(buttonWithText(document.body, 'Water 2 plants').disabled).toBe(false)

    const history = document.body.querySelector('details') as HTMLDetailsElement
    expect(history.open).toBe(false)
    const summary = history.querySelector('summary') as HTMLElement
    act(() => summary.click())
    expect(history.open).toBe(true)
    expect(history.querySelectorAll('[data-watering-history-row]')).toHaveLength(3)
    expect(buttonWithText(history, 'Undo')).toBeTruthy()

    const basil = document.body.querySelector('input[value="11"]') as HTMLInputElement
    act(() => basil.click())
    const dateInput = document.body.querySelector('input[type="date"]') as HTMLInputElement
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(dateInput, '2026-07-22')
      dateInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onDateChange).toHaveBeenCalledWith('2026-07-22')
    act(() => buttonWithText(document.body, 'Water 1 plant').click())
    expect(onConfirm).toHaveBeenCalledWith('2026-07-23', [10])

    act(() => buttonWithText(history, 'Undo').click())
    expect(onUndo).toHaveBeenCalledWith(30)
  })

  it('disables confirmation with no selected plants and handles Escape', () => {
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapWateringRoundSheet, {
          data,
          completedAt: '2026-07-23',
          saving: false,
          loading: false,
          error: null,
          onCompletedAtChange: onDateChange,
          onConfirm,
          onUndo,
          onRetry,
          onCancel,
        }),
      ))
    })

    act(() => buttonWithText(document.body, 'Select none').click())
    expect(buttonWithText(document.body, 'Select at least one plant').disabled).toBe(true)

    act(() => document.dispatchEvent(new KeyboardEvent(
      'keydown', { key: 'Escape', bubbles: true },
    )))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps a loading or failed initial request visible and retryable', () => {
    const baseProps = {
      data: null,
      completedAt: '2026-07-23',
      saving: false,
      error: null,
      onCompletedAtChange: onDateChange,
      onConfirm,
      onUndo,
      onRetry,
      onCancel,
    }
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapWateringRoundSheet, { ...baseProps, loading: true }),
      ))
    })
    expect(document.body.querySelector('[role="status"]')?.textContent)
      .toContain('Loading watering round')

    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapWateringRoundSheet, {
          ...baseProps,
          loading: false,
          error: 'load_failed',
        }),
      ))
    })
    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toContain('Could not load the watering round')
    act(() => buttonWithText(document.body, 'Try again').click())
    expect(onRetry).toHaveBeenCalledOnce()

    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapWateringRoundSheet, {
          ...baseProps,
          data,
          loading: true,
        }),
      ))
    })
    expect(buttonWithText(document.body, 'Water 2 plants').disabled).toBe(true)
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-busy')).toBe('true')
  })

  it('traps focus and restores the opening control on close', () => {
    const opener = document.createElement('button')
    document.body.insertBefore(opener, container)
    opener.focus()

    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(MapWateringRoundSheet, {
          data,
          completedAt: '2026-07-23',
          saving: false,
          loading: false,
          error: null,
          onCompletedAtChange: onDateChange,
          onConfirm,
          onUndo,
          onRetry,
          onCancel,
        }),
      ))
    })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('*'))
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled'))
    const first = focusable[0]
    const last = focusable.at(-1)
    expect(document.activeElement).toBe(dialog)

    last?.focus()
    act(() => document.dispatchEvent(new KeyboardEvent(
      'keydown', { key: 'Tab', bubbles: true },
    )))
    expect(document.activeElement).toBe(first)

    act(() => root.render(null))
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

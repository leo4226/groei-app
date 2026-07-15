// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CareScheduleEditor from './CareScheduleEditor'
import {
  EDITABLE_CARE_TYPES,
  type EditableCareType,
  type ScheduleEditorState,
} from '../../pages/editPlantCareSchedules'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const labels = Object.fromEntries(
  EDITABLE_CARE_TYPES.map((type) => [type, type]),
) as Record<EditableCareType, string>

function state(): ScheduleEditorState {
  return Object.fromEntries(EDITABLE_CARE_TYPES.map((type) => [type, {
    enabled: type === 'water',
    days: 7,
    rhythmEnabled: true,
  }])) as ScheduleEditorState
}

describe('CareScheduleEditor', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows a Water-only Care-rhythm switch and publishes opt-out state', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(createElement(CareScheduleEditor, {
        environment: 'indoor',
        intervalLabel: 'Interval',
        daysLabel: 'days',
        rhythmLabel: 'Follow Care rhythm',
        rhythmDescription: 'May move dates one day earlier.',
        labels,
        state: state(),
        onChange,
      }))
    })

    const rhythmSwitch = container.querySelector(
      'button[role="switch"][aria-label="Follow Care rhythm"]',
    ) as HTMLButtonElement
    expect(rhythmSwitch).not.toBeNull()
    expect(rhythmSwitch.getAttribute('aria-checked')).toBe('true')

    act(() => rhythmSwitch.click())
    expect(onChange.mock.calls[0][0].water.rhythmEnabled).toBe(false)
    expect(container.textContent?.match(/Follow Care rhythm/g)).toHaveLength(1)
  })
})

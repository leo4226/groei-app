import { describe, expect, it } from 'vitest'
import type { CareWarningOut } from '../types'
import { buildPlantDetailActions, careTypeFromActionText } from './plantCareRecommendations'

function warning(overrides: Partial<CareWarningOut>): CareWarningOut {
  return {
    care_type: 'fertilize',
    severity: 'warning',
    trigger: 'schedule_due_today',
    days_overdue: 0,
    message_nl: 'Bemesten vandaag',
    message_en: 'Fertilize due today',
    icon: '🌱',
    color: '#FFC233',
    reason_nl: null,
    reason_en: null,
    action_nl: null,
    action_en: null,
    weather_metric: null,
    weather_value_c: null,
    forecast_day_label_nl: null,
    forecast_day_label_en: null,
    ...overrides,
  }
}

describe('plant care recommendations', () => {
  it('recognizes fertilizing actions in Dutch and English phenology copy', () => {
    expect(careTypeFromActionText('Bemest elke twee weken')).toBe('fertilize')
    expect(careTypeFromActionText('Fertilize every two weeks')).toBe('fertilize')
  })

  it('suppresses phenology fertilizing actions when an active fertilize warning exists', () => {
    const actions = buildPlantDetailActions(
      [warning({ message_nl: 'Bemest om de 4 weken', message_en: 'Fertilize every 4 weeks' })],
      ['Bemest elke twee weken', 'Controleer de bladeren'],
      'nl-NL',
    )

    expect(actions).toEqual(['Controleer de bladeren'])
  })

  it('prefers warning actions before remaining seasonal phenology actions', () => {
    const actions = buildPlantDetailActions(
      [warning({
        care_type: 'heat_protect',
        action_nl: 'Geef vroeg of laat water; zet potten in de schaduw.',
        action_en: 'Water early or late; move pots to shade.',
      })],
      ['Controleer jonge scheuten'],
      'nl-NL',
    )

    expect(actions).toEqual([
      'Geef vroeg of laat water; zet potten in de schaduw.',
      'Controleer jonge scheuten',
    ])
  })
})

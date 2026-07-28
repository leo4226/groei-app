import { describe, expect, it } from 'vitest'
import type { WeatherWarningGroupOut } from '../../../types'
import {
  activeWeatherWarningCount,
  partitionWeatherWarnings,
  weatherWarningPlantIds,
} from '../weatherWarningModel'

function advisory(overrides: Partial<WeatherWarningGroupOut> = {}): WeatherWarningGroupOut {
  return {
    warning_id: 'weather:heat-warning',
    care_type: 'heat_protect',
    severity: 'warning',
    trigger: 'weather_event',
    days_overdue: null,
    message_nl: 'Morgen hitte op komst — max 33°C',
    message_en: 'Heat building tomorrow — max 33°C',
    icon: '🔥',
    color: '#e08049',
    forecast_date: '2026-07-30',
    acknowledged_at: null,
    affected_plant_ids: [4, 2, 4],
    map_names: ['Back Garden'],
    ...overrides,
  }
}

describe('weather warning presentation model', () => {
  it('keeps acknowledged guidance recoverable without counting it as active', () => {
    const active = advisory()
    const seen = advisory({
      warning_id: 'weather:frost-seen',
      care_type: 'frost_protect',
      acknowledged_at: '2026-07-28T09:00:00',
    })

    expect(partitionWeatherWarnings([seen, active])).toEqual({
      active: [active],
      seen: [seen],
    })
    expect(activeWeatherWarningCount([seen, active])).toBe(1)
  })

  it('returns a deduplicated set of affected plants for highlight mode', () => {
    expect([...weatherWarningPlantIds(advisory())].sort((a, b) => a - b)).toEqual([2, 4])
  })
})

import { describe, expect, it } from 'vitest'
import type { Phenology } from '../../types'
import {
  filterSeasonalPlantsByEnvironment,
  seasonalPhaseLabel,
  summarizeSeasonalMonth,
} from './seasonalMonthModel'

function phenology(): Phenology {
  return {
    months: [{
      month: 7,
      phase: 'flowering',
      phase_label_nl: 'Bloei',
      phase_label_en: 'Flowering',
      sun_hours_needed: 6,
      description_nl: 'In bloei',
      description_en: 'In bloom',
      actions_nl: [],
      actions_en: [],
    }],
    sow_window: [],
    transplant_window: [],
    harvest_window: [],
    frost_sensitive: false,
    min_temp_c: null,
    max_height_cm: null,
    max_spread_cm: null,
    interesting_facts_nl: '',
    interesting_facts_en: '',
    climate_zone: '8a',
  }
}

describe('summarizeSeasonalMonth', () => {
  it('shares flowering classification without inventing an exact day', () => {
    const plant = { id: 7, phenology: phenology() }

    const summary = summarizeSeasonalMonth([plant], 7)

    expect(summary.growing.map(entry => entry.plant.id)).toEqual([7])
    expect(summary.context.bloom.map(entry => entry.plant.id)).toEqual([7])
    expect(summary.context.bloom[0]).not.toHaveProperty('date')
  })

  it('shares sow, transplant, and harvest windows with the action bucket', () => {
    const data = phenology()
    data.months[0].phase = 'dormant'
    data.sow_window = [7]
    data.transplant_window = [7]
    data.harvest_window = [7]
    const plant = { id: 11, phenology: data }

    const summary = summarizeSeasonalMonth([plant], 7)

    expect(summary.needsAction.map(entry => entry.plant.id)).toEqual([11])
    expect(summary.growing).toEqual([])
    expect(summary.dormant).toEqual([])
    expect(summary.context.sow.map(entry => entry.plant.id)).toEqual([11])
    expect(summary.context.transplant.map(entry => entry.plant.id)).toEqual([11])
    expect(summary.context.harvest.map(entry => entry.plant.id)).toEqual([11])
  })

  it('does not cross-fill a missing English phase label from Dutch', () => {
    const monthData = phenology().months[0]
    monthData.phase_label_en = undefined

    expect(seasonalPhaseLabel(monthData, 'en-US')).toBeNull()
    expect(seasonalPhaseLabel(monthData, 'nl-NL')).toBe('Bloei')
  })

  it('matches the Calendar environment filter using map type', () => {
    const plants = [
      { id: 1, map_id: 10 },
      { id: 2, map_id: 20 },
      { id: 3, map_id: null },
    ]
    const maps = [
      { id: 10, map_type: 'outdoor' as const },
      { id: 20, map_type: 'indoor' as const },
    ]

    expect(filterSeasonalPlantsByEnvironment(plants, maps, 'all').map(plant => plant.id))
      .toEqual([1, 2, 3])
    expect(filterSeasonalPlantsByEnvironment(plants, maps, 'tuin').map(plant => plant.id))
      .toEqual([1])
    expect(filterSeasonalPlantsByEnvironment(plants, maps, 'huis').map(plant => plant.id))
      .toEqual([2])
  })
})

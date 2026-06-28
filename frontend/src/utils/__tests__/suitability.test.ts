import { describe, it, expect } from 'vitest'
import { computeSuitability } from '../suitability'
import type { Phenology } from '../../types'

function makePhenology(overrides?: Partial<Phenology>): Phenology {
  return {
    id: 1,
    months: [
      {
        month: 6,
        phase: 'growing',
        phase_label_nl: 'Groeien',
        phase_label_en: 'Growing',
        sun_hours_needed: 4,
        description_nl: 'Blijf water geven en bemesten.',
        description_en: 'Continue watering and fertilizing.',
        actions_nl: ['Geef water als de grond droog is'],
        actions_en: ['Water when soil is dry'],
      },
    ],
    ...overrides,
  }
}

describe('computeSuitability', () => {
  it('returns unknown when phenology is null', () => {
    const result = computeSuitability(null, 0, 6, 'nl-NL')
    expect(result.status).toBe('unknown')
    expect(result.detailLabel).toBe('Geen soortdata beschikbaar')
  })

  it('returns good with sun text when outdoor plant has enough sun', () => {
    const phenology = makePhenology()
    const result = computeSuitability(phenology, 6, 6, 'nl-NL')
    expect(result.status).toBe('good')
    expect(result.detailLabel).toContain('heeft genoeg zon')
    expect(result.detailLabel).not.toContain('0.0h')
  })

  it('shows sun deficit text for outdoor plant with too little sun', () => {
    const phenology = makePhenology()
    const result = computeSuitability(phenology, 0.5, 6, 'nl-NL')
    expect(result.status).toBe('too_little')
    expect(result.detailLabel).toContain('0.5u')
    expect(result.detailLabel).toContain('heeft 4u nodig')
  })

  it('omits sun deficit text when sunHoursAtSpot is null (indoor map)', () => {
    const phenology = makePhenology()
    const result = computeSuitability(phenology, null, 6, 'nl-NL')
    expect(result.status).toBe('good')
    expect(result.detailLabel).toBe('Blijf water geven en bemesten.')
    expect(result.detailLabel).not.toContain('zon')
    expect(result.detailLabel).not.toContain('sun')
    expect(result.detailLabel).not.toContain('0.0h')
  })

  it('still shows actions for indoor plants', () => {
    const phenology = makePhenology()
    const result = computeSuitability(phenology, null, 6, 'nl-NL')
    expect(result.actions.length).toBeGreaterThan(0)
  })

  it('returns dormant status for dormant phase without sun data', () => {
    const phenology = makePhenology({
      months: [
        {
          month: 1,
          phase: 'dormant',
          phase_label_nl: 'Rust',
          phase_label_en: 'Dormant',
          sun_hours_needed: 0,
          description_nl: 'Niet veel doen.',
          description_en: 'Not much to do.',
          actions_nl: [],
          actions_en: [],
        },
      ],
    })
    const result = computeSuitability(phenology, null, 1, 'nl-NL')
    expect(result.status).toBe('dormant')
    expect(result.detailLabel).toBe('Niet veel doen.')
  })

  it('omits sun deficit text for English indoor plants', () => {
    const phenology = makePhenology()
    const result = computeSuitability(phenology, null, 6, 'en-US')
    expect(result.status).toBe('good')
    expect(result.detailLabel).toBe('Continue watering and fertilizing.')
    expect(result.detailLabel).not.toContain('sun')
    expect(result.detailLabel).not.toContain('0.0h')
  })
})

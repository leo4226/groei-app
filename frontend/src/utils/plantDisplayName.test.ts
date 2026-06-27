import { describe, expect, it } from 'vitest'
import { plantDisplayName, plantSearchText } from './plantDisplayName'

const basePlant = {
  id: 1,
  name: 'Gatenplant in de hoek',
  species: 'Monstera deliciosa',
  species_common_name_nl: 'Gatenplant',
  species_common_name_en: 'Swiss cheese plant',
}

describe('plantDisplayName', () => {
  it('uses the Dutch species common name for Dutch UI', () => {
    expect(plantDisplayName(basePlant, 'nl-NL')).toBe('Gatenplant')
  })

  it('uses the English species common name for English UI', () => {
    expect(plantDisplayName(basePlant, 'en-GB')).toBe('Swiss cheese plant')
  })

  it('falls back to the user-entered plant name when the localized species name is missing', () => {
    expect(plantDisplayName({ ...basePlant, species_common_name_en: '   ' }, 'en-GB')).toBe('Gatenplant in de hoek')
    expect(plantDisplayName({ ...basePlant, species_common_name_nl: null }, 'nl-NL')).toBe('Gatenplant in de hoek')
  })
})

describe('plantSearchText', () => {
  it('includes displayed and raw names so localized plant cards remain searchable', () => {
    expect(plantSearchText(basePlant, 'en-GB')).toContain('swiss cheese plant')
    expect(plantSearchText(basePlant, 'en-GB')).toContain('gatenplant in de hoek')
    expect(plantSearchText(basePlant, 'en-GB')).toContain('monstera deliciosa')
  })
})

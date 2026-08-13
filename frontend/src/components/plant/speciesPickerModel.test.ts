import { describe, expect, it } from 'vitest'
import {
  speciesChanged,
  speciesHitLabel,
  speciesValueFor,
} from './speciesPickerModel'
import type { SpeciesSearchHit } from '../../types'

function hit(overrides: Partial<SpeciesSearchHit> = {}): SpeciesSearchHit {
  return {
    id: 1,
    slug: 'monstera-deliciosa',
    common_name_nl: 'Gatenplant',
    common_name_en: 'Swiss cheese plant',
    latin_name: 'Monstera deliciosa',
    ...overrides,
  }
}

describe('speciesValueFor', () => {
  it('writes the latin name so the backend lookup is language-independent', () => {
    // _find_species_by_name matches latin OR common name; the latin name means
    // a Dutch and an English user picking the same plant store the same string.
    expect(speciesValueFor(hit())).toBe('Monstera deliciosa')
  })

  it('falls back to a common name rather than writing nothing', () => {
    // An empty value reads as "un-identify me" (#886 P1-2), which is a very
    // different instruction from "this is the species I picked".
    expect(speciesValueFor(hit({ latin_name: null }))).toBe('Gatenplant')
    expect(speciesValueFor(hit({ latin_name: null, common_name_nl: null })))
      .toBe('Swiss cheese plant')
  })

  it('returns an empty string for a hit with no names at all', () => {
    expect(speciesValueFor(hit({
      latin_name: null, common_name_nl: null, common_name_en: null,
    }))).toBe('')
  })
})

describe('speciesHitLabel', () => {
  it('leads with the latin name and follows the UI language underneath', () => {
    expect(speciesHitLabel(hit(), false)).toEqual({
      primary: 'Monstera deliciosa', secondary: 'Gatenplant',
    })
    expect(speciesHitLabel(hit(), true)).toEqual({
      primary: 'Monstera deliciosa', secondary: 'Swiss cheese plant',
    })
  })

  it('falls back to the other language rather than showing a blank line', () => {
    expect(speciesHitLabel(hit({ common_name_en: null }), true).secondary)
      .toBe('Gatenplant')
  })

  it('promotes the common name when there is no latin name', () => {
    expect(speciesHitLabel(hit({ latin_name: null }), false)).toEqual({
      primary: 'Gatenplant', secondary: null,
    })
  })
})

describe('speciesChanged', () => {
  it('mirrors the backend: case and whitespace are noise', () => {
    // _species_text_changed ignores both, so a capitalisation fix must not warn
    // that the plant is about to be re-identified.
    expect(speciesChanged('Rosa canina', '  rosa canina ')).toBe(false)
    expect(speciesChanged('Rosa canina', 'Rosa canina')).toBe(false)
  })

  it('flags a real rename and a clear', () => {
    expect(speciesChanged('Rosa canina', 'Urtica dioica')).toBe(true)
    expect(speciesChanged('Rosa canina', '')).toBe(true)
  })

  it('treats a plant with no species as unchanged while the field is empty', () => {
    expect(speciesChanged(null, '')).toBe(false)
    expect(speciesChanged(null, '   ')).toBe(false)
    expect(speciesChanged(null, 'Rosa canina')).toBe(true)
  })
})

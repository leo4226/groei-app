import { describe, expect, it } from 'vitest'
import { wikipediaLanguage, wikipediaPlantUrl, wikipediaTitleCandidates } from '../plantReferenceLinks'

describe('wikipediaTitleCandidates', () => {
  it('keeps a clean binomial as-is, then offers the genus', () => {
    expect(wikipediaTitleCandidates('Bellis perennis')).toEqual(['Bellis perennis', 'Bellis'])
  })

  it('strips author citations — the most common reason the link found nothing', () => {
    // "Taraxacum officinale F.H.Wigg." 404s on both wikis; the binomial does not.
    expect(wikipediaTitleCandidates('Taraxacum officinale F.H.Wigg.'))
      .toEqual(['Taraxacum officinale F.H.Wigg.', 'Taraxacum officinale', 'Taraxacum'])
  })

  it('strips cultivar epithets', () => {
    expect(wikipediaTitleCandidates("Hedera helix 'Goldheart'"))
      .toEqual(["Hedera helix 'Goldheart'", 'Hedera helix', 'Hedera'])
  })

  it('strips aggregate and uncertainty markers', () => {
    expect(wikipediaTitleCandidates('Rubus fruticosus agg.'))
      .toEqual(['Rubus fruticosus agg.', 'Rubus fruticosus', 'Rubus'])
    expect(wikipediaTitleCandidates('cf. Bromus hordeaceus'))
      .toEqual(['cf. Bromus hordeaceus', 'Bromus hordeaceus', 'Bromus'])
  })

  it('tries the subspecies title before falling back to the species', () => {
    // nl.wikipedia has "Plantago major subsp. major"; en.wikipedia does not.
    expect(wikipediaTitleCandidates('Plantago major subsp. major'))
      .toEqual(['Plantago major subsp. major', 'Plantago major', 'Plantago'])
  })

  it('keeps hybrid names in Wikipedia’s form', () => {
    expect(wikipediaTitleCandidates('Platanus × hispanica'))
      .toEqual(['Platanus × hispanica', 'Platanus'])
  })

  it('falls back to the genus for a genus-only identification', () => {
    expect(wikipediaTitleCandidates('Taraxacum sp.')).toEqual(['Taraxacum sp.', 'Taraxacum'])
    expect(wikipediaTitleCandidates('Taraxacum')).toEqual(['Taraxacum'])
  })

  it('handles empty and whitespace input', () => {
    expect(wikipediaTitleCandidates('')).toEqual([])
    expect(wikipediaTitleCandidates('   ')).toEqual([])
  })
})

describe('wikipediaLanguage / wikipediaPlantUrl', () => {
  it('picks the wiki for the reader’s language', () => {
    expect(wikipediaLanguage('nl-NL')).toBe('nl')
    expect(wikipediaLanguage('en-GB')).toBe('en')
  })

  it('still builds a search URL for the no-article fallback', () => {
    expect(wikipediaPlantUrl('Bellis perennis', 'nl-NL'))
      .toBe('https://nl.wikipedia.org/wiki/Special:Search?search=Bellis%20perennis')
  })
})

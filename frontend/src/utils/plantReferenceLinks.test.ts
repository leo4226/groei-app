import { describe, expect, it } from 'vitest'
import { wikipediaPlantUrl } from './plantReferenceLinks'

describe('wikipediaPlantUrl', () => {
  it('uses the active language and scientific name', () => {
    expect(wikipediaPlantUrl('Taraxacum officinale', 'nl-NL'))
      .toBe('https://nl.wikipedia.org/wiki/Special:Search?search=Taraxacum%20officinale')
    expect(wikipediaPlantUrl('Acer campestre', 'en-GB'))
      .toBe('https://en.wikipedia.org/wiki/Special:Search?search=Acer%20campestre')
  })
})

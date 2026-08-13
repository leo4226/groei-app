import { describe, it, expect } from 'vitest'
import { buildCreatePayload, zoneAdviceKey } from '../prefill'
import { PICKABLE_PLANTS, PICKABLE_SPECIES_COUNT, matchesPlantQuery } from '../../../data/pickableSpecies'

const base = {
  name: 'Mien',
  species: 'Monstera deliciosa',
  notes: '',
  sunRequirement: null,
  kind: 'manual' as const,
  careSchedules: [],
}

// ── P1-1: the six fields the form used to collect and throw away ──

describe('buildCreatePayload — container / provenance detail', () => {
  it('carries every container field through to the payload', () => {
    const p = buildCreatePayload({
      ...base,
      formType: 'pot',
      potMaterial: 'terracotta',
      potDiameterCm: 18,
      potHeightCm: 22,
      hasDrainage: true,
      substrate: ['potgrond', 'perliet'],
      acquiredFrom: 'Tuincentrum',
    })

    expect(p.form_type).toBe('pot')
    expect(p.pot_material).toBe('terracotta')
    expect(p.pot_diameter_cm).toBe(18)
    expect(p.pot_height_cm).toBe(22)
    expect(p.has_drainage).toBe(true)
    expect(p.substrate).toEqual(['potgrond', 'perliet'])
    expect(p.acquired_from).toBe('Tuincentrum')
  })

  it('omits an empty substrate rather than sending []', () => {
    const p = buildCreatePayload({ ...base, substrate: [] })
    expect(p.substrate).toBeUndefined()
  })

  it('trims acquiredFrom and drops it when blank', () => {
    expect(buildCreatePayload({ ...base, acquiredFrom: '  Tuincentrum ' }).acquired_from)
      .toBe('Tuincentrum')
    expect(buildCreatePayload({ ...base, acquiredFrom: '   ' }).acquired_from)
      .toBeUndefined()
  })

  it('leaves the fields undefined when the user never opened DETAILS', () => {
    const p = buildCreatePayload(base)
    expect(p.pot_material).toBeUndefined()
    expect(p.pot_diameter_cm).toBeUndefined()
    expect(p.has_drainage).toBeUndefined()
    expect(p.substrate).toBeUndefined()
  })
})

// ── P1-3: zone advice must follow the sun requirement, not one fixed line ──

describe('zoneAdviceKey', () => {
  it('maps each light tile to its own advice', () => {
    // The "tiles" are the canonical sun requirements since #886; the five-value
    // tile vocabulary they used to carry is covered by the case below.
    expect(zoneAdviceKey('shade')).toBe('shade')
    expect(zoneAdviceKey('partial_sun')).toBe('indirect')
    expect(zoneAdviceKey('full_sun')).toBe('fullSun')
  })

  it('still resolves advice for the retired tile spellings (#886)', () => {
    // Plants saved before the Light row was collapsed onto the canonical three
    // still carry these; advice must not go silent for them.
    expect(zoneAdviceKey('dark')).toBe('shade')
    expect(zoneAdviceKey('bright')).toBe('indirect')
    expect(zoneAdviceKey('indirect')).toBe('indirect')
    expect(zoneAdviceKey('full-sun')).toBe('fullSun')
  })

  it('does not claim a full-sun plant wants shade', () => {
    // The old copy told every species it "prefers a bright spot without direct
    // sunlight" — including plants explicitly marked full sun.
    expect(zoneAdviceKey('full_sun')).not.toBe('indirect')
  })

  it('stays silent when the sun requirement is unknown', () => {
    expect(zoneAdviceKey(null)).toBeNull()
    expect(zoneAdviceKey(undefined)).toBeNull()
    expect(zoneAdviceKey('')).toBeNull()
    expect(zoneAdviceKey('something-else')).toBeNull()
  })
})

// ── P1-4: the advertised species count must be the picker's real inventory ──

describe('PICKABLE_SPECIES_COUNT', () => {
  it('matches the number of plants the picker actually shows', () => {
    expect(PICKABLE_SPECIES_COUNT).toBe(PICKABLE_PLANTS.length)
  })

  it('counts the whole dataset', () => {
    // The picker offers every curated plant, and each now has its own icon.
    // See data/__tests__/pickableSpecies.test.ts for the artwork guarantees.
    expect(PICKABLE_SPECIES_COUNT).toBe(PICKABLE_PLANTS.length)
    expect(PICKABLE_PLANTS.every((p) => p.iconKey)).toBe(true)
  })

  it('is nowhere near the 2891 the banner used to advertise', () => {
    expect(PICKABLE_SPECIES_COUNT).toBeGreaterThan(0)
    expect(PICKABLE_SPECIES_COUNT).toBeLessThan(2891)
  })
})

// ── P2-5: search must match the names the picker displays ──

describe('matchesPlantQuery', () => {
  const plant = {
    dutchName: 'Lelietje-van-dalen',
    englishName: 'Lily of the valley',
    latinName: 'Convallaria majalis',
  } as Parameters<typeof matchesPlantQuery>[0]

  it('matches the English name an English-mode user can see on screen', () => {
    // The picker renders englishName in en mode but only searched the Dutch and
    // Latin names, so this query used to return "no plants found".
    expect(matchesPlantQuery(plant, 'lily')).toBe(true)
    expect(matchesPlantQuery(plant, 'Valley')).toBe(true)
  })

  it('still matches Dutch and Latin names', () => {
    expect(matchesPlantQuery(plant, 'lelietje')).toBe(true)
    expect(matchesPlantQuery(plant, 'convallaria')).toBe(true)
  })

  it('is case-insensitive and ignores surrounding space', () => {
    expect(matchesPlantQuery(plant, '  CONVALLARIA  ')).toBe(true)
  })

  it('matches everything on an empty query, nothing on a miss', () => {
    expect(matchesPlantQuery(plant, '')).toBe(true)
    expect(matchesPlantQuery(plant, '   ')).toBe(true)
    expect(matchesPlantQuery(plant, 'monstera')).toBe(false)
  })

  it('tolerates a missing English name', () => {
    const noEnglish = { ...plant, englishName: undefined } as typeof plant
    expect(matchesPlantQuery(noEnglish, 'lily')).toBe(false)
    expect(matchesPlantQuery(noEnglish, 'lelietje')).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import type { LocalPlant } from '../../../data/plants-dataset'
import type { IdentifyCommitResult } from '../../../types'
import {
  normalizePrefill,
  buildInitialSchedules,
  buildSchedules,
  thresholdsToScheduleOverrides,
  sunPreferenceToTile,
  findMatchingIcon,
  buildCreatePayload,
} from '../prefill'

// ── fixtures ──

const dbPlant: LocalPlant = {
  id: 'monstera',
  dutchName: 'Gatenplant',
  latinName: 'Monstera deliciosa',
  commonName: 'Swiss cheese plant',
  iconKey: null,
  sunRequirement: 'partial_sun',
  minSunHours: 2,
  maxSunHours: 5,
  waterNeeds: 'gemiddeld',
  type: 'klimmer',
  bloomMonths: [],
  maxHeightCm: 300,
  amsterdamNotes: 'Houdt van indirect licht.',
  companionTags: [],
  availableInNL: true,
}

const identifyPrefill: IdentifyCommitResult = {
  species_id: 42,
  name_nl_suggested: 'Gatenplant',
  scientific_name: 'Monstera deliciosa',
  icon_key: 'monstera',
  care_thresholds: { water_interval_days: 10, fertilise_months: [4, 5, 6, 7, 8] },
  photo_path: '/photos/abc.jpg',
}

describe('normalizePrefill', () => {
  it('kind=none for no prefill', () => {
    const n = normalizePrefill(undefined)
    expect(n).toMatchObject({ kind: 'none', name: '', species: '', sunRequirement: null, formType: 'pot' })
    expect(normalizePrefill(null).kind).toBe('none')
  })

  it('kind=identify maps name/species/species_id/thresholds, leaves sun null', () => {
    const n = normalizePrefill(identifyPrefill)
    expect(n.kind).toBe('identify')
    expect(n.name).toBe('Gatenplant')
    expect(n.species).toBe('Monstera deliciosa')
    expect(n.speciesId).toBe(42)
    expect(n.iconKeyHint).toBe('monstera')
    expect(n.careThresholds).toEqual({ water_interval_days: 10, fertilise_months: [4, 5, 6, 7, 8] })
    expect(n.photoPath).toBe('/photos/abc.jpg')
    expect(n.sunRequirement).toBeNull() // filled later by the ecology fetch
  })

  it('kind=database maps Dutch/Latin/notes/sun-tile/formType', () => {
    const n = normalizePrefill(dbPlant)
    expect(n.kind).toBe('database')
    expect(n.name).toBe('Gatenplant')
    expect(n.species).toBe('Monstera deliciosa')
    expect(n.notes).toBe('Houdt van indirect licht.')
    expect(n.sunRequirement).toBe('indirect') // partial_sun -> indirect tile
    expect(n.formType).toBe('pot') // klimmer -> pot
    expect(n.careThresholds).toBeNull()
  })

  it('kind=manual defaults species to the typed name (legacy behaviour)', () => {
    const n = normalizePrefill({ name: 'Mijn plantje' })
    expect(n.kind).toBe('manual')
    expect(n.name).toBe('Mijn plantje')
    expect(n.species).toBe('Mijn plantje')
    expect(n.sunRequirement).toBeNull()
  })
})

describe('buildInitialSchedules', () => {
  it('database waterNeeds maps to the water interval', () => {
    const s = buildInitialSchedules(dbPlant) // gemiddeld -> 7
    expect(s.water.days).toBe(7)
    expect(s.water.enabled).toBe(true)
  })

  it('identify prefill uses indoor defaults (water-needs branch skipped)', () => {
    const s = buildInitialSchedules(identifyPrefill)
    expect(s.water.days).toBe(7) // CARE_TYPE_INFO.water.defaultIndoor
  })

  it('repot_check is disabled by default', () => {
    const s = buildInitialSchedules(undefined)
    // Keep the historical test case while asserting the canonical replacement.
    expect((s as Record<string, unknown>).repot_check).toBeUndefined()
    expect(s.repot.enabled).toBe(false)
  })
})

describe('thresholdsToScheduleOverrides', () => {
  it('maps water_interval_days to a water override', () => {
    expect(thresholdsToScheduleOverrides({ water_interval_days: 10 }).water).toEqual({ enabled: true, days: 10 })
  })

  it('maps fertilise_months to an interval mirroring the backend (max(30, floor(365/n)))', () => {
    // 5 months -> floor(365/5)=73
    expect(thresholdsToScheduleOverrides({ fertilise_months: [4, 5, 6, 7, 8] }).fertilize).toEqual({ enabled: true, days: 73 })
    // 12 months -> floor(365/12)=30 -> clamped at 30
    expect(thresholdsToScheduleOverrides({ fertilise_months: Array.from({ length: 12 }, (_, i) => i + 1) }).fertilize).toEqual({ enabled: true, days: 30 })
  })

  it('yields no overrides for empty / missing / malformed thresholds', () => {
    expect(thresholdsToScheduleOverrides(null)).toEqual({})
    expect(thresholdsToScheduleOverrides({})).toEqual({})
    expect(thresholdsToScheduleOverrides({ water_interval_days: 0, fertilise_months: [] })).toEqual({})
    expect(thresholdsToScheduleOverrides({ water_interval_days: 'nope' as unknown as number })).toEqual({})
  })
})

describe('buildSchedules (overlay)', () => {
  it('overlays photo-ID thresholds onto the identify defaults', () => {
    const s = buildSchedules(identifyPrefill, identifyPrefill.care_thresholds)
    expect(s.water.days).toBe(10)          // from care_thresholds, not the indoor default
    expect(s.fertilize.days).toBe(73)      // from fertilise_months
    expect(s.fertilize.enabled).toBe(true)
  })

  it('database path is unchanged when no thresholds are supplied', () => {
    const s = buildSchedules(dbPlant, null)
    expect(s.water.days).toBe(7) // gemiddeld
  })
})

describe('sunPreferenceToTile', () => {
  it('maps each species sun_preference value to a tile', () => {
    expect(sunPreferenceToTile('full_sun')).toBe('full-sun')
    expect(sunPreferenceToTile('partial_sun')).toBe('indirect')
    expect(sunPreferenceToTile('shade')).toBe('shade')
  })

  it('returns null for unknown / missing values', () => {
    expect(sunPreferenceToTile(null)).toBeNull()
    expect(sunPreferenceToTile(undefined)).toBeNull()
    expect(sunPreferenceToTile('')).toBeNull()
    expect(sunPreferenceToTile('twilight')).toBeNull()
  })
})

describe('findMatchingIcon', () => {
  const catalog = [
    { id: 'monstera', sci: 'Monstera deliciosa', name: 'Gatenplant', variant_of: null, form: 'potted' },
    { id: 'ficus', sci: 'Ficus elastica', name: 'Rubberboom', variant_of: null, form: 'potted' },
  ] as unknown as Parameters<typeof findMatchingIcon>[1]

  it('prefers an explicit iconKey', () => {
    expect(findMatchingIcon({ ...dbPlant, iconKey: 'ficus' }, catalog)).toBe('ficus')
  })

  it('falls back to exact Latin name', () => {
    expect(findMatchingIcon({ ...dbPlant, iconKey: null }, catalog)).toBe('monstera')
  })

  it('falls back to exact Dutch name', () => {
    const p = { ...dbPlant, iconKey: null, latinName: '', dutchName: 'Rubberboom' }
    expect(findMatchingIcon(p, catalog)).toBe('ficus')
  })

  it('falls back to genus when nothing else matches', () => {
    const p = { ...dbPlant, iconKey: null, dutchName: '', latinName: 'Monstera adansonii' }
    expect(findMatchingIcon(p, catalog)).toBe('monstera')
  })

  it('returns null when no match', () => {
    const p = { ...dbPlant, iconKey: null, dutchName: '', latinName: 'Quercus robur' }
    expect(findMatchingIcon(p, catalog)).toBeNull()
  })
})

describe('buildCreatePayload', () => {
  const base = {
    name: 'Mien',
    species: 'Monstera deliciosa',
    notes: '',
    sunRequirement: 'indirect',
    careSchedules: [{ care_type: 'water' as const, interval_days: 7 }],
  }

  it('database path maps plant_type via DUTCH_TYPE_TO_SYSTEM and sun via SUN_TILE_TO_DB', () => {
    const p = buildCreatePayload({ ...base, kind: 'database', databaseType: 'klimmer' })
    expect(p.plant_type).toBe('climber')      // klimmer -> climber
    expect(p.sun_requirement).toBe('partial_sun') // indirect -> partial_sun
    expect(p.name).toBe('Mien')
    expect(p.species).toBe('Monstera deliciosa')
    expect(p.care_schedules).toHaveLength(1)
  })

  it('identify path uses the icon-derived plant_type', () => {
    const p = buildCreatePayload({ ...base, kind: 'identify', derivedPlantType: 'foliage' })
    expect(p.plant_type).toBe('foliage')
  })

  it('identify path omits plant_type when it cannot be resolved', () => {
    const p = buildCreatePayload({ ...base, kind: 'identify', derivedPlantType: undefined })
    expect(p.plant_type).toBeUndefined()
  })

  it('trims name/species and drops empty species', () => {
    const p = buildCreatePayload({ ...base, name: '  Mien  ', species: '   ', kind: 'manual' })
    expect(p.name).toBe('Mien')
    expect(p.species).toBeUndefined()
  })
})

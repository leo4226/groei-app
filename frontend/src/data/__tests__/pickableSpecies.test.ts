import { describe, it, expect } from 'vitest'

// Vite resolves these at collect time — no node:fs, so the app tsconfig
// (types: ["vite/client"]) still type-checks this file.
const ICON_FILES = new Set(
  Object.keys(import.meta.glob('../../../public/icons/*.svg'))
    .map((path) => path.split('/').pop()!.replace(/\.svg$/, '')),
)
const ICON_MANIFEST = Object.values(
  import.meta.glob('../../../public/icons/manifest.json', { eager: true, import: 'default' }),
)[0] as { plants?: { id: string }[] } | { id: string }[]
import { PICKABLE_PLANTS, PICKABLE_SPECIES_COUNT, PLANTS_AWAITING_ICON, displayPlantName } from '../pickableSpecies'
import { LOCAL_PLANTS } from '../plants-dataset'

describe('displayPlantName', () => {
  const lily = {
    dutchName: 'Lelietje-van-dalen',
    englishName: 'Lily of the valley',
  } as Parameters<typeof displayPlantName>[0]

  it('gives the English name in en, so the prefilled nickname matches the tile', () => {
    // Picking the tile labelled "Lily of the valley" used to prefill
    // "Lelietje-van-dalen" — the picker rendered one name and the form another.
    expect(displayPlantName(lily, 'en')).toBe('Lily of the valley')
    expect(displayPlantName(lily, 'en-GB')).toBe('Lily of the valley')
  })

  it('gives the Dutch name in nl', () => {
    expect(displayPlantName(lily, 'nl')).toBe('Lelietje-van-dalen')
  })

  it('falls back to Dutch when a curated entry has no English name', () => {
    const noEnglish = { dutchName: 'Zonnehoed', englishName: '' } as typeof lily
    expect(displayPlantName(noEnglish, 'en')).toBe('Zonnehoed')

    const missing = { dutchName: 'Zonnehoed' } as typeof lily
    expect(displayPlantName(missing, 'en')).toBe('Zonnehoed')
  })

  it('ignores whitespace-only English names', () => {
    const blank = { dutchName: 'Camelia', englishName: '   ' } as typeof lily
    expect(displayPlantName(blank, 'en')).toBe('Camelia')
  })
})

describe('picker inventory', () => {
  const iconKeys = () =>
    [...new Set(PICKABLE_PLANTS.map((p) => p.iconKey).filter((k): k is string => !!k))]

  it('offers the whole dataset, not just the plants that have artwork', () => {
    // Filtering on iconKey hid 22 curated plants from the one screen whose job
    // is choosing a plant.
    expect(PICKABLE_PLANTS).toEqual(LOCAL_PLANTS)
    expect(PICKABLE_SPECIES_COUNT).toBe(LOCAL_PLANTS.length)
  })

  it('accounts for every plant as either iconned or awaiting artwork', () => {
    expect(PLANTS_AWAITING_ICON.every((p) => !p.iconKey)).toBe(true)
    expect(PICKABLE_SPECIES_COUNT - PLANTS_AWAITING_ICON.length)
      .toBe(LOCAL_PLANTS.filter((p) => p.iconKey).length)
  })

  it('every icon that IS set resolves to a real SVG file', () => {
    // resolveIconUrl falls back to `/icons/<key>.svg`, so a key with no file
    // renders a broken image in the grid rather than failing loudly.
    expect(iconKeys().filter((key) => !ICON_FILES.has(key))).toEqual([])
  })

  it('every icon that IS set is registered in the manifest', () => {
    const entries = Array.isArray(ICON_MANIFEST) ? ICON_MANIFEST : (ICON_MANIFEST.plants ?? [])
    const known = new Set(entries.map((entry) => entry.id))
    expect(iconKeys().filter((key) => !known.has(key))).toEqual([])
  })

  it('every plant has artwork', () => {
    // The backlog is cleared. This must only ever stay at zero: a new dataset
    // entry ships with an icon, or it shows a bare category tile in the picker.
    expect(PLANTS_AWAITING_ICON).toEqual([])
  })

  it('no two plants share an icon', () => {
    // Distinct species drawn with one icon read as duplicate tiles in the grid.
    const byIcon = new Map<string, string[]>()
    for (const p of LOCAL_PLANTS) {
      if (!p.iconKey) continue
      byIcon.set(p.iconKey, [...(byIcon.get(p.iconKey) ?? []), p.dutchName])
    }
    const shared = [...byIcon].filter(([, names]) => names.length > 1)
    expect(shared, `Shared icons: ${shared.map(([k, v]) => `${k} (${v.join(', ')})`).join('; ')}`).toEqual([])
  })

  it('no dataset entry carries a _bare icon key', () => {
    // Potted/bare variants belong to the icon catalog and are resolved at
    // submit time. If one leaked into the dataset the picker would show the
    // same plant twice.
    expect(LOCAL_PLANTS.filter((p) => p.iconKey?.endsWith('_bare'))).toEqual([])
  })

  it('has no duplicate latin names', () => {
    const seen = new Map<string, number>()
    for (const p of LOCAL_PLANTS) {
      seen.set(p.latinName, (seen.get(p.latinName) ?? 0) + 1)
    }
    expect([...seen].filter(([, n]) => n > 1)).toEqual([])
  })
})

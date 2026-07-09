type PlantNameSource = {
  name: string
  species?: string | null
  species_common_name_nl?: string | null
  species_common_name_en?: string | null
}

const DUTCH_TO_ENGLISH_COMMON_NAMES: Record<string, string> = {
  aardbei: 'Strawberry',
  aardbeien: 'Strawberry',
  framboos: 'Raspberry',
  frambozen: 'Raspberry',
  'blauwe bes': 'Blueberry',
  'blauwe-bes': 'Blueberry',
  bosbes: 'Blueberry',
  'rode bes': 'Redcurrant',
  'rode-bes': 'Redcurrant',
  aalbes: 'Redcurrant',
  kruisbes: 'Gooseberry',
  braam: 'Blackberry',
  bramen: 'Blackberry',
  druif: 'Grape',
  druiven: 'Grape',
  appel: 'Apple',
  peer: 'Pear',
  kers: 'Cherry',
  kersen: 'Cherry',
  pruim: 'Plum',
  vijg: 'Fig',
  laurier: 'Bay Laurel',
  tijm: 'Thyme',
  rozemarijn: 'Rosemary',
  salie: 'Sage',
  munt: 'Mint',
  bieslook: 'Chives',
  peterselie: 'Parsley',
  basilicum: 'Basil',
  lavendel: 'Lavender',
  klimroos: 'Climbing Rose',
  struikroos: 'Shrub Rose',
  roos: 'Rose',
  hortensia: 'Hydrangea',
  zonnehoed: 'Purple Coneflower',
  vingerhoedskruid: 'Foxglove',
  pannenkoekenplant: 'Chinese Money Plant',
  kattenstaart: 'Loosestrife',
  goudsbloem: 'Marigold',
  afrikaantje: 'French Marigold',
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normaliseDutchName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function englishFallbackForDutchName(plant: PlantNameSource): string | null {
  const candidates = [
    plant.species_common_name_nl,
    plant.species,
    plant.name,
  ]
  for (const candidate of candidates) {
    const text = textOrNull(candidate)
    if (!text) continue
    const key = normaliseDutchName(text)
    if (DUTCH_TO_ENGLISH_COMMON_NAMES[key]) return DUTCH_TO_ENGLISH_COMMON_NAMES[key]
  }
  return null
}

export function plantDisplayName(plant: PlantNameSource, locale: string): string {
  const isEN = locale.startsWith('en')
  const localizedSpeciesName = isEN
    ? textOrNull(plant.species_common_name_en)
    : textOrNull(plant.species_common_name_nl)

  return localizedSpeciesName
    ?? (isEN ? englishFallbackForDutchName(plant) : null)
    ?? plant.name
}

export function plantSearchText(plant: PlantNameSource, locale: string): string {
  return [
    plantDisplayName(plant, locale),
    plant.name,
    plant.species,
    plant.species_common_name_nl,
    plant.species_common_name_en,
  ]
    .map(textOrNull)
    .filter((value): value is string => value !== null)
    .join(' ')
    .toLowerCase()
}

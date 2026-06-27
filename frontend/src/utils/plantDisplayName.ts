type PlantNameSource = {
  name: string
  species?: string | null
  species_common_name_nl?: string | null
  species_common_name_en?: string | null
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function plantDisplayName(plant: PlantNameSource, locale: string): string {
  const localizedSpeciesName = locale.startsWith('en')
    ? textOrNull(plant.species_common_name_en)
    : textOrNull(plant.species_common_name_nl)

  return localizedSpeciesName ?? plant.name
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

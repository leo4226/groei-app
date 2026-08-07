import type { LocalPlant } from './plants-dataset'
import { LOCAL_PLANTS } from './plants-dataset'

/**
 * The plants the picker actually offers.
 *
 * Only entries with an icon are shown — a uniform icon grid looks far cleaner
 * than mixing in blank coloured squares for the (curated) entries without one.
 *
 * This lives apart from `PlantPickerSheet` so the count can be quoted (and
 * tested) without pulling React and the Zustand store into the import graph.
 * The Add Plant banner quotes `PICKABLE_SPECIES_COUNT` rather than the invented
 * "2 891 species" it used to advertise.
 */
export const PICKABLE_PLANTS: LocalPlant[] = LOCAL_PLANTS.filter((p) => p.iconKey)

export const PICKABLE_SPECIES_COUNT = PICKABLE_PLANTS.length

/** Case-insensitive match across every name the picker might be displaying. */
export function matchesPlantQuery(plant: LocalPlant, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    plant.dutchName.toLowerCase().includes(q) ||
    plant.latinName.toLowerCase().includes(q) ||
    (plant.englishName?.toLowerCase().includes(q) ?? false)
  )
}

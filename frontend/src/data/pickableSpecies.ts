import type { LocalPlant } from './plants-dataset'
import { LOCAL_PLANTS } from './plants-dataset'

/**
 * The plants the picker offers — the whole curated dataset.
 *
 * It used to offer only entries with an icon, on the grounds that a uniform
 * grid looks cleaner than one with gaps. That hid 22 perfectly good plants
 * (Kerstroos, Hortensia, Heuchera, Rododendron…) from the one screen whose job
 * is choosing a plant. Entries still awaiting artwork now show a
 * category-coloured leaf tile instead of being dropped.
 *
 * Auto-generating the missing icons was considered and rejected: the
 * deterministic generator renders every perennial with the same broadleaf
 * shape, and 18 of the 22 are perennials — it would have produced a screen full
 * of identical-looking tiles.
 *
 * This lives apart from `PlantPickerSheet` so the count can be quoted (and
 * tested) without pulling React and the Zustand store into the import graph.
 * The Add Plant banner quotes `PICKABLE_SPECIES_COUNT` rather than the invented
 * "2 891 species" it used to advertise.
 */
export const PICKABLE_PLANTS: LocalPlant[] = LOCAL_PLANTS

export const PICKABLE_SPECIES_COUNT = PICKABLE_PLANTS.length

/** Entries still waiting on bespoke artwork — they render a category tile. */
export const PLANTS_AWAITING_ICON: LocalPlant[] = LOCAL_PLANTS.filter((p) => !p.iconKey)

/**
 * The name to show — and to prefill as the nickname — for a dataset plant.
 *
 * The picker renders the English name in `en` mode, but selecting a plant used
 * to prefill `dutchName` unconditionally: an English user who tapped the tile
 * labelled "Lily of the valley" got "Lelietje-van-dalen" in the name field.
 * Five curated entries have no English name; those fall back to Dutch.
 */
export function displayPlantName(plant: LocalPlant, locale: string): string {
  if (locale.toLowerCase().startsWith('en') && plant.englishName?.trim()) {
    return plant.englishName
  }
  return plant.dutchName
}

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

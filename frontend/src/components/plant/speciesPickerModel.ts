import type { SpeciesSearchHit } from '../../types'

/**
 * What gets written to the species field when a search hit is chosen.
 *
 * `update_plant` looks the value up with `_find_species_by_name`, which matches
 * on latin OR common name, then relinks `species_id`. Writing the latin name
 * keeps that lookup unambiguous and language-independent — a Dutch user and an
 * English user picking the same plant store the same string.
 */
export function speciesValueFor(hit: SpeciesSearchHit): string {
  return hit.latin_name ?? hit.common_name_nl ?? hit.common_name_en ?? ''
}

/** How a hit reads in the list: latin name leading, common name beneath. */
export function speciesHitLabel(
  hit: SpeciesSearchHit,
  isEN: boolean,
): { primary: string; secondary: string | null } {
  const common = (isEN ? hit.common_name_en : hit.common_name_nl)
    ?? hit.common_name_nl
    ?? hit.common_name_en
  const latin = hit.latin_name
  if (latin) return { primary: latin, secondary: common ?? null }
  return { primary: common ?? '', secondary: null }
}

/**
 * Whether saving would re-identify the plant.
 *
 * Mirrors the backend's `_species_text_changed`: case and surrounding
 * whitespace are noise, so a capitalisation fix must not warn the user that
 * their anchors and phenology are about to be regenerated.
 */
export function speciesChanged(original: string | null, value: string): boolean {
  return (original ?? '').trim().toLowerCase() !== value.trim().toLowerCase()
}

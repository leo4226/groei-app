/** Stable external reading links built from the scientific name. */
export function wikipediaPlantUrl(latinName: string, locale: string): string {
  const language = wikipediaLanguage(locale)
  // Special:Search opens the exact article when it exists and otherwise shows
  // useful matches instead of sending the reader to a dead page.
  return `https://${language}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(latinName.trim())}`
}

export function wikipediaLanguage(locale: string): 'nl' | 'en' {
  return locale.toLowerCase().startsWith('nl') ? 'nl' : 'en'
}

/**
 * Scientific names as identification returns them, reduced to titles Wikipedia
 * is likely to have.
 *
 * Identify results carry things Wikipedia article titles never do — author
 * citations ("Taraxacum officinale F.H.Wigg."), cultivar epithets
 * ("Hedera helix 'Goldheart'"), aggregate and uncertainty markers
 * ("Rubus fruticosus agg.", "Taraxacum sp.", "cf. Bromus"). Every one of those
 * misses, which is why the link so often landed on an empty search page.
 *
 * Returns the candidates to try in order, most specific first: the name as
 * given, then the bare binomial, then the genus. A genus article is still a
 * good read when the ID only got that far.
 */
export function wikipediaTitleCandidates(latinName: string): string[] {
  const raw = latinName.trim().replace(/\s+/g, ' ')
  if (!raw) return []

  const candidates: string[] = [raw]

  const cleaned = raw
    .replace(/['"’][^'"’]*['"’]/g, ' ')          // cultivar epithets
    .replace(/\b(?:cf|aff)\.\s*/gi, ' ')          // uncertainty markers
    .replace(/\s*\b(?:agg|sensu lato|s\.l|s\.str)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = cleaned.split(' ')
  const genus = words[0]
  // A species epithet is lowercase; anything else (an author, an initial) is not.
  const epithet = words[1] && /^[a-zà-ÿ][a-zà-ÿ-]*$/.test(words[1]) && words[1] !== 'sp.'
    ? words[1]
    : null

  // Hybrids keep their multiplication sign: "Platanus × hispanica".
  if (epithet === '×' || epithet === 'x') {
    const hybridEpithet = words[2]
    if (hybridEpithet) push(candidates, `${genus} × ${hybridEpithet}`)
  } else if (epithet) {
    // Infraspecific ranks: try "Genus species subsp. x" then "Genus species".
    const rankIdx = words.findIndex(w => /^(subsp|ssp|var|f|forma)\.?$/i.test(w))
    if (rankIdx > 0 && words[rankIdx + 1]) {
      push(candidates, `${genus} ${epithet} ${words[rankIdx].replace(/\.?$/, '.')} ${words[rankIdx + 1]}`)
    }
    push(candidates, `${genus} ${epithet}`)
  }

  if (genus && /^[A-ZÀ-Þ][a-zà-ÿ-]+$/.test(genus)) push(candidates, genus)

  return candidates
}

function push(list: string[], value: string) {
  if (value && !list.includes(value)) list.push(value)
}

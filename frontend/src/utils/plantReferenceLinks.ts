/** Stable external reading links built from the scientific name. */
export function wikipediaPlantUrl(latinName: string, locale: string): string {
  const language = locale.toLowerCase().startsWith('nl') ? 'nl' : 'en'
  // Special:Search opens the exact article when it exists and otherwise shows
  // useful matches instead of sending the reader to a dead page.
  return `https://${language}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(latinName.trim())}`
}

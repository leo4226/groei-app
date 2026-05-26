/**
 * European date format helpers: dd-mm-yyyy <-> yyyy-mm-dd (ISO).
 *
 * All date inputs store ISO internally for the API,
 * but display/accept dd-mm-yyyy in text inputs.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const DDMM_RE = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/

/** ISO "2026-05-25" → "25-05-2026" (or "" if invalid) */
export function isoToDisplay(iso: string): string {
  if (!iso || !ISO_RE.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

/** "25-05-2026" or "25/05/2026" → ISO "2026-05-25" (or "" if invalid) */
export function displayToIso(display: string): string {
  const m = display.trim().match(DDMM_RE)
  if (!m) return ''
  const [, d, mo, y] = m
  return `${y}-${mo}-${d}`
}

/** Returns true if the string looks like a valid dd-mm-yyyy date */
export function isValidDisplay(display: string): boolean {
  if (!display.trim()) return true // empty is valid (no date)
  const iso = displayToIso(display)
  if (!iso) return false
  const date = new Date(iso + 'T00:00:00')
  return !isNaN(date.getTime())
}

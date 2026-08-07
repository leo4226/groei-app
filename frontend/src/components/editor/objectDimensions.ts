/**
 * Parse a centimetre field from the object properties panel.
 *
 * The `width_cm` / `depth_cm` / `diameter_cm` columns are INTEGER, and asyncpg
 * raises `DataError` on a float or a string rather than coercing (CLAUDE.md
 * § Database, #142), so the value that leaves this function has to be exact.
 *
 * Returns an integer to write, `null` to clear the dimension, or `undefined`
 * to hold still — the last one matters because the field commits on change,
 * and every half-typed intermediate value would otherwise fire an update.
 */
export function parseCm(raw: string): number | null | undefined {
  if (raw.trim() === '') return null
  const n = Math.round(parseFloat(raw))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

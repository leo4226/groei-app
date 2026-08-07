/**
 * Shared helpers for the public garden atlas (#804): month labels and the
 * compact flowering-months bar used on browse cards and the detail page.
 * Pure functions so they can be unit-tested without React.
 */
export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Localized short month names for filter dropdowns, e.g. 'Jan' / 'Mrt'. */
export function monthShortNames(locale: string): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const name = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2026, i, 1))
    return name.replace('.', '')
  })
}

/**
 * Build the bar heights for a flowering-months strip.
 * Returns 12 numbers in [0, 1] — 0 when the garden doesn't flower that month,
 * otherwise scaled by the busiest month so the tallest bar is always 1.
 * An empty/gardens-without-flower-data input yields all-zero bars.
 */
export function flowerBarHeights(flowerMonths: number[]): number[] {
  const set = new Set(flowerMonths.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))
  const heights = Array.from({ length: 12 }, (_, i) => (set.has(i + 1) ? 1 : 0))
  return heights
}

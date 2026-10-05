export type CalendarViewMode = 'month' | 'work' | 'year'

export function defaultCalendarView(isNarrow: boolean): CalendarViewMode {
  return isNarrow ? 'work' : 'month'
}

/**
 * The day a `?date=YYYY-MM-DD` deep link points at. Every event in the
 * personal-calendar feed (Outlook, Google, Apple) links here, so opening one
 * lands on that event's day instead of today.
 */
export function deepLinkedDate(search: string): { year: number; month1: number; iso: string } | null {
  const iso = new URLSearchParams(search).get('date') ?? ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month1 = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month1 - 1, day)
  const valid = parsed.getFullYear() === year
    && parsed.getMonth() === month1 - 1
    && parsed.getDate() === day
  return valid ? { year, month1, iso } : null
}

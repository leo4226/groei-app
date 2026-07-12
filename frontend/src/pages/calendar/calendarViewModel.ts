export type CalendarViewMode = 'month' | 'work' | 'year'

export function defaultCalendarView(isNarrow: boolean): CalendarViewMode {
  return isNarrow ? 'work' : 'month'
}

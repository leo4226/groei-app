export const MONTH_LONG_NL = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
]
export const MONTH_SHORT_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
export const DAY_LONG_NL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag']
export const DAY_LETTERS_NL = ['M','D','W','D','V','Z','Z']

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/** Mon=0..Sun=6 */
export function dowMon(year: number, month1: number, day: number): number {
  const js = new Date(year, month1 - 1, day).getDay()
  return (js + 6) % 7
}

/** ISO-week-number for a given Y/M/D using Mon-start, Thursday rule. */
export function isoWeek(year: number, month1: number, day: number): number {
  const target = new Date(Date.UTC(year, month1 - 1, day))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThu = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diff = target.getTime() - firstThu.getTime()
  return 1 + Math.round(((diff / 86400000) - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
}

/** Format a Date as YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function firstOfMonth(year: number, month1: number): string {
  return isoDate(new Date(year, month1 - 1, 1))
}

export function lastOfMonth(year: number, month1: number): string {
  return isoDate(new Date(year, month1, 0))
}

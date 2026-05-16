// Synodic month ~29.5306 days. Reference new moon: 2000-01-06 18:14 UTC.
const SYNODIC = 29.530588853
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0)

export interface MoonPhase {
  /** 0..1 illuminated fraction */
  lit: number
  /** true if waxing (lit side grows toward full) */
  waxing: boolean
  phase: 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous'
       | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent'
}

export function moonPhaseFor(date: Date): MoonPhase {
  const diffDays = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000
  const age = ((diffDays % SYNODIC) + SYNODIC) % SYNODIC
  const lit = 0.5 * (1 - Math.cos((2 * Math.PI * age) / SYNODIC))
  const waxing = age < SYNODIC / 2
  let phase: MoonPhase['phase']
  if (age < 1.85) phase = 'new'
  else if (age < 5.54) phase = 'waxing-crescent'
  else if (age < 9.23) phase = 'first-quarter'
  else if (age < 12.91) phase = 'waxing-gibbous'
  else if (age < 16.61) phase = 'full'
  else if (age < 20.30) phase = 'waning-gibbous'
  else if (age < 23.99) phase = 'last-quarter'
  else if (age < 27.68) phase = 'waning-crescent'
  else phase = 'new'
  return { lit, waxing, phase }
}

export const MOON_PHASE_LABEL_NL: Record<MoonPhase['phase'], string> = {
  'new': 'Nieuwe maan',
  'waxing-crescent': 'Wassende sikkel',
  'first-quarter': 'Eerste kwartier',
  'waxing-gibbous': 'Wassende gibbeuze',
  'full': 'Volle maan',
  'waning-gibbous': 'Afnemende gibbeuze',
  'last-quarter': 'Laatste kwartier',
  'waning-crescent': 'Afnemende sikkel',
}

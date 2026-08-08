import { describe, it, expect } from 'vitest'
import { nl } from '../nl'
import { en } from '../en'

// #855 made sun hours sin(altitude)-weighted: a cell's sunHours is now
// intensity-weighted equivalent hours, not literal clock hours of direct sun.
// These two labels are what users actually see for that unit, so they must not
// claim "direct sun" clock hours anymore. `{hours}` must keep working: both
// SunControls (sunHoursIn) and GrowHereSheet (sunLabel) interpolate it, and
// GrowHereSheet additionally splits sunLabel on `{hours}` to style the value.
const SUN_LABEL_PATHS: [string, string][] = [
  ['sun.sunHoursIn', 'sunHoursIn'],
  ['growHere.sunLabel', 'sunLabel'],
]

const get = (pack: typeof nl, path: string) =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], pack)

describe('weighted sun-hour labels', () => {
  it.each(SUN_LABEL_PATHS)('%s keeps its placeholders in both languages', (path) => {
    const enValue = get(en, path) as string
    const nlValue = get(nl, path) as string
    expect(enValue).toContain('{hours}')
    expect(nlValue).toContain('{hours}')
    // GrowHereSheet splits sunLabel on '{hours}' to style the value; it must
    // remain a single placeholder so split() yields exactly two parts.
    if (path === 'growHere.sunLabel') {
      expect(enValue.split('{hours}')).toHaveLength(2)
      expect(nlValue.split('{hours}')).toHaveLength(2)
    }
    if (path === 'sun.sunHoursIn') {
      expect(enValue).toContain('{month}')
      expect(nlValue).toContain('{month}')
    }
  })

  it.each(SUN_LABEL_PATHS)('%s no longer claims literal direct-sun clock hours', (path) => {
    const enValue = get(en, path) as string
    const nlValue = get(nl, path) as string
    for (const banned of ['direct sun', 'direct sunlight', 'directe zon']) {
      expect(enValue.toLowerCase()).not.toContain(banned)
      expect(nlValue.toLowerCase()).not.toContain(banned)
    }
  })

  it('keeps NL distinct from EN (parity guard)', () => {
    for (const [path] of SUN_LABEL_PATHS) {
      expect(get(nl, path)).not.toBe(get(en, path))
    }
  })
})

import { describe, expect, it } from 'vitest'

import {
  FACTS_MAP_ONLY_DEFAULT,
  scopedFactsCountLabel,
  scopedFactsMissingCount,
  scopedFactsPreviewIsStaleOrUnsupported,
  scopedFactsRunParams,
} from './adminFactsToolModel'

const preview = (overrides: Record<string, unknown>) => ({
  scope: 'in_use',
  map_only: true,
  total_species: 10,
  missing_facts: 3,
  ...overrides,
} as any)

describe('admin facts tool model', () => {
  it('defaults the active-plants facts tool to map-placed plants', () => {
    expect(FACTS_MAP_ONLY_DEFAULT).toBe(true)
    expect(scopedFactsRunParams(25)).toEqual({ scope: 'in_use', map_only: true, limit: 25 })
  })

  it('accepts scoped preview counts only when backend echoes the requested in-use scope', () => {
    expect(scopedFactsMissingCount(preview({ missing_facts: 23 }), true)).toBe(23)
    expect(scopedFactsMissingCount(preview({ map_only: false }), true)).toBeNull()
    expect(scopedFactsMissingCount(preview({ scope: 'all', missing_facts: 1768 }), true)).toBeNull()
    expect(scopedFactsMissingCount(preview({ scope: undefined, missing_facts: 1768 }), true)).toBeNull()
  })

  it('marks old-backend catalog-shaped previews as unsupported instead of showing them as my plants', () => {
    expect(scopedFactsPreviewIsStaleOrUnsupported(preview({ scope: undefined, missing_facts: 1768 }), true)).toBe(true)
    expect(scopedFactsPreviewIsStaleOrUnsupported(preview({ missing_facts: 23 }), true)).toBe(false)
  })

  it('labels scoped counts consistently with the icon generator wording', () => {
    expect(scopedFactsCountLabel(0, true)).toBe('My plants on a map needing facts: 0')
    expect(scopedFactsCountLabel(null, true)).toBe('My plants on a map needing facts: …')
  })
})

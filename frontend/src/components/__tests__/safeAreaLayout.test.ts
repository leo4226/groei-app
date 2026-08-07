import { describe, it, expect } from 'vitest'
import {
  CHROME_TOP_CLASS,
  CHROME_TOP_ROW2_CLASS,
  CHROME_TOP_ROW3_CLASS,
  CHROME_LEFT_CLASS,
  CHROME_RIGHT_CLASS,
  CANVAS_TOP_CLASS,
  SAFE_INSET_STYLE,
} from '../safeAreaLayout'

const SOURCES = import.meta.glob('../../**/*.tsx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * Screens that paint to the physical top of the display. `index.html` sets
 * viewport-fit=cover + black-translucent, so in an installed PWA these draw
 * under the status bar / notch / Dynamic Island and must add the inset
 * themselves. A bare numeric `top-N` on an absolutely or fixed positioned
 * element in one of these files is the bug this suite exists to catch.
 */
const FULL_BLEED_SCREENS = [
  'pages/MapPage.tsx',
  'pages/LayoutEditorPage.tsx',
  'pages/DemoGardenPage.tsx',
  'pages/PlantDetail.tsx',
  'components/editor/EditorCanvas.tsx',
  'components/identify/IdentifyCamera.tsx',
]

/** `top-0` is fine on a full-bleed layer; `top-full` / `top-1/2` are relative. */
const OFFENDING_TOP = /\b(?:absolute|fixed)\b[^"'`]*?\btop-([1-9]\d*)(?![\d/])/g

/**
 * Glob keys are relative to this file and vary in depth
 * ('../../pages/MapPage.tsx', '../editor/EditorCanvas.tsx'). Resolve them
 * against this directory so both shapes become 'components/editor/...' etc.
 */
const TEST_DIR = ['src', 'components', '__tests__']

function srcPath(globKey: string): string {
  const segments = [...TEST_DIR]
  for (const part of globKey.split('/')) {
    if (part === '..') segments.pop()
    else if (part !== '.') segments.push(part)
  }
  return segments.slice(1).join('/') // drop the leading 'src'
}

function sourceFor(screen: string): string {
  const hit = Object.entries(SOURCES).find(([key]) => srcPath(key).endsWith(screen))
  if (!hit) throw new Error(`${screen} not found — update FULL_BLEED_SCREENS`)
  return hit[1]
}

describe('safe-area tokens', () => {
  it('every chrome class consumes an inset', () => {
    for (const cls of [CHROME_TOP_CLASS, CHROME_TOP_ROW2_CLASS, CHROME_TOP_ROW3_CLASS, CANVAS_TOP_CLASS]) {
      expect(cls).toMatch(/--(?:safe-top|chrome-top)/)
    }
    expect(CHROME_LEFT_CLASS).toMatch(/--(?:safe-left|chrome-left)/)
    expect(CHROME_RIGHT_CLASS).toMatch(/--(?:safe-right|chrome-right)/)
  })

  it('adds the inset to the overlay gutter rather than replacing it', () => {
    // Substituting would silently drop the element's own padding.
    expect(SAFE_INSET_STYLE.paddingTop).toBe('calc(var(--safe-top) + 1rem)')
    expect(SAFE_INSET_STYLE.paddingLeft).toBe('calc(var(--safe-left) + 1rem)')
    expect(SAFE_INSET_STYLE.paddingRight).toBe('calc(var(--safe-right) + 1rem)')
  })
})

describe('full-bleed screens keep their chrome out of the display cutout', () => {
  for (const screen of FULL_BLEED_SCREENS) {
    it(`${screen} anchors nothing to a bare numeric top`, () => {
      const offenders = [...sourceFor(screen).matchAll(OFFENDING_TOP)].map((m) => m[0].trim())
      expect(
        offenders,
        `Use CHROME_TOP_CLASS (or a calc on --safe-top) instead of a bare top-N: ${offenders.join(' | ')}`,
      ).toEqual([])
    })
  }

  it('scans every screen that uses the safe-area tokens', () => {
    // The list above is hand-maintained, so a future full-bleed screen could be
    // added without being scanned. Any file reaching for these tokens is by
    // definition viewport-anchored — pull it into the list rather than letting
    // it drift out of coverage.
    const usingTokens = Object.keys(SOURCES)
      .filter((key) => /from '[^']*safeAreaLayout'/.test(SOURCES[key]))
      .map(srcPath)

    const unscanned = usingTokens.filter(
      (path) => !FULL_BLEED_SCREENS.some((screen) => path.endsWith(screen)),
    )
    expect(
      unscanned,
      `Add these to FULL_BLEED_SCREENS so their top anchors are checked: ${unscanned.join(', ')}`,
    ).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import {
  CHROME_TOP_CLASS,
  CHROME_TOP_ROW2_CLASS,
  CHROME_TOP_ROW3_CLASS,
  CHROME_LEFT_CLASS,
  CHROME_RIGHT_CLASS,
  CHROME_BOTTOM_CLASS,
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
 * The same rule for the bottom edge. This suite only ever scanned the top, so
 * the editor's tool dock sat at a bare `bottom-3` from the day it shipped: on a
 * phone with a home indicator the lower half of its 44px buttons fell inside
 * the system gesture strip. A cutout is not only at the top of the screen.
 */
const OFFENDING_BOTTOM = /\b(?:absolute|fixed)\b[^"'`]*?\bbottom-([1-9]\d*)(?![\d/])/g

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

  /**
   * Pre-existing bottom-anchored chrome, baselined the way the i18n guard
   * baselines its offenders: this list must only ever shrink. They predate the
   * bottom scan and sit on the map screens, which have their own BottomNav
   * interplay (`--bottom-nav-height`) and want measuring before they move —
   * some of these are canvases where sitting under the nav is intended, and
   * others are pills that would currently hide behind it on a notched phone.
   */
  const BOTTOM_BASELINE: Record<string, number> = {
    'pages/MapPage.tsx': 4,
    'pages/DemoGardenPage.tsx': 2,
    'pages/PlantDetail.tsx': 1,
  }

  for (const screen of FULL_BLEED_SCREENS) {
    it(`${screen} anchors nothing new to a bare numeric bottom`, () => {
      const offenders = [...sourceFor(screen).matchAll(OFFENDING_BOTTOM)].map((m) => m[0].trim())
      const allowed = BOTTOM_BASELINE[screen] ?? 0
      expect(
        offenders.length,
        `Use CHROME_BOTTOM_CLASS (or a calc on --safe-bottom) instead of a bare bottom-N. ` +
        `Baseline for this file is ${allowed}; found ${offenders.length}: ${offenders.join(' | ')}`,
      ).toBeLessThanOrEqual(allowed)
    })
  }

  it('exposes a bottom token at all — the edge that had none', () => {
    expect(CHROME_BOTTOM_CLASS).toContain('--chrome-bottom')
  })

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

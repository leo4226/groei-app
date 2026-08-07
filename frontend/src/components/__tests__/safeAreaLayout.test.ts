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

import mapPageSrc from '../../pages/MapPage.tsx?raw'
import layoutEditorSrc from '../../pages/LayoutEditorPage.tsx?raw'
import demoGardenSrc from '../../pages/DemoGardenPage.tsx?raw'
import plantDetailSrc from '../../pages/PlantDetail.tsx?raw'
import editorCanvasSrc from '../../components/editor/EditorCanvas.tsx?raw'
import identifyCameraSrc from '../../components/identify/IdentifyCamera.tsx?raw'

/**
 * Screens that paint to the physical top of the display. `index.html` sets
 * viewport-fit=cover + black-translucent, so in an installed PWA these draw
 * under the status bar / notch / Dynamic Island and must add the inset
 * themselves. A bare numeric `top-N` on an absolutely or fixed positioned
 * element in one of these files is the bug this suite exists to catch.
 */
const FULL_BLEED_SCREENS: [name: string, source: string][] = [
  ['pages/MapPage.tsx', mapPageSrc],
  ['pages/LayoutEditorPage.tsx', layoutEditorSrc],
  ['pages/DemoGardenPage.tsx', demoGardenSrc],
  ['pages/PlantDetail.tsx', plantDetailSrc],
  ['components/editor/EditorCanvas.tsx', editorCanvasSrc],
  ['components/identify/IdentifyCamera.tsx', identifyCameraSrc],
]

/** `top-0` is fine on a full-bleed layer; `top-full` / `top-1/2` are relative. */
const OFFENDING_TOP = /\b(?:absolute|fixed)\b[^"'`]*?\btop-([1-9]\d*)(?![\d/])/g

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
  for (const [screen, source] of FULL_BLEED_SCREENS) {
    it(`${screen} anchors nothing to a bare numeric top`, () => {
      const offenders = [...source.matchAll(OFFENDING_TOP)].map((m) => m[0].trim())
      expect(
        offenders,
        `Use CHROME_TOP_CLASS (or a calc on --safe-top) instead of a bare top-N: ${offenders.join(' | ')}`,
      ).toEqual([])
    })
  }
})

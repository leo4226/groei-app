/**
 * Shared safe-area (display cutout) layout tokens.
 *
 * `index.html` sets `viewport-fit=cover` together with
 * `apple-mobile-web-app-status-bar-style: black-translucent`. In an installed
 * PWA that combination is deliberate — the map and the layout editor are
 * full-bleed canvases that should run edge to edge — but it means the page is
 * painted *under* the status bar, notch, Dynamic Island and camera hole.
 *
 * Every element anchored to a viewport edge therefore has to add the inset
 * itself. Floating chrome that used a bare `top-3` (12px) rendered behind the
 * clock, WiFi and battery on any device with a cutout. Whether it looked fine
 * depended entirely on the phone, which is why the bug was invisible on some
 * devices and obvious on others.
 *
 * The CSS variables live in `index.css`; these classes are the Tailwind side,
 * kept here so the values are asserted in one place instead of being retyped
 * as arbitrary-value strings across a dozen files.
 */

/** Top-anchored floating chrome: 12px design gap + the top cutout. */
export const CHROME_TOP_CLASS = 'top-[var(--chrome-top)]'

/** Left-anchored floating chrome: 12px + the left cutout (landscape notch). */
export const CHROME_LEFT_CLASS = 'left-[var(--chrome-left)]'

/** Right-anchored floating chrome: 12px + the right cutout. */
export const CHROME_RIGHT_CLASS = 'right-[var(--chrome-right)]'

/**
 * Bottom-anchored floating chrome: 12px + the home indicator.
 *
 * The editor's tool dock used a bare `bottom-3`, so on a phone with a home
 * indicator the lower half of its 44px buttons sat inside the gesture strip —
 * the same class of bug the top tokens fixed, on the edge nobody checked.
 */
export const CHROME_BOTTOM_CLASS = 'bottom-[var(--chrome-bottom)]'

/**
 * A second row of chrome stacked under the first (e.g. the unplaced-plants
 * tray below the garden pill): 64px + the top cutout.
 */
export const CHROME_TOP_ROW2_CLASS = 'top-[calc(var(--safe-top)+4rem)]'

/** A third row of chrome (the editor's desktop legend toggle): 80px + cutout. */
export const CHROME_TOP_ROW3_CLASS = 'top-[calc(var(--safe-top)+5rem)]'

/**
 * The map canvas sits between the top pills and the bottom sheet. The top
 * offset has to clear the cutout as well, or the canvas starts underneath it.
 */
export const CANVAS_TOP_CLASS = 'top-[calc(var(--safe-top)+3rem)]'

/**
 * Full-bleed overlay padding that keeps content clear of every cutout edge and
 * still keeps the element's own 1rem gutter — the inset is added to it, not
 * substituted for it.
 */
export const SAFE_INSET_STYLE = {
  paddingTop: 'calc(var(--safe-top) + 1rem)',
  paddingLeft: 'calc(var(--safe-left) + 1rem)',
  paddingRight: 'calc(var(--safe-right) + 1rem)',
} as const

/**
 * Top padding for a full-bleed overlay whose own chrome is inside it
 * (the camera view, the first-run overlay).
 */
export const SAFE_TOP_PADDING_STYLE = { paddingTop: 'var(--safe-top)' } as const

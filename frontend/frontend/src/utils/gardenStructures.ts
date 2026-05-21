export const PX_PER_CM = 0.46
export const PX_PER_M = 46

/**
 * Compass bearing (degrees CW from north) of the SVG's "up" direction.
 *
 * Brick fence (long NNW side) is SVG-top in landscape orientation.
 * Calibrated from two suncalc.org data points (2026-04-25/26):
 *   1. At az=100.33° alt=24.94° the neighbours' building shadow just reaches the
 *      garden NW corner (x=54), clearing by 9:15. Requires θ≈347°.
 *   2. At az=212° alt≈40° the own building shadow covers the garden center.
 *      Both constraints satisfied only by θ≈347° (NNW), not θ≈34° (NNE).
 * House is WSW (~257°) of garden; back fence ENE (~77°); brick fence NNW (~347°).
 */
export const GARDEN_SVG_TOP_AZIMUTH = 347

/** Garden boundary in landscape SVG coordinates (for clipping shadows) */
export const GARDEN_CLIP = { x: 40, y: 157, width: 585, height: 285 }

/**
 * Garden floor boundary polygon (landscape SVG coords).
 * Derived by applying (x,y)→(680−y, x) to the portrait GARDEN_FLOOR corners.
 *
 * Original portrait corners (clockwise):
 *   [162, 55]   top-left (back deck NW)
 *   [438, 55]   top-right (back deck NE)
 *   [438, 626]  bottom-right (front deck SE)
 *   [162, 626]  bottom-left (front deck SW)
 *
 * Landscape after 90° CW bake (house=left, back fence=right, brick=top, wooden=bottom):
 */
export const GARDEN_FLOOR: [number, number][] = [
  [54,  162],   // left-top     (house, brick wall corner) — landscape TL
  [625, 162],   // right-top    (back fence, brick wall corner) — landscape TR
  [625, 438],   // right-bottom (back fence, wooden fence corner) — landscape BR
  [54,  438],   // left-bottom  (house, wooden fence corner) — landscape BL
]

export type ShadowCaster =
  | { id: string; label: string; type: 'rect'; x: number; y: number; width: number; height: number; heightCm: number; opacity?: number }
  | { id: string; label: string; type: 'circle'; cx: number; cy: number; radius: number; heightCm: number; opacity?: number }
  | { id: string; label: string; type: 'polygon'; points: [number, number][]; heightCm: number; opacity?: number }

/**
 * Shadow-casting structures for the garden at Hoofdweg 358, Amsterdam.
 *
 * Landscape SVG orientation (after 90° CW bake):
 *   left  = house / WSW (~257°)    right = back fence / ENE (~77°)
 *   top   = brick wall / NNW (~347°)   bottom = wooden fence / SSE (~167°)
 * Scale: 46px = 1m
 *
 * All coordinates derived from portrait originals via (x,y)→(680−y, x).
 * For rects: (x,y,w,h)→(680−y−h, x, h, w).
 */
export const SHADOW_CASTERS: ShadowCaster[] = [
  // ── Dominant casters: buildings ────────────────────────────────

  {
    id: 'own_building',
    label: 'Own building (WSW / house side)',
    type: 'rect',
    // Portrait: x=-763, y=741, w=2125, h=10 → landscape: x=680-741-10=-71, y=-763, w=10, h=2125
    x: -71, y: -763, width: 10, height: 2125,
    heightCm: 1503,
  },
  {
    id: 'neighbours_building',
    label: "Neighbours' building (ENE / back-fence side)",
    type: 'rect',
    // Portrait: x=-763, y=-520, w=2125, h=10 → landscape: x=680-(-520)-10=1190, y=-763, w=10, h=2125
    x: 1190, y: -763, width: 10, height: 2125,
    heightCm: 1250,
  },

  // ── Significant caster: neighbour's tree ──────────────────────

  {
    id: 'norway_spruce',
    label: 'Norway spruce (south neighbour)',
    type: 'polygon',
    // Rounded-top rectangle: bottom ½ straight sides, top ½ semi-ellipse arc
    // Footprint: x=150–375 (width=225), y=507–691 (height=184)
    // Arc: cx=262.5, cy=599, rx=112.5, ry=92 (top half = 92px)
    points: [
      [150, 691], [375, 691], [375, 599],
      [366.4, 563.8], [342.0, 533.9], [305.6, 514.0],
      [262.5, 507.0],
      [219.4, 514.0], [183.0, 533.9], [158.6, 563.8],
      [150, 599],
    ],
    heightCm: 1800,
    opacity: 0.15,
  },

  // ── Shed ──────────────────────────────────────────────────────

  {
    id: 'shed',
    label: 'Shed (ESE corner, back fence)',
    type: 'rect',
    // Bottom-right of garden floor, flush against back fence (x=625) and wooden fence (y=438)
    // Footprint ≈ 2.5 m × 2.0 m
    x: 510, y: 346, width: 115, height: 92,
    heightCm: 220,
  },

  // ── Minor casters ─────────────────────────────────────────────

  {
    id: 'back_fence',
    label: 'Back fence (ENE / right side)',
    type: 'rect',
    // Portrait east_fence: x=162, y=50, w=276, h=5 → landscape: x=680-50-5=625, y=162, w=5, h=276
    x: 625, y: 162, width: 5, height: 276,
    heightCm: 200,
  },
  {
    id: 'brick_fence',
    label: 'Brick fence (NNW / top side)',
    type: 'rect',
    // Portrait left_fence: x=157, y=55, w=5, h=585 → landscape: x=680-55-585=40, y=157, w=585, h=5
    x: 40, y: 157, width: 585, height: 5,
    heightCm: 150,
  },
  {
    id: 'wooden_fence',
    label: 'Wooden fence (SSE / bottom side)',
    type: 'rect',
    // Portrait right_fence: x=438, y=55, w=4, h=585 → landscape: x=680-55-585=40, y=438, w=585, h=4
    x: 40, y: 438, width: 334, height: 4,
    heightCm: 150,
  },
  {
    id: 'wooden_fence_vegetation',
    label: 'Wooden fence vegetation (SSE side)',
    type: 'rect',
    // Portrait right_fence_vegetation: same footprint as right_fence → same landscape result
    x: 40, y: 438, width: 334, height: 4,
    heightCm: 300,
    opacity: 0.15,
  },
  {
    id: 'populier',
    label: 'Populier trunk (NNE corner)',
    type: 'circle',
    // Portrait: cx=180, cy=90 → landscape: cx=680-90=590, cy=180
    cx: 590,
    cy: 180,
    radius: 30,
    heightCm: 2300,
    opacity: 0.2,
  },
  {
    id: 'populier_canopy',
    label: 'Poplar canopy (ground shadow)',
    type: 'circle',
    cx: 590,
    cy: 180,
    radius: 70,       // ~1.5m radius — columnar poplar crown (~3m diameter)
    heightCm: 1700,   // mid-canopy
    opacity: 0.15,    // dappled
  },
]

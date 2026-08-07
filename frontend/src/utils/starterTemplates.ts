import type { ZoneStyleType } from '../types'

// Starter templates seed a new garden's outline so the editor opens already
// useful (#646). They are pure factories: given a real-world size and a scale,
// they return plain zone rectangles in SVG-pixel space. The wizard turns these
// into EditorZones (assigning ids) and persists them.

// New maps are created with a fixed 680×680 canvas (see backend create_map and
// useEditorState.toCanvasData). Templates centre their outline inside it.
export const CANVAS_SIZE = 680
const MARGIN_FRACTION = 0.12

export type StarterTemplateId =
  | 'rectangle' | 'l_shape' | 'balcony' | 'blank'
  // Indoor (#841 F1). Indoor maps used to drop straight onto an empty canvas
  // while outdoor got a guided flow — and indoor is the harder model, with
  // rooms, wall thickness and openings placed *on* edges.
  | 'studio' | 'two_room' | 'l_room' | 'blank_indoor'

export interface TemplateRect {
  x: number
  y: number
  width: number
  height: number
  type: ZoneStyleType
}

export interface StarterTemplateMeta {
  id: StarterTemplateId
  defaultWidthM: number
  defaultDepthM: number
  /** 'blank' seeds nothing and falls back to the freehand + tour flow. */
  seedsZones: boolean
}

export const STARTER_TEMPLATES: Record<StarterTemplateId, StarterTemplateMeta> = {
  rectangle: { id: 'rectangle', defaultWidthM: 8, defaultDepthM: 6,   seedsZones: true },
  l_shape:   { id: 'l_shape',   defaultWidthM: 8, defaultDepthM: 8,   seedsZones: true },
  balcony:   { id: 'balcony',   defaultWidthM: 4, defaultDepthM: 1.4, seedsZones: true },
  blank:     { id: 'blank',     defaultWidthM: 8, defaultDepthM: 6,   seedsZones: false },

  studio:       { id: 'studio',       defaultWidthM: 6, defaultDepthM: 4, seedsZones: true },
  two_room:     { id: 'two_room',     defaultWidthM: 8, defaultDepthM: 5, seedsZones: true },
  l_room:       { id: 'l_room',       defaultWidthM: 7, defaultDepthM: 6, seedsZones: true },
  blank_indoor: { id: 'blank_indoor', defaultWidthM: 6, defaultDepthM: 4, seedsZones: false },
}

/** Ordered ids for rendering the shape picker. */
export const STARTER_TEMPLATE_ORDER: StarterTemplateId[] = ['rectangle', 'l_shape', 'balcony', 'blank']

/** Indoor equivalents, in picker order. */
export const INDOOR_TEMPLATE_ORDER: StarterTemplateId[] = ['studio', 'two_room', 'l_room', 'blank_indoor']

export function templateOrderFor(mapType: 'outdoor' | 'indoor'): StarterTemplateId[] {
  return mapType === 'indoor' ? INDOOR_TEMPLATE_ORDER : STARTER_TEMPLATE_ORDER
}

/**
 * Scale (px per metre) that fits a widthM×depthM garden inside the canvas with a
 * margin on every side. Uniform across both axes so real-world dimensions stay
 * proportional. Clamped to a sane minimum so absurd sizes never vanish.
 */
export function fitScalePxPerM(widthM: number, depthM: number): number {
  const usable = CANVAS_SIZE * (1 - 2 * MARGIN_FRACTION)
  const span = Math.max(widthM, depthM, 0.5)
  return Math.max(4, Math.round((usable / span) * 10) / 10)
}

function centeredBox(widthM: number, depthM: number, scale: number) {
  const w = Math.round(widthM * scale)
  const h = Math.round(depthM * scale)
  return {
    w,
    h,
    x: Math.round((CANVAS_SIZE - w) / 2),
    y: Math.round((CANVAS_SIZE - h) / 2),
  }
}

/**
 * The zone rectangles to seed for a template at a given real-world size + scale.
 * 'blank' seeds nothing (freehand fallback). All rects sit inside the 680 canvas.
 */
export function buildTemplateZones(
  id: StarterTemplateId,
  widthM: number,
  depthM: number,
  scale: number,
): TemplateRect[] {
  if (id === 'blank' || id === 'blank_indoor') return []
  const { x, y, w, h } = centeredBox(widthM, depthM, scale)

  if (id === 'studio') {
    return [{ x, y, width: w, height: h, type: 'room' }]
  }

  if (id === 'two_room') {
    // Two rooms sharing a wall down the middle. The editor draws the walls
    // from the room outlines, so the split is all that has to be seeded.
    const leftW = Math.round(w * 0.55)
    return [
      { x, y, width: leftW, height: h, type: 'room' },
      { x: x + leftW, y, width: w - leftW, height: h, type: 'room' },
    ]
  }

  if (id === 'l_room') {
    const colW = Math.round(w * 0.55)
    const barH = Math.round(h * 0.45)
    return [
      { x, y, width: colW, height: h, type: 'room' },
      { x: x + colW, y: y + (h - barH), width: w - colW, height: barH, type: 'room' },
    ]
  }

  if (id === 'balcony') {
    // A balcony is a decked surface, not lawn.
    return [{ x, y, width: w, height: h, type: 'deck' }]
  }

  if (id === 'l_shape') {
    // L = a full-height left column plus a bottom bar filling the rest, built
    // from two lawn rectangles (zones are axis-aligned rects).
    const colW = Math.round(w * 0.55)
    const barH = Math.round(h * 0.45)
    return [
      { x, y, width: colW, height: h, type: 'lawn' },
      { x: x + colW, y: y + (h - barH), width: w - colW, height: barH, type: 'lawn' },
    ]
  }

  // rectangle
  return [{ x, y, width: w, height: h, type: 'lawn' }]
}

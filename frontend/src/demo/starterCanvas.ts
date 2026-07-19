import type { CanvasData } from '../types'

export interface StarterZoneLabels {
  fence: string
  backBorder: string
  border: string
  lawn: string
  terrace: string
}

/**
 * Starter layout for a brand-new outdoor garden ("begin met een
 * voorbeeldopzet"): a simplified cousin of the public demo garden — fences,
 * back border, two side borders, lawn and terrace at a realistic 7.5 × 11 m.
 * New users tweak this in the editor instead of facing a blank canvas, and
 * sun mode means something the moment a location is set.
 */
export function buildStarterCanvas(labels: StarterZoneLabels): CanvasData {
  return {
    scale_px_per_m: 46,
    canvas_w: 500,
    canvas_h: 640,
    mapType: 'outdoor',
    zones: [
      { id: 'fence-n', type: 'fence', shape: 'rect', x: 60, y: 30, width: 345, height: 10, label: labels.fence, fenceMaterial: 'wood', fenceHeightM: 1.8 },
      { id: 'fence-w', type: 'fence', shape: 'rect', x: 50, y: 30, width: 10, height: 516, label: labels.fence, fenceMaterial: 'wood', fenceHeightM: 1.8 },
      { id: 'fence-e', type: 'fence', shape: 'rect', x: 405, y: 30, width: 10, height: 516, label: labels.fence, fenceMaterial: 'wood', fenceHeightM: 1.8 },
      { id: 'border-back', type: 'soil', shape: 'rect', x: 60, y: 40, width: 345, height: 70, label: labels.backBorder },
      { id: 'border-w', type: 'soil', shape: 'rect', x: 60, y: 110, width: 45, height: 316, label: labels.border },
      { id: 'border-e', type: 'soil', shape: 'rect', x: 360, y: 110, width: 45, height: 316, label: labels.border },
      { id: 'lawn', type: 'lawn', shape: 'rect', x: 105, y: 110, width: 255, height: 316, label: labels.lawn },
      { id: 'terras', type: 'deck', shape: 'rect', x: 60, y: 426, width: 345, height: 120, label: labels.terrace },
    ],
    // Outset 2px past the surface zones so heatmap edge cells (all four
    // corners must fall strictly inside) reach the fences instead of dropping
    // the outermost row — same trick as the demo garden.
    gardenPerimeter: [
      [58, 38], [407, 38], [407, 548], [58, 548],
    ],
  }
}

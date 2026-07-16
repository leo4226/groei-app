export interface ViewportPan {
  x: number
  y: number
}

/**
 * Reposition a transformed SVG group so the viewport centre stays fixed while
 * its scale changes. Without this, SVG scales from (0, 0), pinning zoomed-out
 * editor content to the top-left corner.
 */
export function zoomAroundViewportCenter(
  pan: ViewportPan,
  currentZoom: number,
  nextZoom: number,
  viewportWidth: number,
  viewportHeight: number,
): ViewportPan {
  if (currentZoom === nextZoom) return pan

  const centreX = viewportWidth / 2
  const centreY = viewportHeight / 2
  const scaleRatio = nextZoom / currentZoom

  return {
    x: centreX - (centreX - pan.x) * scaleRatio,
    y: centreY - (centreY - pan.y) * scaleRatio,
  }
}

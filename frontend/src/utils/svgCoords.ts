import type { MapObject, GroundZone } from '../types'

const PX_PER_CM = 0.46

export function screenToSVG(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  if (!vb || vb.width === 0 || vb.height === 0) return null

  const relX = clientX - rect.left
  const relY = clientY - rect.top

  // Get CSS dimensions using getComputedStyle — this ALWAYS reflects the
  // pre-transform computed pixel values, unlike clientWidth/clientHeight
  // which can return post-transform (rotated) dimensions on some mobile
  // browsers (notably iOS Safari / WebKit).
  //
  // parseFloat strips the "px" suffix, and fallback values (NaN → 0)
  // pair with the rect-based fallback below.
  let cssW = parseFloat(window.getComputedStyle(svg).width)
  let cssH = parseFloat(window.getComputedStyle(svg).height)

  // getComputedStyle returns the CSS logical dimensions, so once we have
  // them reliably, the rotation detection below is correct on all browsers.
  if (!cssW || !cssH) {
    // Last-resort fallback: some older mobile browsers report 0 for SVG
    // computed dimensions. Use the visual rect as a proxy — without rotation
    // detection, coordinates will be slightly off but at least functional.
    cssW = rect.width
    cssH = rect.height
  }

  let cssX = relX
  let cssY = relY

  // Detect CSS visual rotation by comparing pre-transform (getComputedStyle)
  // with post-transform (getBoundingClientRect) dimensions.
  // A 90-degree rotation swaps width ↔ height.
  // After rotate(-90deg): rect.width ≈ cssH, rect.height ≈ cssW
  const isRotated90 =
    cssW > 0 && cssH > 0 &&
    Math.abs(rect.width - cssH) < 1 &&
    Math.abs(rect.height - cssW) < 1

  if (isRotated90) {
    // The SVG has a CSS rotation (rotate(-90deg) translateX(-100%) with
    // transform-origin: top left). The full transform matrix M maps
    // CSS space (x, y) → screen-relative (sx, sy):
    //
    //   Step 1: translate(-cssW, 0)  →  (x - cssW, y)
    //   Step 2: rotate(-90deg)       →  (y, cssW - x)
    //
    // Visual bounding rect corners:
    //   (0,0)       → (0, cssW)
    //   (cssW, 0)   → (0, 0)
    //   (cssW,cssH) → (cssH, 0)
    //   (0, cssH)   → (cssH, cssW)
    //
    // Visual rect top-left is at (0, 0) in screen-relative space,
    // spanning width=cssH, height=cssW.
    //
    // Inverse: given screen-relative (relX, relY):
    //   relX = cssY          →  cssY = relX
    //   relY = cssW - cssX   →  cssX = cssW - relY
    cssX = cssW - relY
    cssY = relX
  }

  // Map CSS-space coordinates to viewBox with preserveAspectRatio="xMidYMid meet"
  const scale = Math.min(cssW / vb.width, cssH / vb.height)
  const offsetX = (cssW - vb.width * scale) / 2
  const offsetY = (cssH - vb.height * scale) / 2

  return {
    x: (cssX - offsetX) / scale,
    y: (cssY - offsetY) / scale,
  }
}

export function svgToObjectLocal(
  svgX: number,
  svgY: number,
  objectX: number,
  objectY: number,
  rotationDeg: number,
): { x: number; y: number } {
  const dx = svgX - objectX
  const dy = svgY - objectY
  const rad = (-rotationDeg * Math.PI) / 180
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad),
    y: dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

export function isInsideBounds(
  x: number,
  y: number,
  viewbox: string
): boolean {
  const [, , w, h] = viewbox.split(' ').map(Number)
  return x >= 0 && x <= w && y >= 0 && y <= h
}

/** Ray-casting algorithm for point-in-polygon test. */
export function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function isInsideZone(x: number, y: number, zones: GroundZone[]): GroundZone | null {
  for (const zone of zones) {
    const polygon: [number, number][] = JSON.parse(zone.polygon)
    if (pointInPolygon(x, y, polygon)) return zone
  }
  return null
}

export type DropTarget =
  | { type: 'container'; target: MapObject }
  | { type: 'zone'; target: GroundZone }
  | { type: 'map'; target: null }

export function resolveDropTarget(
  x: number,
  y: number,
  objects: MapObject[],
  zones: GroundZone[],
): DropTarget {
  const container = findContainerAtPoint(x, y, objects)
  if (container) return { type: 'container', target: container }
  const zone = isInsideZone(x, y, zones)
  if (zone) return { type: 'zone', target: zone }
  return { type: 'map', target: null }
}

export function findContainerAtPoint(
  svgX: number,
  svgY: number,
  objects: MapObject[]
): MapObject | null {
  for (const obj of objects) {
    if (obj.map_x == null || obj.map_y == null) continue
    if (obj.object_type === 'furniture') continue

    const local = svgToObjectLocal(svgX, svgY, obj.map_x, obj.map_y, obj.rotation ?? 0)

    switch (obj.shape) {
      case 'circle': {
        const r = ((obj.diameter_cm || 30) * PX_PER_CM) / 2
        if (local.x * local.x + local.y * local.y <= r * r) return obj
        break
      }
      case 'square': {
        const half = ((obj.width_cm || 30) * PX_PER_CM) / 2
        if (Math.abs(local.x) <= half && Math.abs(local.y) <= half) return obj
        break
      }
      case 'rectangle': {
        const hw = ((obj.width_cm || 80) * PX_PER_CM) / 2
        const hd = ((obj.depth_cm || 40) * PX_PER_CM) / 2
        if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hd) return obj
        break
      }
    }
  }
  return null
}

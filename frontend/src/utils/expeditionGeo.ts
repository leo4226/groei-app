// Geometry helpers for the field-journal expedition map (issue #564).
//
// Projection: local plate carrée — x = lon · cos(midLat), y = −lat — which
// keeps shapes near the pins' latitude visually undistorted without a real
// map library. All fitting/clustering happens in screen pixels so pin sizes
// and strokes stay constant regardless of zoom extent.

export type GeoEntry = {
  id: number
  lat: number
  lon: number
  /** 1-based chronological number of the discovery (oldest = 1). */
  index: number
}

export type ProjectedEntry = GeoEntry & { x: number; y: number }

export type PinCluster = {
  x: number
  y: number
  /** Entry ids, newest last (chronological). */
  ids: number[]
  /** Chronological numbers of the clustered entries. */
  indices: number[]
}

export type FitTransform = {
  toScreen: (lon: number, lat: number) => [number, number]
  /** Visible geographic window (degrees), for graticule generation. */
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
}

const DEG = Math.PI / 180

/**
 * An explicit camera over the projected plane: `cx`/`cy` are the projected
 * centre (x = lon·k, y = −lat), `scale` is px per projected unit, and `k` is
 * the latitude correction frozen at fit time so panning doesn't reshape land.
 */
export type MapView = { k: number; cx: number; cy: number; scale: number }

/**
 * Compute the camera that fits all entries into a width×height canvas with
 * padding. A minimum geographic span keeps a single pin (or a tight cluster)
 * from zooming into a featureless void.
 */
export function fitView(
  entries: { lat: number; lon: number }[],
  width: number,
  height: number,
  padding = 48,
  minSpanDeg = 4,
): MapView {
  const lats = entries.map(e => e.lat)
  const lons = entries.map(e => e.lon)
  const midLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 52
  const k = Math.max(0.2, Math.cos(midLat * DEG))

  let x0 = Math.min(...lons) * k
  let x1 = Math.max(...lons) * k
  let y0 = -Math.max(...lats)
  let y1 = -Math.min(...lats)
  if (!entries.length) { x0 = -25 * k; x1 = 45 * k; y0 = -62; y1 = -34 }

  // enforce minimum span, centred
  const minX = minSpanDeg * k
  if (x1 - x0 < minX) { const c = (x0 + x1) / 2; x0 = c - minX / 2; x1 = c + minX / 2 }
  if (y1 - y0 < minSpanDeg) { const c = (y0 + y1) / 2; y0 = c - minSpanDeg / 2; y1 = c + minSpanDeg / 2 }

  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const scale = Math.min(innerW / (x1 - x0), innerH / (y1 - y0))
  return { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale }
}

/** Materialise a camera into a lon/lat → px transform + visible window. */
export function viewToTransform(view: MapView, width: number, height: number): FitTransform {
  const { k, cx, cy, scale } = view
  const toScreen = (lon: number, lat: number): [number, number] => [
    width / 2 + (lon * k - cx) * scale,
    height / 2 + (-lat - cy) * scale,
  ]
  return {
    toScreen,
    lonMin: (cx - (width / 2) / scale) / k,
    lonMax: (cx + (width / 2) / scale) / k,
    latMax: -(cy - (height / 2) / scale),
    latMin: -(cy + (height / 2) / scale),
  }
}

/** Fit + materialise in one step (kept for callers/tests of the static map). */
export function fitTransform(
  entries: { lat: number; lon: number }[],
  width: number,
  height: number,
  padding = 48,
  minSpanDeg = 4,
): FitTransform {
  return viewToTransform(fitView(entries, width, height, padding, minSpanDeg), width, height)
}

/** Pick a graticule step (degrees) that yields a handful of lines. */
export function graticuleStep(spanDeg: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 45]
  for (const s of steps) {
    if (spanDeg / s <= 8) return s
  }
  return 45
}

/**
 * Greedy screen-space clustering: entries within `epsilonPx` of an existing
 * cluster centroid join it. Input must be chronological (index ascending) so
 * cluster ids/indices stay chronological.
 */
export function clusterEntries(entries: ProjectedEntry[], epsilonPx = 30): PinCluster[] {
  const clusters: PinCluster[] = []
  for (const e of entries) {
    const hit = clusters.find(c => Math.hypot(c.x - e.x, c.y - e.y) <= epsilonPx)
    if (hit) {
      hit.ids.push(e.id)
      hit.indices.push(e.index)
      // keep centroid stable-ish: weighted mean
      const n = hit.ids.length
      hit.x = hit.x + (e.x - hit.x) / n
      hit.y = hit.y + (e.y - hit.y) / n
    } else {
      clusters.push({ x: e.x, y: e.y, ids: [e.id], indices: [e.index] })
    }
  }
  return clusters
}

/**
 * Count distinct "places" by geographic proximity (~0.3° ≈ 25 km at 52°N).
 * Used for the masthead stat; independent from screen clustering.
 */
export function countPlaces(entries: { lat: number; lon: number }[], epsilonDeg = 0.3): number {
  const centers: { lat: number; lon: number }[] = []
  for (const e of entries) {
    if (!centers.some(c => Math.hypot(c.lat - e.lat, (c.lon - e.lon) * Math.cos(e.lat * DEG)) <= epsilonDeg)) {
      centers.push(e)
    }
  }
  return centers.length
}

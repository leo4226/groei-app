import { useEffect, useMemo, useRef, useState } from 'react'
import { WORLD_LAND_RINGS } from '../../utils/worldLand'
import {
  fitView, viewToTransform, graticuleStep, clusterEntries,
  type GeoEntry, type ProjectedEntry, type PinCluster, type MapView,
} from '../../utils/expeditionGeo'
import Glyph from '../ui/Glyph'

interface Props {
  /** Entries with coordinates, chronological (index ascending). */
  entries: GeoEntry[]
  /** Called with the entry ids of the clicked pin/cluster (chronological). */
  onSelect?: (ids: number[]) => void
  /** Canvas size; the SVG scales responsively to its container. */
  width?: number
  height?: number
  /** Compact variant for the detail mini-map: static, no route, no numbers. */
  compact?: boolean
  /** North/south + east/west letters, e.g. ['N','Z','O','W'] for NL. */
  compass?: [string, string, string, string]
}

const INK_MUTED = 'var(--color-text-muted)'
const TERRA = 'var(--color-secondary)'
// A cluster whose finds all sit within ~200 m can't be separated by zooming.
const SPLITTABLE_SPAN_DEG = 0.002

/**
 * Expedition map — paper-toned SVG with real (simplified) coastlines that
 * auto-zooms to the discovery pins, clusters nearby finds, and draws a
 * dashed route through them in order of discovery. Interactive unless
 * `compact`: drag to pan, wheel/pinch/buttons to zoom; clusters recompute
 * per zoom level and clicking a splittable cluster zooms into it.
 */
export default function ExpeditionMap({
  entries,
  onSelect,
  width = 760,
  height = 400,
  compact = false,
  compass = ['N', 'Z', 'O', 'W'],
}: Props) {
  const pad = compact ? 34 : 52
  const interactive = !compact

  const baseView = useMemo(
    () => fitView(entries, width, height, pad, compact ? 2 : 4),
    [entries, width, height, pad, compact],
  )
  const [override, setOverride] = useState<MapView | null>(null)
  const view = override ?? baseView

  // New data (or a resize) invalidates a hand-adjusted camera.
  useEffect(() => { setOverride(null) }, [baseView])

  const minScale = baseView.scale * 0.4
  const maxScale = (height - pad) / 0.02 // ≈2 km of latitude across the canvas

  const svgRef = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragged = useRef(false)

  function clampView(v: MapView): MapView {
    return { ...v, scale: Math.min(maxScale, Math.max(minScale, v.scale)) }
  }

  function zoomAt(px: number, py: number, factor: number) {
    setOverride(prev => {
      const cur = prev ?? baseView
      const scale = Math.min(maxScale, Math.max(minScale, cur.scale * factor))
      if (scale === cur.scale) return prev
      // keep the projected point under the cursor fixed
      const ux = cur.cx + (px - width / 2) / cur.scale
      const uy = cur.cy + (py - height / 2) / cur.scale
      return { ...cur, scale, cx: ux - (px - width / 2) / scale, cy: uy - (py - height / 2) / scale }
    })
  }

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    if (!interactive) return
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (width / rect.width)
      const py = (e.clientY - rect.top) * (height / rect.height)
      zoomAt(px, py, e.deltaY < 0 ? 1.25 : 0.8)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // zoomAt reads state through the setter, so this effect only depends on geometry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, width, height, baseView, minScale, maxScale])

  function svgPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (width / rect.width),
      y: (e.clientY - rect.top) * (height / rect.height),
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!interactive) return
    // Don't capture yet: capturing retargets the compatibility `click` to the
    // svg, which would make the pins unclickable. Capture starts on real drag.
    pointers.current.set(e.pointerId, svgPoint(e))
    if (pointers.current.size === 1) dragged.current = false
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!interactive || !pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    const cur = svgPoint(e)
    pointers.current.set(e.pointerId, cur)

    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      if (!dragged.current && Math.hypot(dx, dy) <= 1.5) return
      if (!dragged.current) {
        dragged.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      setOverride(p => {
        const v = p ?? baseView
        return { ...v, cx: v.cx - dx / v.scale, cy: v.cy - dy / v.scale }
      })
    } else if (pointers.current.size === 2) {
      // pinch: scale by the distance ratio around the midpoint, pan with it
      dragged.current = true
      const pts = [...pointers.current.values()]
      const other = pts.find(p => p !== cur) ?? pts[0]
      const dPrev = Math.hypot(prev.x - other.x, prev.y - other.y)
      const dCur = Math.hypot(cur.x - other.x, cur.y - other.y)
      if (dPrev > 0 && dCur > 0) {
        const mid = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 }
        zoomAt(mid.x, mid.y, dCur / dPrev)
      }
    }
  }

  function onPointerEnd(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId)
  }

  const { landPaths, latLines, lonLines, clusters, routeD, newestClusterIdx } = useMemo(() => {
    const t = viewToTransform(view, width, height)

    // Land — only rings that intersect the visible window (cheap bbox test)
    const landPaths: string[] = []
    for (const ring of WORLD_LAND_RINGS) {
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
      for (let i = 0; i < ring.length; i += 2) {
        if (ring[i] < minLon) minLon = ring[i]
        if (ring[i] > maxLon) maxLon = ring[i]
        if (ring[i + 1] < minLat) minLat = ring[i + 1]
        if (ring[i + 1] > maxLat) maxLat = ring[i + 1]
      }
      if (maxLon < t.lonMin || minLon > t.lonMax || maxLat < t.latMin || minLat > t.latMax) continue
      let d = ''
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = t.toScreen(ring[i], ring[i + 1])
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)
      }
      landPaths.push(d + 'Z')
    }

    // Graticule
    const step = graticuleStep(Math.max(t.lonMax - t.lonMin, t.latMax - t.latMin))
    const latLines: { y: number; label: string }[] = []
    for (let lat = Math.ceil(t.latMin / step) * step; lat <= t.latMax; lat += step) {
      const [, y] = t.toScreen(t.lonMin, lat)
      latLines.push({ y, label: `${Math.abs(Math.round(lat * 10) / 10)}°${lat >= 0 ? compass[0] : compass[1]}` })
    }
    const lonLines: { x: number; label: string }[] = []
    for (let lon = Math.ceil(t.lonMin / step) * step; lon <= t.lonMax; lon += step) {
      const [x] = t.toScreen(lon, t.latMin)
      lonLines.push({ x, label: `${Math.abs(Math.round(lon * 10) / 10)}°${lon >= 0 ? compass[2] : compass[3]}` })
    }

    // Pins → clusters (input chronological); clusters split as scale grows
    const projected: ProjectedEntry[] = entries.map(e => {
      const [x, y] = t.toScreen(e.lon, e.lat)
      return { ...e, x, y }
    })
    const clusters = clusterEntries(projected, compact ? 18 : 32)

    // Route through cluster centroids in order of each cluster's first find
    const ordered = [...clusters].sort((a, b) => a.indices[0] - b.indices[0])
    const routeD = ordered.length > 1
      ? ordered.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
      : null

    // Highlight the cluster containing the newest find
    const maxIndex = Math.max(...entries.map(e => e.index), 0)
    const newestClusterIdx = clusters.findIndex(c => c.indices.includes(maxIndex))

    return { landPaths, latLines, lonLines, clusters, routeD, newestClusterIdx }
  }, [entries, view, width, height, compact, compass])

  function pinLabel(c: PinCluster): string {
    return c.ids.length > 1 ? String(c.ids.length) : String(c.indices[0])
  }

  function handlePinActivate(c: PinCluster) {
    if (dragged.current) { dragged.current = false; return }
    if (interactive && c.ids.length > 1) {
      const members = entries.filter(e => c.ids.includes(e.id))
      const latSpan = Math.max(...members.map(m => m.lat)) - Math.min(...members.map(m => m.lat))
      const lonSpan = (Math.max(...members.map(m => m.lon)) - Math.min(...members.map(m => m.lon))) * view.k
      if (Math.max(latSpan, lonSpan) > SPLITTABLE_SPAN_DEG) {
        // zoom into the cluster so it splits instead of opening one entry
        setOverride(clampView(fitView(members, width, height, pad, 0.02)))
        return
      }
    }
    onSelect?.(c.ids)
  }

  const svg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full h-auto select-none"
      role="img"
      style={interactive ? { touchAction: 'none', cursor: 'grab' } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={interactive ? (e) => { const p = svgPoint(e); zoomAt(p.x, p.y, 1.6) } : undefined}
    >
      <rect width={width} height={height} fill="var(--color-surface)" />

      {/* land */}
      <g fill="var(--color-bg-warm)" stroke="var(--color-border-soft)" strokeWidth="1">
        {landPaths.map((d, i) => <path key={i} d={d} />)}
      </g>

      {/* graticule */}
      <g stroke="var(--color-border-soft)" strokeWidth="0.75" strokeDasharray="1 3">
        {latLines.map((l, i) => <line key={`la${i}`} x1={0} y1={l.y} x2={width} y2={l.y} />)}
        {lonLines.map((l, i) => <line key={`lo${i}`} x1={l.x} y1={0} x2={l.x} y2={height} />)}
      </g>
      {!compact && (
        <g fontFamily="var(--font-mono)" fontSize="8" fill={INK_MUTED} opacity="0.85">
          {latLines.map((l, i) => <text key={`lal${i}`} x={5} y={l.y - 3}>{l.label}</text>)}
          {lonLines.map((l, i) => <text key={`lol${i}`} x={l.x + 3} y={height - 6}>{l.label}</text>)}
        </g>
      )}

      {/* route */}
      {!compact && routeD && (
        <path d={routeD} fill="none" stroke={TERRA} strokeWidth="1.6"
              strokeDasharray="5 6" strokeLinecap="round" opacity="0.7" />
      )}

      {/* pins */}
      {clusters.map((c, i) => {
        const isCluster = c.ids.length > 1
        const isNewest = i === newestClusterIdx
        const r = compact ? 7 : isCluster ? 12 : 9
        return (
          <g
            key={i}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={onSelect || interactive ? () => handlePinActivate(c) : undefined}
            onKeyDown={onSelect ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePinActivate(c) }
            } : undefined}
          >
            {isNewest && <circle cx={c.x} cy={c.y} r={r + 8} fill={isCluster ? 'rgba(47,93,58,.10)' : 'rgba(178,102,74,.16)'} />}
            <circle
              cx={c.x} cy={c.y} r={r}
              fill={isCluster ? 'var(--color-primary)' : TERRA}
              stroke="var(--color-paper)" strokeWidth="2"
            />
            {!compact && (
              <text
                x={c.x} y={c.y + 3} textAnchor="middle"
                fontFamily="var(--font-mono)" fontSize={isCluster ? 10 : 8.5}
                fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}
              >
                {pinLabel(c)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )

  if (!interactive) return svg

  const zoomBtn = 'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-paper/90 text-text-soft shadow-sm transition-colors hover:border-primary hover:text-primary'

  return (
    <div className="relative">
      {svg}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" aria-label="Zoom in" className={zoomBtn}
                onClick={() => zoomAt(width / 2, height / 2, 1.5)}>
          <span className="text-base leading-none">+</span>
        </button>
        <button type="button" aria-label="Zoom out" className={zoomBtn}
                onClick={() => zoomAt(width / 2, height / 2, 1 / 1.5)}>
          <span className="text-base leading-none">−</span>
        </button>
        {override && (
          <button type="button" aria-label="Reset" className={zoomBtn}
                  onClick={() => setOverride(null)}>
            <Glyph name="refresh" size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

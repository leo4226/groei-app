import { useMemo } from 'react'
import { WORLD_LAND_RINGS } from '../../utils/worldLand'
import {
  fitTransform, graticuleStep, clusterEntries,
  type GeoEntry, type ProjectedEntry, type PinCluster,
} from '../../utils/expeditionGeo'

interface Props {
  /** Entries with coordinates, chronological (index ascending). */
  entries: GeoEntry[]
  /** Called with the entry ids of the clicked pin/cluster (chronological). */
  onSelect?: (ids: number[]) => void
  /** Canvas size; the SVG scales responsively to its container. */
  width?: number
  height?: number
  /** Compact variant for the detail mini-map: no route, no numbers. */
  compact?: boolean
  /** East/west + north/south letters, e.g. ['N','Z','O','W'] for NL. */
  compass?: [string, string, string, string]
}

const INK_MUTED = 'var(--color-text-muted)'
const TERRA = 'var(--color-secondary)'

/**
 * Expedition map — paper-toned SVG with real (simplified) coastlines that
 * auto-zooms to the discovery pins, clusters nearby finds, and draws a
 * dashed route through them in order of discovery.
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

  const { landPaths, latLines, lonLines, clusters, routeD, newestClusterIdx } = useMemo(() => {
    const t = fitTransform(entries, width, height, pad, compact ? 2 : 4)

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
      latLines.push({ y, label: `${Math.abs(lat)}°${lat >= 0 ? compass[0] : compass[1]}` })
    }
    const lonLines: { x: number; label: string }[] = []
    for (let lon = Math.ceil(t.lonMin / step) * step; lon <= t.lonMax; lon += step) {
      const [x] = t.toScreen(lon, t.latMin)
      lonLines.push({ x, label: `${Math.abs(lon)}°${lon >= 0 ? compass[2] : compass[3]}` })
    }

    // Pins → clusters (input chronological)
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
  }, [entries, width, height, pad, compact, compass])

  function pinLabel(c: PinCluster): string {
    return c.ids.length > 1 ? String(c.ids.length) : String(c.indices[0])
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full h-auto"
      role="img"
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
            onClick={onSelect ? () => onSelect(c.ids) : undefined}
            onKeyDown={onSelect ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.ids) }
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
}

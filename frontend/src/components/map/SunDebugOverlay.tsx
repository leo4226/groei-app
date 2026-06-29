/**
 * Sun-model debug overlay. Mount when URL contains ?debug=sun.
 * All coordinates in the landscape SVG frame (post-migration).
 *
 * Features:
 *   1. Sun-direction arrow from garden centre toward the sun bearing
 *   2. Shadow-direction arrow (opposite)
 *   3. Compass rose (N offset by the map's bearing from SVG-top)
 *   4. Shadow-tip dots for each caster
 *   5. Time picker (reads ?t=<iso> from URL, falls back to new Date())
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ShadowCaster } from '../../utils/gardenStructures'
import { getSunPosition } from '../../utils/sunCalc'
import type { SunPosition } from '../../utils/sunCalc'
import Glyph from '../ui/Glyph'

function parseSunTime(): Date {
  const params = new URLSearchParams(window.location.search)
  const t = params.get('t')
  if (t) {
    const d = new Date(t)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

function ArrowHead({ x, y, angle }: { x: number; y: number; angle: number }) {
  const size = 8
  const rad = (angle * Math.PI) / 180
  const ax = x - size * Math.sin(rad - 0.4)
  const ay = y + size * Math.cos(rad - 0.4)
  const bx = x - size * Math.sin(rad + 0.4)
  const by = y + size * Math.cos(rad + 0.4)
  return <polygon points={`${x},${y} ${ax},${ay} ${bx},${by}`} fill="currentColor" />
}

interface Props {
  sunPosition: SunPosition | null
  /** Map bearing — compass direction of the map's "up" in degrees CW from north */
  bearing: number
  /** Garden bounding rectangle in SVG coordinates */
  gardenBounds: { x: number; y: number; width: number; height: number }
  /** Map GPS coordinates — used as fallback when no externalSun position is given */
  lat: number
  lon: number
  shadowCasters?: ShadowCaster[]
}

export default function SunDebugOverlay({ sunPosition: externalSun, bearing, gardenBounds, lat, lon, shadowCasters = [] }: Props) {
  const [sunDate, setSunDate] = useState<Date>(parseSunTime)

  // Re-read URL ?t= on mount
  useEffect(() => {
    setSunDate(parseSunTime())
  }, [])

  // Prefer the parent's sun position (driven by the same timeline as shadow polygons).
  // Fall back to local date picker only when no external position is provided.
  const sun = externalSun ?? getSunPosition(sunDate, lat, lon)
  const cx = gardenBounds.x + gardenBounds.width / 2
  const cy = gardenBounds.y + gardenBounds.height / 2

  // SVG angle for a compass bearing
  const compassToSvgRad = (compassDeg: number) =>
    (compassDeg - bearing) * (Math.PI / 180)

  const sunRad = sun.isUp ? compassToSvgRad(sun.azimuthDeg) : null
  const arrowLen = sun.isUp
    ? Math.min(300, 60 / Math.tan(sun.altitudeDeg * Math.PI / 180))
    : 120

  // Sun arrow end
  const sunEndX = sunRad !== null ? cx + Math.sin(sunRad) * arrowLen : cx
  const sunEndY = sunRad !== null ? cy - Math.cos(sunRad) * arrowLen : cy
  // Shadow arrow end (opposite)
  const shdEndX = sunRad !== null ? cx - Math.sin(sunRad) * arrowLen : cx
  const shdEndY = sunRad !== null ? cy + Math.cos(sunRad) * arrowLen : cy

  // Compass-bearing for ArrowHead's local angle param needs the same offset
  const azToSvgDeg = (compassDeg: number) => compassDeg - bearing

  // Shadow-tip dots for each caster
  const shadowTips = sun.isUp && sunRad !== null
    ? shadowCasters.map((c) => {
        const altRad = sun.altitudeDeg * (Math.PI / 180)
        const factor = Math.min(1 / Math.tan(altRad), 6)
        const dx = -Math.sin(sunRad) * c.heightCm * 0.46 * factor
        const dy = Math.cos(sunRad) * c.heightCm * 0.46 * factor
        const cx = c.type === 'circle' ? c.cx : c.type === 'polygon' ? c.points.reduce((s, p) => s + p[0], 0) / c.points.length : c.x + c.width / 2
        const cy = c.type === 'circle' ? c.cy : c.type === 'polygon' ? c.points.reduce((s, p) => s + p[1], 0) / c.points.length : c.y + c.height / 2
        const tx = cx + dx
        const ty = cy + dy
        return { id: c.id, tx, ty }
      })
    : []

  // Compass rose in top-left corner of garden bounds
  const roseX = gardenBounds.x + 20
  const roseY = gardenBounds.y + 20
  const roseR = 18
  const northAngleDeg = -bearing  // N is `bearing` CCW from SVG-top
  const northRad = northAngleDeg * (Math.PI / 180)
  const nX = roseX + Math.sin(northRad) * roseR
  const nY = roseY - Math.cos(northRad) * roseR

  const isoStr = sunDate.toISOString().slice(0, 16)

  return (
    <>
      {/* ── SVG layer (inside the map SVG via portal or direct render) ── */}
      <g style={{ pointerEvents: 'none' }}>
        {/* Shadow arrow */}
        {sun.isUp && (
          <g color="#475569">
            <line x1={cx} y1={cy} x2={shdEndX} y2={shdEndY} stroke="currentColor" strokeWidth={3} strokeDasharray="6 3" opacity={0.8} />
            <ArrowHead x={shdEndX} y={shdEndY} angle={azToSvgDeg(sun.azimuthDeg + 180)} />
            <text x={shdEndX + 6} y={shdEndY} fill="currentColor" fontSize={9} fontWeight="600">
              shadow
            </text>
          </g>
        )}

        {/* Sun arrow */}
        {sun.isUp && (
          <g color="#f59e0b">
            <line x1={cx} y1={cy} x2={sunEndX} y2={sunEndY} stroke="currentColor" strokeWidth={3} opacity={0.9} />
            <ArrowHead x={sunEndX} y={sunEndY} angle={azToSvgDeg(sun.azimuthDeg)} />
            <text x={sunEndX + 6} y={sunEndY} fill="currentColor" fontSize={9} fontWeight="600">
              az={Math.round(sun.azimuthDeg)}° alt={Math.round(sun.altitudeDeg)}°
            </text>
          </g>
        )}

        {/* Compass rose */}
        <circle cx={roseX} cy={roseY} r={roseR + 4} fill="rgba(0,0,0,0.5)" />
        <line x1={roseX} y1={roseY} x2={nX} y2={nY} stroke="#d4a843" strokeWidth={2.5} />
        <circle cx={nX} cy={nY} r={3} fill="#d4a843" />
        <text x={nX + 4} y={nY + 4} fill="#d4a843" fontSize={8} fontWeight="700">N</text>
        {/* SVG-top tick */}
        <line x1={roseX} y1={roseY} x2={roseX} y2={roseY - roseR} stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} />
        <text x={roseX + 2} y={roseY - roseR + 8} fill="rgba(255,255,255,0.5)" fontSize={7}>top</text>

        {/* Shadow tips */}
        {shadowTips.map(({ id, tx, ty }) => (
          <g key={id}>
            <circle cx={tx} cy={ty} r={4} fill="rgba(100,120,200,0.7)" stroke="white" strokeWidth={1} />
            <text x={tx + 5} y={ty + 4} fill="rgba(200,210,255,0.9)" fontSize={7}>{id}</text>
          </g>
        ))}
      </g>

      {/* ── HTML time picker — portalled to document.body so it sits outside the SVG ── */}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 9999,
            background: 'rgba(15,23,42,0.88)',
            borderRadius: 8,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'all',
          }}
        >
          <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Glyph name="sun" size={12} /> debug
          </span>
          <input
            type="datetime-local"
            value={isoStr}
            onChange={(e) => {
              const d = new Date(e.target.value)
              if (!isNaN(d.getTime())) setSunDate(d)
            }}
            style={{
              fontSize: 11,
              background: 'transparent',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
              padding: '2px 4px',
            }}
          />
          {!sun.isUp && (
            <span style={{ color: '#94a3b8', fontSize: 10 }}>zon onder</span>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

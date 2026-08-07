import { useRef } from 'react'
import { useT } from '../../context/LanguageContext'
import type { MapInfo } from '../../types'
import { screenToSVG } from '../../utils/svgCoords'
import { roundMapPos, type MapPos } from '../../pages/addPlant/placementModel'
import Glyph from '../ui/Glyph'

interface Props {
  map: MapInfo
  value: MapPos | null
  onChange: (pos: MapPos) => void
}

/**
 * Tap-to-place picker for the add-plant flow.
 *
 * Renders the selected map's background SVG inside an overlay that shares its
 * viewBox, so pointer taps convert cleanly to map coordinates via
 * `screenToSVG` — the same transform the editor and MapView use. A marker
 * shows where the plant would land; the user can re-tap to move it.
 *
 * Opt-in: when the user never taps, the caller falls back to its existing
 * random placement.
 */
export default function PlacementPicker({ map, value, onChange }: Props) {
  const t = useT()
  const svgRef = useRef<SVGSVGElement>(null)

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const pt = screenToSVG(svg, e.clientX, e.clientY)
    if (!pt) return
    onChange(roundMapPos(pt.x, pt.y))
  }

  const [vx0, vy0, vw, vh] = map.viewbox.trim().split(/\s+/).map(Number)
  const hasViewbox = [vx0, vy0, vw, vh].every(n => Number.isFinite(n))

  return (
    <div className="space-y-1.5">
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        {!hasViewbox ? (
          <div className="p-4 text-center text-[12px] text-text-muted">{t.addPlant.placePickerUnavailable}</div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`${vx0} ${vy0} ${vw} ${vh}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={handlePointerDown}
            className="block h-48 w-full cursor-crosshair touch-none select-none"
            role="button"
            aria-label={t.addPlant.placePickerHint}
          >
            {/* Map background image, letterboxed like MapPage does */}
            <image
              href={`/maps/${map.svg_file}`}
              x={vx0}
              y={vy0}
              width={vw}
              height={vh}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: 'none' }}
            />

            {value && (
              <g pointerEvents="none">
                {/* halo for visibility on busy backgrounds */}
                <circle cx={value.x} cy={value.y} r={14} fill="rgba(255,255,255,0.85)" />
                <circle cx={value.x} cy={value.y} r={10} fill="var(--color-primary)" stroke="#fff" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
      </div>
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-text-muted">
        <Glyph name="pin" size={12} />
        {value
          ? t.addPlant.placePickerSet
          : t.addPlant.placePickerHint}
      </p>
    </div>
  )
}

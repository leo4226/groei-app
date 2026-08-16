import { useRef, useCallback } from 'react'
import { useT } from '../../context/LanguageContext'

const CARDINALS: [number, string][] = [
  [0, 'N'], [45, 'NO'], [90, 'O'], [135, 'ZO'],
  [180, 'Z'], [225, 'ZW'], [270, 'W'], [315, 'NW'],
]

function bearingToCardinal(deg: number): string {
  const labels = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO',
                  'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW']
  const i = Math.round(((deg % 360 + 360) % 360) / 22.5) % 16
  return labels[i]
}

interface Props {
  value: number
  onChange: (bearing: number) => void
  /** When true the dial renders statically — viewers see the bearing but cannot drag it. */
  disabled?: boolean
}

const SIZE = 180
const CENTER = SIZE / 2
const RING_R = 78
const SNAP_DEG = 3

export default function CompassBearingPicker({ value, onChange, disabled = false }: Props) {
  const t = useT()
  const svgRef = useRef<SVGSVGElement>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return
    const svg = svgRef.current
    if (!svg) return
    svg.setPointerCapture(e.pointerId)

    const update = (clientX: number, clientY: number) => {
      const rect = svg.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const angle = Math.atan2(clientX - cx, -(clientY - cy)) * (180 / Math.PI)
      let bearing = ((angle % 360) + 360) % 360
      // Snap to nearest 45° multiple
      const snapTo = Math.round(bearing / 45) * 45
      if (Math.abs(bearing - snapTo) < SNAP_DEG) bearing = snapTo
      onChange(Math.round(bearing))
    }

    update(e.clientX, e.clientY)

    const onMove = (ev: PointerEvent) => update(ev.clientX, ev.clientY)
    const onUp = () => {
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
    }
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
  }, [onChange, disabled])

  return (
    <div className={`flex flex-col items-center gap-3 select-none ${disabled ? 'opacity-70' : ''}`}>
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={disabled ? 'touch-none' : 'touch-none cursor-grab active:cursor-grabbing'}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={t.mapSettings.compassBearing}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={359}
        onPointerDown={handlePointerDown}
        onKeyDown={(e) => {
          if (disabled) return
          const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 :
                       e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 :
                       e.key === 'PageUp' ? 15 : e.key === 'PageDown' ? -15 :
                       e.key === 'Home' ? -value : 0
          if (step !== 0) {
            e.preventDefault()
            onChange(((value + step) % 360 + 360) % 360)
          }
        }}
      >
        {/* Outer ring */}
        <circle cx={CENTER} cy={CENTER} r={RING_R + 8} fill="var(--color-surface, #f5f5f5)" stroke="var(--color-border, #e0e0e0)" strokeWidth="1" />
        <circle cx={CENTER} cy={CENTER} r={RING_R} fill="none" stroke="var(--color-border, #e0e0e0)" strokeWidth="0.5" />

        {/* Tick marks every 15° */}
        {Array.from({ length: 24 }, (_, i) => {
          const deg = i * 15
          const rad = (deg - 90) * (Math.PI / 180)
          const isCardinal = deg % 45 === 0
          const inner = isCardinal ? RING_R - 14 : RING_R - 8
          const outer = RING_R
          return (
            <line
              key={i}
              x1={CENTER + inner * Math.cos(rad)}
              y1={CENTER + inner * Math.sin(rad)}
              x2={CENTER + outer * Math.cos(rad)}
              y2={CENTER + outer * Math.sin(rad)}
              stroke={isCardinal ? 'var(--color-text-muted, #666)' : 'var(--color-border, #ccc)'}
              strokeWidth={isCardinal ? 1.5 : 0.8}
            />
          )
        })}

        {/* Cardinal labels */}
        {CARDINALS.map(([deg, label]) => {
          const rad = (deg - 90) * (Math.PI / 180)
          const r = RING_R - 22
          const x = CENTER + r * Math.cos(rad)
          const y = CENTER + r * Math.sin(rad)
          const isN = deg === 0
          return (
            <text
              key={deg}
              x={x} y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isN ? '#ff7701' : 'var(--color-text-muted, #666)'}
              fontSize={isN ? 14 : 10}
              fontWeight={isN ? 700 : 500}
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>
          )
        })}

        {/* Rotating needle group */}
        <g transform={`rotate(${value}, ${CENTER}, ${CENTER})`}>
          {/* North pointer (bright orange) */}
          <polygon
            points={`${CENTER},${CENTER - RING_R + 18} ${CENTER - 6},${CENTER - 4} ${CENTER},${CENTER + 2} ${CENTER + 6},${CENTER - 4}`}
            fill="#ff7701"
          />
          {/* South pointer (faint gray, shorter) */}
          <polygon
            points={`${CENTER},${CENTER + RING_R - 18} ${CENTER - 5},${CENTER + 4} ${CENTER},${CENTER - 2} ${CENTER + 5},${CENTER + 4}`}
            fill="rgba(150,150,150,0.35)"
          />
          {/* Center dot */}
          <circle cx={CENTER} cy={CENTER} r={3.5} fill="var(--color-text, #333)" />
        </g>
      </svg>

      {/* Readout */}
      <p className="text-sm font-semibold text-text tabular-nums">
        {Math.round(value)}&deg; <span className="text-text-muted font-normal">({bearingToCardinal(value)})</span>
      </p>
    </div>
  )
}

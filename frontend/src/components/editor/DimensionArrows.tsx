import type { CornerCut } from '../../types'

interface Props {
  zoneMinX: number
  zoneMinY: number
  zoneMaxX: number
  zoneMaxY: number
  pxPerM: number
  zones: { x: number; y: number; width: number; height: number; cornerCut?: CornerCut; type?: string }[]
  compact?: boolean
}

type CornerCutArrow = {
  hx1: number; hy1: number; hx2: number; hy2: number
  vx1: number; vy1: number; vx2: number; vy2: number
  wPx: number; hPx: number
}

const DIMENSION_COLOR = '#66716c'
const LABEL_FILL = '#fbfaf7'
const LABEL_STROKE = '#d8d6cc'
const ARROW_LENGTH = 5
const MAIN_OFFSET = 26
const CUT_OFFSET = 26

export default function DimensionArrows({ zoneMinX, zoneMinY, zoneMaxX, zoneMaxY, pxPerM, zones, compact }: Props) {
  const zoneW = zoneMaxX - zoneMinX
  const zoneH = zoneMaxY - zoneMinY
  const wM = metres(zoneW, pxPerM)
  const hM = metres(zoneH, pxPerM)

  if (!wM || !hM) return null

  const topY = zoneMinY - MAIN_OFFSET
  const leftX = zoneMinX - MAIN_OFFSET
  const cutArrows = collectCornerCutArrows(zones)

  return (
    <g pointerEvents="none" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
      <g opacity={compact ? 0.7 : 0.82} color={DIMENSION_COLOR}>
        {/* Extension lines connect the measurement back to the measured edges. */}
        <line x1={zoneMinX} y1={zoneMinY} x2={zoneMinX} y2={topY} {...extensionLineProps} />
        <line x1={zoneMaxX} y1={zoneMinY} x2={zoneMaxX} y2={topY} {...extensionLineProps} />
        <line x1={zoneMinX} y1={zoneMinY} x2={leftX} y2={zoneMinY} {...extensionLineProps} />
        <line x1={zoneMinX} y1={zoneMaxY} x2={leftX} y2={zoneMaxY} {...extensionLineProps} />

        <DimensionLine x1={zoneMinX} y1={topY} x2={zoneMaxX} y2={topY} />
        <DimensionLabel x={(zoneMinX + zoneMaxX) / 2} y={topY} label={`${wM} m`} />

        <DimensionLine x1={leftX} y1={zoneMinY} x2={leftX} y2={zoneMaxY} />
        <DimensionLabel x={leftX} y={(zoneMinY + zoneMaxY) / 2} label={`${hM} m`} vertical />

        {cutArrows.map((arrow, index) => (
          <g key={index} opacity={0.78}>
            <DimensionLine x1={arrow.hx1} y1={arrow.hy1} x2={arrow.hx2} y2={arrow.hy2} small />
            <DimensionLabel x={(arrow.hx1 + arrow.hx2) / 2} y={arrow.hy1} label={`${metres(arrow.wPx, pxPerM) ?? '?'} m`} small />
            <DimensionLine x1={arrow.vx1} y1={arrow.vy1} x2={arrow.vx2} y2={arrow.vy2} small />
            <DimensionLabel x={arrow.vx1} y={(arrow.vy1 + arrow.vy2) / 2} label={`${metres(arrow.hPx, pxPerM) ?? '?'} m`} vertical small />
          </g>
        ))}
      </g>

      {compact && zones.length > 0 && (
        <g opacity={0.9}>
          {zones.map((zone, index) => {
            if (zone.type === 'structure') return null
            const width = metres(zone.width, pxPerM)
            const height = metres(zone.height, pxPerM)
            if (!width || !height) return null
            const label = `${width} × ${height} m`
            const labelWidth = label.length * 5.7 + 14
            const x = zone.x + 7
            const y = zone.y + 8
            return (
              <g key={index} transform={`translate(${x}, ${y})`}>
                <rect x={0} y={0} width={labelWidth} height={15} rx={7.5} fill="#27332d" opacity={0.88} />
                <text x={7} y={7.5} fill="white" fontSize={8} fontWeight={600} dominantBaseline="middle">
                  {label}
                </text>
              </g>
            )
          })}
        </g>
      )}
    </g>
  )
}

const extensionLineProps = {
  stroke: 'currentColor',
  strokeWidth: 1,
  strokeDasharray: '2 2',
  vectorEffect: 'non-scaling-stroke' as const,
}

function DimensionLine({ x1, y1, x2, y2, small = false }: {
  x1: number; y1: number; x2: number; y2: number; small?: boolean
}) {
  const horizontal = y1 === y2
  const arrowLength = small ? 3.5 : ARROW_LENGTH
  const span = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1)
  if (span <= arrowLength * 2 + 4) return null

  const min = horizontal ? Math.min(x1, x2) : Math.min(y1, y2)
  const max = horizontal ? Math.max(x1, x2) : Math.max(y1, y2)
  const strokeWidth = small ? 1 : 1.25

  if (horizontal) {
    return (
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
        <path d={`M ${min} ${y1} L ${min + arrowLength} ${y1 - arrowLength} M ${min} ${y1} L ${min + arrowLength} ${y1 + arrowLength}`} />
        <line x1={min + arrowLength} y1={y1} x2={max - arrowLength} y2={y1} />
        <path d={`M ${max} ${y1} L ${max - arrowLength} ${y1 - arrowLength} M ${max} ${y1} L ${max - arrowLength} ${y1 + arrowLength}`} />
      </g>
    )
  }

  return (
    <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
      <path d={`M ${x1} ${min} L ${x1 - arrowLength} ${min + arrowLength} M ${x1} ${min} L ${x1 + arrowLength} ${min + arrowLength}`} />
      <line x1={x1} y1={min + arrowLength} x2={x1} y2={max - arrowLength} />
      <path d={`M ${x1} ${max} L ${x1 - arrowLength} ${max - arrowLength} M ${x1} ${max} L ${x1 + arrowLength} ${max - arrowLength}`} />
    </g>
  )
}

function DimensionLabel({ x, y, label, vertical = false, small = false }: {
  x: number; y: number; label: string; vertical?: boolean; small?: boolean
}) {
  const fontSize = small ? 7.5 : 10.5
  const paddingX = small ? 5 : 8
  const height = small ? 13 : 18
  const width = label.length * fontSize * 0.61 + paddingX * 2
  const transform = vertical ? `translate(${x}, ${y}) rotate(-90)` : `translate(${x}, ${y})`

  return (
    <g transform={transform}>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={height / 2} fill={LABEL_FILL} stroke={LABEL_STROKE} strokeWidth={0.7} />
      <text x={0} y={0.5} textAnchor="middle" dominantBaseline="middle" fill="#445047" fontSize={fontSize} fontWeight={650} letterSpacing={small ? 0 : 0.15}>
        {label}
      </text>
    </g>
  )
}

function metres(value: number, pxPerM: number): string | null {
  return pxPerM > 0 && value > 0 ? (value / pxPerM).toFixed(1) : null
}

function collectCornerCutArrows(zones: Props['zones']): CornerCutArrow[] {
  const arrows: CornerCutArrow[] = []
  for (const zone of zones) {
    if (!zone.cornerCut || zone.type === 'room' || zone.type === 'structure') continue
    const { corner, widthPx, heightPx } = zone.cornerCut
    const arrow = (() => {
      switch (corner) {
        case 'tl': return { hx1: zone.x, hy1: zone.y - CUT_OFFSET, hx2: zone.x + widthPx, hy2: zone.y - CUT_OFFSET, vx1: zone.x - CUT_OFFSET, vy1: zone.y, vx2: zone.x - CUT_OFFSET, vy2: zone.y + heightPx, wPx: widthPx, hPx: heightPx }
        case 'tr': return { hx1: zone.x + zone.width - widthPx, hy1: zone.y - CUT_OFFSET, hx2: zone.x + zone.width, hy2: zone.y - CUT_OFFSET, vx1: zone.x + zone.width + CUT_OFFSET, vy1: zone.y, vx2: zone.x + zone.width + CUT_OFFSET, vy2: zone.y + heightPx, wPx: widthPx, hPx: heightPx }
        case 'bl': return { hx1: zone.x, hy1: zone.y + zone.height + CUT_OFFSET, hx2: zone.x + widthPx, hy2: zone.y + zone.height + CUT_OFFSET, vx1: zone.x - CUT_OFFSET, vy1: zone.y + zone.height - heightPx, vx2: zone.x - CUT_OFFSET, vy2: zone.y + zone.height, wPx: widthPx, hPx: heightPx }
        case 'br': return { hx1: zone.x + zone.width - widthPx, hy1: zone.y + zone.height + CUT_OFFSET, hx2: zone.x + zone.width, hy2: zone.y + zone.height + CUT_OFFSET, vx1: zone.x + zone.width + CUT_OFFSET, vy1: zone.y + zone.height - heightPx, vx2: zone.x + zone.width + CUT_OFFSET, vy2: zone.y + zone.height, wPx: widthPx, hPx: heightPx }
      }
    })()
    if (arrow) arrows.push(arrow)
  }
  return arrows
}

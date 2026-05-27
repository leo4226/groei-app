import type { CornerCut, CornerPosition } from '../../types'

interface Props {
  zoneMinX: number
  zoneMinY: number
  zoneMaxX: number
  zoneMaxY: number
  pxPerM: number
  zones: { x: number; y: number; width: number; height: number; cornerCut?: CornerCut }[]
}

type CornerCutArrow = {
  hx1: number; hy1: number; hx2: number; hy2: number   // horizontal arrow
  vx1: number; vy1: number; vx2: number; vy2: number   // vertical arrow
  wPx: number; hPx: number
}

export default function DimensionArrows({ zoneMinX, zoneMinY, zoneMaxX, zoneMaxY, pxPerM, zones }: Props) {
  const zoneW = zoneMaxX - zoneMinX
  const zoneH = zoneMaxY - zoneMinY
  const wM = pxPerM > 0 && zoneW > 0 ? (zoneW / pxPerM).toFixed(1) : null
  const hM = pxPerM > 0 && zoneH > 0 ? (zoneH / pxPerM).toFixed(1) : null

  if (!wM || !hM) return null

  // ── Corner cut arrows ──────────────────────────────────────────────────
  const cutArrows: CornerCutArrow[] = []
  for (const z of zones) {
    if (!z.cornerCut) continue
    const { corner, widthPx: cw, heightPx: ch } = z.cornerCut

    const arrow = (() => {
      switch (corner) {
        case 'tl':
          return {
            hx1: z.x,        hy1: z.y - CUT_OFFSET,
            hx2: z.x + cw,   hy2: z.y - CUT_OFFSET,
            vx1: z.x - CUT_OFFSET, vy1: z.y,
            vx2: z.x - CUT_OFFSET, vy2: z.y + ch,
            wPx: cw, hPx: ch,
          }
        case 'tr':
          return {
            hx1: z.x + z.width - cw, hy1: z.y - CUT_OFFSET,
            hx2: z.x + z.width,       hy2: z.y - CUT_OFFSET,
            vx1: z.x + z.width + CUT_OFFSET, vy1: z.y,
            vx2: z.x + z.width + CUT_OFFSET, vy2: z.y + ch,
            wPx: cw, hPx: ch,
          }
        case 'bl':
          return {
            hx1: z.x,        hy1: z.y + z.height + CUT_OFFSET,
            hx2: z.x + cw,   hy2: z.y + z.height + CUT_OFFSET,
            vx1: z.x - CUT_OFFSET, vy1: z.y + z.height - ch,
            vx2: z.x - CUT_OFFSET, vy2: z.y + z.height,
            wPx: cw, hPx: ch,
          }
        case 'br':
          return {
            hx1: z.x + z.width - cw, hy1: z.y + z.height + CUT_OFFSET,
            hx2: z.x + z.width,       hy2: z.y + z.height + CUT_OFFSET,
            vx1: z.x + z.width + CUT_OFFSET, vy1: z.y + z.height - ch,
            vx2: z.x + z.width + CUT_OFFSET, vy2: z.y + z.height,
            wPx: cw, hPx: ch,
          }
      }
    })()

    if (arrow) cutArrows.push(arrow)
  }

  const ARROW_L = 6
  const ARROW_INSET = 6
  const TEXT_GAP = 10
  // Corner cut arrows sit OUTSIDE the main dimension arrows to avoid visual overlap
  const CUT_OFFSET = 26

  function arrowHead(path: string) {
    return <path d={path} stroke="currentColor" strokeWidth={1} fill="none" />
  }

  return (
    <g pointerEvents="none" opacity={0.45} style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* ══════ Main dimension lines ══════ */}

      {/* Top: zone width */}
      {renderArrowLine(
        zoneMinX, zoneMinY - 14, zoneMaxX, zoneMinY - 14,
        ARROW_L, ARROW_INSET, arrowHead,
      )}
      <text x={(zoneMinX + zoneMaxX) / 2} y={zoneMinY - 14 - TEXT_GAP}
        textAnchor="middle" dominantBaseline="auto"
        fill="currentColor" fontSize={10} fontWeight={500}>
        {wM} m
      </text>

      {/* Left: zone height */}
      {renderArrowLine(
        zoneMinX - 14, zoneMinY, zoneMinX - 14, zoneMaxY,
        ARROW_L, ARROW_INSET, arrowHead,
      )}
      <text x={zoneMinX - 14 - TEXT_GAP} y={(zoneMinY + zoneMaxY) / 2}
        textAnchor="end" dominantBaseline="central"
        fill="currentColor" fontSize={10} fontWeight={500}
        transform={`rotate(-90, ${zoneMinX - 14 - TEXT_GAP}, ${(zoneMinY + zoneMaxY) / 2})`}>
        {hM} m
      </text>

      {/* ══════ Corner cut arrows ══════ */}
      {cutArrows.map((a, i) => (
        <g key={i} opacity={0.6}>
          {/* Horizontal (width of cut) */}
          {renderArrowLine(a.hx1, a.hy1, a.hx2, a.hy2, 4, 4, arrowHead)}
          <text x={(a.hx1 + a.hx2) / 2} y={a.hy1 - 5}
            textAnchor="middle" dominantBaseline="auto"
            fill="currentColor" fontSize={8} fontWeight={500}>
            {pxPerM > 0 ? (a.wPx / pxPerM).toFixed(1) : '?'} m
          </text>

          {/* Vertical (height of cut) */}
          {renderArrowLine(a.vx1, a.vy1, a.vx2, a.vy2, 4, 4, arrowHead)}
          <text x={a.vx1 - 5} y={(a.vy1 + a.vy2) / 2}
            textAnchor="end" dominantBaseline="central"
            fill="currentColor" fontSize={8} fontWeight={500}
            transform={`rotate(-90, ${a.vx1 - 5}, ${(a.vy1 + a.vy2) / 2})`}>
            {pxPerM > 0 ? (a.hPx / pxPerM).toFixed(1) : '?'} m
          </text>
        </g>
      ))}
    </g>
  )
}

// ── Shared arrow-line renderer ─────────────────────────────────────────

function renderArrowLine(
  x1: number, y1: number,
  x2: number, y2: number,
  arrowL: number, arrowInset: number,
  arrowHead: (d: string) => JSX.Element,
) {
  const horizontal = y1 === y2
  const min = horizontal ? Math.min(x1, x2) : Math.min(y1, y2)
  const max = horizontal ? Math.max(x1, x2) : Math.max(y1, y2)
  const span = max - min

  if (span <= arrowInset * 2 + arrowL * 2) return null

  // Arrow heads
  if (horizontal) {
    const lx = Math.min(x1, x2)
    const rx = Math.max(x1, x2)
    const y = y1
    return (
      <>
        {arrowHead(`M ${lx + arrowInset} ${y} l ${arrowL} ${-arrowL} M ${lx + arrowInset} ${y} l ${arrowL} ${arrowL}`)}
        {arrowHead(`M ${rx - arrowInset} ${y} l ${-arrowL} ${-arrowL} M ${rx - arrowInset} ${y} l ${-arrowL} ${arrowL}`)}
        <line x1={lx + arrowInset + arrowL} y1={y} x2={rx - arrowInset - arrowL} y2={y}
          stroke="currentColor" strokeWidth={1} />
        <line x1={lx + arrowInset + arrowL} y1={y - 2} x2={lx + arrowInset + arrowL} y2={y + 2}
          stroke="currentColor" strokeWidth={1} />
        <line x1={rx - arrowInset - arrowL} y1={y - 2} x2={rx - arrowInset - arrowL} y2={y + 2}
          stroke="currentColor" strokeWidth={1} />
      </>
    )
  } else {
    const ty = Math.min(y1, y2)
    const by = Math.max(y1, y2)
    const x = x1
    return (
      <>
        {arrowHead(`M ${x} ${ty + arrowInset} l ${-arrowL} ${arrowL} M ${x} ${ty + arrowInset} l ${arrowL} ${arrowL}`)}
        {arrowHead(`M ${x} ${by - arrowInset} l ${-arrowL} ${-arrowL} M ${x} ${by - arrowInset} l ${arrowL} ${-arrowL}`)}
        <line x1={x} y1={ty + arrowInset + arrowL} x2={x} y2={by - arrowInset - arrowL}
          stroke="currentColor" strokeWidth={1} />
        <line x1={x - 2} y1={ty + arrowInset + arrowL} x2={x + 2} y2={ty + arrowInset + arrowL}
          stroke="currentColor" strokeWidth={1} />
        <line x1={x - 2} y1={by - arrowInset - arrowL} x2={x + 2} y2={by - arrowInset - arrowL}
          stroke="currentColor" strokeWidth={1} />
      </>
    )
  }
}

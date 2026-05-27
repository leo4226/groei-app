interface Props {
  canvasW: number
  canvasH: number
  pxPerM: number
}

export default function DimensionArrows({ canvasW, canvasH, pxPerM }: Props) {
  const wM = pxPerM > 0 ? (canvasW / pxPerM).toFixed(1) : '?'
  const hM = pxPerM > 0 ? (canvasH / pxPerM).toFixed(1) : '?'
  const MARGIN = 14
  const ARROW_L = 6
  const ARROW_INSET = 6

  return (
    <g pointerEvents="none" opacity={0.45} style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Top dimension line (horizontal, width) */}
      {/* left arrow head */}
      <path d={`M ${ARROW_INSET} ${-MARGIN} l ${ARROW_L} ${-ARROW_L} M ${ARROW_INSET} ${-MARGIN} l ${ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      {/* right arrow head */}
      <path d={`M ${canvasW - ARROW_INSET} ${-MARGIN} l ${-ARROW_L} ${-ARROW_L} M ${canvasW - ARROW_INSET} ${-MARGIN} l ${-ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      {/* main line */}
      <line x1={ARROW_INSET + ARROW_L} y1={-MARGIN} x2={canvasW - ARROW_INSET - ARROW_L} y2={-MARGIN}
        stroke="currentColor" strokeWidth={1} />
      {/* tick marks */}
      <line x1={ARROW_INSET + ARROW_L} y1={-MARGIN - 3} x2={ARROW_INSET + ARROW_L} y2={-MARGIN + 3}
        stroke="currentColor" strokeWidth={1} />
      <line x1={canvasW - ARROW_INSET - ARROW_L} y1={-MARGIN - 3} x2={canvasW - ARROW_INSET - ARROW_L} y2={-MARGIN + 3}
        stroke="currentColor" strokeWidth={1} />
      {/* label */}
      <text x={canvasW / 2} y={-MARGIN - 3} textAnchor="middle" dominantBaseline="baseline"
        fill="currentColor" fontSize={10} fontWeight={500}>
        {wM} m
      </text>

      {/* Left dimension line (vertical, height) */}
      {/* top arrow head */}
      <path d={`M ${-MARGIN} ${ARROW_INSET} l ${-ARROW_L} ${ARROW_L} M ${-MARGIN} ${ARROW_INSET} l ${ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      {/* bottom arrow head */}
      <path d={`M ${-MARGIN} ${canvasH - ARROW_INSET} l ${-ARROW_L} ${-ARROW_L} M ${-MARGIN} ${canvasH - ARROW_INSET} l ${ARROW_L} ${-ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none" />
      {/* main line */}
      <line x1={-MARGIN} y1={ARROW_INSET + ARROW_L} x2={-MARGIN} y2={canvasH - ARROW_INSET - ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      {/* tick marks */}
      <line x1={-MARGIN - 3} y1={ARROW_INSET + ARROW_L} x2={-MARGIN + 3} y2={ARROW_INSET + ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      <line x1={-MARGIN - 3} y1={canvasH - ARROW_INSET - ARROW_L} x2={-MARGIN + 3} y2={canvasH - ARROW_INSET - ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      {/* label */}
      <text x={-MARGIN - 3} y={canvasH / 2} textAnchor="middle" dominantBaseline="central"
        fill="currentColor" fontSize={10} fontWeight={500}
        transform={`rotate(-90, ${-MARGIN - 3}, ${canvasH / 2})`}>
        {hM} m
      </text>
    </g>
  )
}

interface Props {
  zoneMinX: number
  zoneMinY: number
  zoneMaxX: number
  zoneMaxY: number
  pxPerM: number
}

export default function DimensionArrows({ zoneMinX, zoneMinY, zoneMaxX, zoneMaxY, pxPerM }: Props) {
  const zoneW = zoneMaxX - zoneMinX
  const zoneH = zoneMaxY - zoneMinY
  const wM = pxPerM > 0 && zoneW > 0 ? (zoneW / pxPerM).toFixed(1) : null
  const hM = pxPerM > 0 && zoneH > 0 ? (zoneH / pxPerM).toFixed(1) : null

  if (!wM || !hM) return null

  const MARGIN = 14
  const ARROW_L = 6
  const ARROW_INSET = 6

  const topY = zoneMinY - MARGIN
  const leftX = zoneMinX - MARGIN

  return (
    <g pointerEvents="none" opacity={0.45} style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* ── Top dimension line (zone width) ── */}
      {/* left arrow head */}
      <path
        d={`M ${zoneMinX + ARROW_INSET} ${topY} l ${ARROW_L} ${-ARROW_L} M ${zoneMinX + ARROW_INSET} ${topY} l ${ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none"
      />
      {/* right arrow head */}
      <path
        d={`M ${zoneMaxX - ARROW_INSET} ${topY} l ${-ARROW_L} ${-ARROW_L} M ${zoneMaxX - ARROW_INSET} ${topY} l ${-ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none"
      />
      {/* main line */}
      <line
        x1={zoneMinX + ARROW_INSET + ARROW_L} y1={topY}
        x2={zoneMaxX - ARROW_INSET - ARROW_L} y2={topY}
        stroke="currentColor" strokeWidth={1}
      />
      {/* tick marks */}
      <line x1={zoneMinX + ARROW_INSET + ARROW_L} y1={topY - 3} x2={zoneMinX + ARROW_INSET + ARROW_L} y2={topY + 3}
        stroke="currentColor" strokeWidth={1} />
      <line x1={zoneMaxX - ARROW_INSET - ARROW_L} y1={topY - 3} x2={zoneMaxX - ARROW_INSET - ARROW_L} y2={topY + 3}
        stroke="currentColor" strokeWidth={1} />
      {/* label */}
      <text x={(zoneMinX + zoneMaxX) / 2} y={topY - 3}
        textAnchor="middle" dominantBaseline="auto"
        fill="currentColor" fontSize={10} fontWeight={500}>
        {wM} m
      </text>

      {/* ── Left dimension line (zone height) ── */}
      {/* top arrow head */}
      <path
        d={`M ${leftX} ${zoneMinY + ARROW_INSET} l ${-ARROW_L} ${ARROW_L} M ${leftX} ${zoneMinY + ARROW_INSET} l ${ARROW_L} ${ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none"
      />
      {/* bottom arrow head */}
      <path
        d={`M ${leftX} ${zoneMaxY - ARROW_INSET} l ${-ARROW_L} ${-ARROW_L} M ${leftX} ${zoneMaxY - ARROW_INSET} l ${ARROW_L} ${-ARROW_L}`}
        stroke="currentColor" strokeWidth={1} fill="none"
      />
      {/* main line */}
      <line
        x1={leftX} y1={zoneMinY + ARROW_INSET + ARROW_L}
        x2={leftX} y2={zoneMaxY - ARROW_INSET - ARROW_L}
        stroke="currentColor" strokeWidth={1}
      />
      {/* tick marks */}
      <line x1={leftX - 3} y1={zoneMinY + ARROW_INSET + ARROW_L} x2={leftX + 3} y2={zoneMinY + ARROW_INSET + ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      <line x1={leftX - 3} y1={zoneMaxY - ARROW_INSET - ARROW_L} x2={leftX + 3} y2={zoneMaxY - ARROW_INSET - ARROW_L}
        stroke="currentColor" strokeWidth={1} />
      {/* label */}
      <text x={leftX - 3} y={(zoneMinY + zoneMaxY) / 2}
        textAnchor="middle" dominantBaseline="central"
        fill="currentColor" fontSize={10} fontWeight={500}
        transform={`rotate(-90, ${leftX - 3}, ${(zoneMinY + zoneMaxY) / 2})`}>
        {hM} m
      </text>
    </g>
  )
}

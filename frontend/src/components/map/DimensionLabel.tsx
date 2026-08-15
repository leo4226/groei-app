interface Props {
  x: number
  y: number
  value: number
  axis: 'horizontal' | 'vertical'
  fading?: boolean
}

export default function DimensionLabel({ x, y, value, axis, fading }: Props) {
  const text = `${Math.round(value)} cm`
  const textLen = text.length * 4.5 + 8
  const pillH = 12
  const rotate = axis === 'vertical' ? -180 : -90

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${rotate})`}
      style={{
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.8s ease-out',
        pointerEvents: 'none',
      }}
    >
      <rect
        x={-textLen / 2} y={-pillH / 2}
        width={textLen} height={pillH}
        rx={6}
        fill="rgba(0,0,0,0.65)"
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={8}
        fontWeight={500}
      >
        {text}
      </text>
    </g>
  )
}

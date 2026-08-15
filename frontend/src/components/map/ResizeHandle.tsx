interface Props {
  x: number
  y: number
  direction: string
  active?: boolean
  onPointerDown: (e: React.PointerEvent) => void
}

const CURSOR_MAP: Record<string, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
}

export default function ResizeHandle({ x, y, direction, active, onPointerDown }: Props) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onPointerDown={onPointerDown}
      style={{ cursor: CURSOR_MAP[direction] || 'grab', touchAction: 'none' }}
    >
      {/* Invisible hit area for mobile touch targets */}
      <circle r={12} fill="transparent" />
      {/* Visible handle */}
      <circle
        r={5}
        fill={active ? '#5B9A6F' : 'white'}
        stroke={active ? '#5B9A6F' : '#888'}
        strokeWidth={1.2}
      />
    </g>
  )
}

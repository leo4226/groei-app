import ResizeHandle from './ResizeHandle'
import DimensionLabel from './DimensionLabel'

const PX_PER_CM = 0.46

interface Props {
  x: number
  y: number
  radiusCm: number
  isResizing: boolean
  activeHandle: string | null
  onHandlePointerDown: (e: React.PointerEvent, handle: string) => void
}

export default function PlantResizeOverlay({
  x, y, radiusCm, isResizing, activeHandle, onHandlePointerDown,
}: Props) {
  const r = radiusCm * PX_PER_CM

  const handles = [
    { dir: 'n', hx: 0, hy: -r },
    { dir: 's', hx: 0, hy: r },
    { dir: 'e', hx: r, hy: 0 },
    { dir: 'w', hx: -r, hy: 0 },
  ]

  return (
    <g transform={`translate(${x}, ${y})`}>
      {handles.map((h) => (
        <ResizeHandle
          key={h.dir}
          x={h.hx}
          y={h.hy}
          direction={h.dir}
          active={activeHandle === h.dir}
          onPointerDown={(e) => onHandlePointerDown(e, h.dir)}
        />
      ))}

      {isResizing && (
        <DimensionLabel
          x={r + 14}
          y={0}
          value={Math.round(radiusCm * 2)}
          axis="horizontal"
        />
      )}
    </g>
  )
}

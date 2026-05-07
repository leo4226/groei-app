import type { MapObject } from '../../types'
import type { ResizeDimensions } from '../../hooks/useResize'
import ResizeHandle from './ResizeHandle'
import DimensionLabel from './DimensionLabel'

const PX_PER_CM = 0.46

interface HandlePos {
  dir: string
  x: number
  y: number
}

interface Props {
  object: MapObject
  x: number
  y: number
  currentDimensions: ResizeDimensions
  isResizing: boolean
  activeHandle: string | null
  onHandlePointerDown: (e: React.PointerEvent, handle: string) => void
  showRotate?: boolean
  isRotating?: boolean
  liveRotation?: number
  onRotatePointerDown?: (e: React.PointerEvent) => void
}

export default function SelectionOverlay({
  object, x, y, currentDimensions, isResizing, activeHandle, onHandlePointerDown,
  showRotate, isRotating, liveRotation, onRotatePointerDown,
}: Props) {
  const dims = currentDimensions
  const handles = getHandlePositions(object.shape, dims)
  const color = object.color || '#888888'
  const effectiveRotation = liveRotation ?? (object.rotation || 0)

  return (
    <g transform={`translate(${x}, ${y}) rotate(${effectiveRotation})`}>
      {/* Dashed selection border */}
      {renderSelectionBorder(object.shape, dims, color)}

      {/* Resize handles */}
      {handles.map((h) => (
        <ResizeHandle
          key={h.dir}
          x={h.x}
          y={h.y}
          direction={h.dir}
          active={activeHandle === h.dir}
          onPointerDown={(e) => onHandlePointerDown(e, h.dir)}
        />
      ))}

      {/* Dimension labels during resize */}
      {isResizing && renderDimensionLabels(object.shape, dims)}

      {/* Rotation handle — hardscape/utility only */}
      {showRotate && onRotatePointerDown && (() => {
        const { hx, hy } = getRotateHandlePos(object.shape, dims)
        return (
          <g
            transform={`translate(${hx}, ${hy})`}
            onPointerDown={(e) => { e.stopPropagation(); onRotatePointerDown(e) }}
            style={{ cursor: 'grab', touchAction: 'none' }}
          >
            {/* Hit area */}
            <circle r={14} fill="transparent" />
            {/* Handle circle */}
            <circle
              r={7}
              fill={isRotating ? '#2563eb' : '#4A90D9'}
              stroke="white"
              strokeWidth={1.5}
            />
            {/* Rotation arrow icon */}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="8"
              fill="white"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              ↻
            </text>
          </g>
        )
      })()}

      {/* Rotation angle label during rotate */}
      {isRotating && liveRotation !== undefined && (() => {
        const { hx, hy } = getRotateHandlePos(object.shape, dims)
        return (
          <g transform={`translate(${hx + 16}, ${hy})`}>
            <rect x={-1} y={-8} width={34} height={16} rx={4} fill="rgba(0,0,0,0.6)" />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              x={16}
              fontSize="9"
              fill="white"
              fontWeight="600"
              style={{ pointerEvents: 'none' }}
            >
              {Math.round(liveRotation)}°
            </text>
          </g>
        )
      })()}
    </g>
  )
}

function getRotateHandlePos(shape: string, dims: ResizeDimensions): { hx: number; hy: number } {
  if (shape === 'circle') {
    const r = ((dims.diameter_cm || 30) * PX_PER_CM) / 2
    return { hx: r * 0.707 + 14, hy: -(r * 0.707 + 14) }
  }
  const hw = ((dims.width_cm || 30) * PX_PER_CM) / 2
  const hd = ((shape === 'square' ? (dims.width_cm || 30) : (dims.depth_cm || 40)) * PX_PER_CM) / 2
  return { hx: hw + 14, hy: -hd - 14 }
}

function renderSelectionBorder(shape: string, dims: ResizeDimensions, color: string) {
  const pad = 3 // padding around shape
  const dashProps = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1,
    strokeDasharray: '4 2',
    style: { pointerEvents: 'none' as const },
  }

  if (shape === 'circle') {
    const r = ((dims.diameter_cm || 30) * PX_PER_CM) / 2 + pad
    return <circle r={r} {...dashProps} />
  }

  const w = (dims.width_cm || 30) * PX_PER_CM + pad * 2
  const h = (shape === 'square' ? (dims.width_cm || 30) : (dims.depth_cm || 40)) * PX_PER_CM + pad * 2
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} {...dashProps} />
}

function getHandlePositions(shape: string, dims: ResizeDimensions): HandlePos[] {
  if (shape === 'circle') {
    const r = ((dims.diameter_cm || 30) * PX_PER_CM) / 2
    return [
      { dir: 'n', x: 0, y: -r },
      { dir: 's', x: 0, y: r },
      { dir: 'e', x: r, y: 0 },
      { dir: 'w', x: -r, y: 0 },
    ]
  }

  const hw = ((dims.width_cm || 30) * PX_PER_CM) / 2
  const hd = ((shape === 'square' ? (dims.width_cm || 30) : (dims.depth_cm || 40)) * PX_PER_CM) / 2

  const corners: HandlePos[] = [
    { dir: 'nw', x: -hw, y: -hd },
    { dir: 'ne', x: hw, y: -hd },
    { dir: 'sw', x: -hw, y: hd },
    { dir: 'se', x: hw, y: hd },
  ]

  if (shape === 'rectangle') {
    return [
      ...corners,
      { dir: 'n', x: 0, y: -hd },
      { dir: 's', x: 0, y: hd },
      { dir: 'e', x: hw, y: 0 },
      { dir: 'w', x: -hw, y: 0 },
    ]
  }

  return corners // square: corners only
}

function renderDimensionLabels(shape: string, dims: ResizeDimensions) {
  if (shape === 'circle') {
    const r = ((dims.diameter_cm || 30) * PX_PER_CM) / 2
    return (
      <DimensionLabel
        x={r + 14}
        y={0}
        value={dims.diameter_cm || 30}
        axis="horizontal"
      />
    )
  }

  const hw = ((dims.width_cm || 30) * PX_PER_CM) / 2
  const hd = ((shape === 'square' ? (dims.width_cm || 30) : (dims.depth_cm || 40)) * PX_PER_CM) / 2

  return (
    <>
      {/* Width label on top edge */}
      <DimensionLabel
        x={0}
        y={-hd - 10}
        value={dims.width_cm || 30}
        axis="horizontal"
      />
      {/* Depth label on right edge (only for rectangle) */}
      {shape === 'rectangle' && (
        <DimensionLabel
          x={hw + 14}
          y={0}
          value={dims.depth_cm || 40}
          axis="vertical"
        />
      )}
    </>
  )
}

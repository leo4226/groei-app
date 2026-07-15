export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface ResizeBBox { x: number; y: number; width: number; height: number }

interface Props {
  /** Axis-aligned bounding box of the selected element (zone, shadow caster…). */
  bbox: ResizeBBox
  /** Screen pixels per inner content unit (viewBox scale × zoom). Keeps the handles a
   *  constant on-screen size — big enough for a finger — at any zoom or screen size. */
  pxPerUnit: number
  onHandlePointerDown: (e: React.PointerEvent, handle: ResizeHandle) => void
}

const VISUAL_PX = 7   // visible dot radius (~14px dot)
const HIT_PX = 22     // invisible touch-target radius (~44px target)
const PAD = 2

export default function EditorResizeOverlay({ bbox, pxPerUnit, onHandlePointerDown }: Props) {
  const { x, y, width: w, height: h } = bbox
  const cx = x + w / 2
  const cy = y + h / 2
  const scale = pxPerUnit > 0 ? pxPerUnit : 1
  const rVis = VISUAL_PX / scale
  const rHit = HIT_PX / scale

  const handles: { id: ResizeHandle; hx: number; hy: number }[] = [
    { id: 'nw', hx: x - PAD,     hy: y - PAD },
    { id: 'n',  hx: cx,          hy: y - PAD },
    { id: 'ne', hx: x + w + PAD, hy: y - PAD },
    { id: 'e',  hx: x + w + PAD, hy: cy },
    { id: 'se', hx: x + w + PAD, hy: y + h + PAD },
    { id: 's',  hx: cx,          hy: y + h + PAD },
    { id: 'sw', hx: x - PAD,     hy: y + h + PAD },
    { id: 'w',  hx: x - PAD,     hy: cy },
  ]

  const cursorMap: Record<ResizeHandle, string> = {
    nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
    e:  'ew-resize',   se: 'nwse-resize', s: 'ns-resize',
    sw: 'nesw-resize', w: 'ew-resize',
  }

  return (
    <g pointerEvents="all">
      {handles.map(({ id, hx, hy }) => (
        <g
          key={id}
          style={{ cursor: cursorMap[id] }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onHandlePointerDown(e, id)
          }}
        >
          {/* Invisible finger-sized hit target */}
          <circle cx={hx} cy={hy} r={rHit} fill="transparent" />
          {/* Visible dot */}
          <circle cx={hx} cy={hy} r={rVis} fill="white" stroke="#4A90D9" strokeWidth={1.5 / scale} pointerEvents="none" />
        </g>
      ))}
    </g>
  )
}

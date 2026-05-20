import type { EditorZone } from '../../types'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface Props {
  zone: EditorZone
  onHandlePointerDown: (e: React.PointerEvent, handle: ResizeHandle) => void
}

const HANDLE_R = 5
const PAD = 2

export default function EditorResizeOverlay({ zone, onHandlePointerDown }: Props) {
  const { x, y, width: w, height: h } = zone
  const cx = x + w / 2
  const cy = y + h / 2
  const r = HANDLE_R

  const handles: { id: ResizeHandle; hx: number; hy: number }[] = [
    { id: 'nw', hx: x - PAD,       hy: y - PAD },
    { id: 'n',  hx: cx,             hy: y - PAD },
    { id: 'ne', hx: x + w + PAD,   hy: y - PAD },
    { id: 'e',  hx: x + w + PAD,   hy: cy },
    { id: 'se', hx: x + w + PAD,   hy: y + h + PAD },
    { id: 's',  hx: cx,             hy: y + h + PAD },
    { id: 'sw', hx: x - PAD,       hy: y + h + PAD },
    { id: 'w',  hx: x - PAD,       hy: cy },
  ]

  const cursorMap: Record<ResizeHandle, string> = {
    nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
    e:  'ew-resize',   se: 'nwse-resize', s: 'ns-resize',
    sw: 'nesw-resize', w: 'ew-resize',
  }

  return (
    <g pointerEvents="all">
      {handles.map(({ id, hx, hy }) => (
        <circle
          key={id}
          cx={hx}
          cy={hy}
          r={r}
          fill="white"
          stroke="#4A90D9"
          strokeWidth={1.5}
          style={{ cursor: cursorMap[id] }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onHandlePointerDown(e, id)
          }}
        />
      ))}
    </g>
  )
}

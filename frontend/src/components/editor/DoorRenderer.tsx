import type { EditorZone, WallElement } from '../../types'
import { WALL_COLOR } from '../../constants/mapDefaults'

interface Props {
  element: WallElement
  zone: EditorZone
  wallThicknessPx: number
  scalePxPerM: number
}

export default function DoorRenderer({
  element,
  zone,
  wallThicknessPx,
  scalePxPerM,
}: Props) {
  const widthPx = (element.widthCm * scalePxPerM) / 100
  const { edge, position } = element
  const { x, y, width: w, height: h } = zone
  const t = wallThicknessPx

  const isHorizontal = edge === 'top' || edge === 'bottom'
  const edgeLength = isHorizontal ? w : h
  const center = position * edgeLength
  const gapStart = center - widthPx / 2

  // 3 stripes clustered in the inner ~60% of the wall thickness
  // (shorter than window stripes → visually distinct)
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  const innerT = t * 0.6  // spread over 60% of wall thickness, centred
  const offset = (t - innerT) / 2

  if (isHorizontal) {
    const baseY = edge === 'top' ? y : y + h - t
    const lx1 = x + gapStart
    const lx2 = x + gapStart + widthPx
    for (let i = 0; i < 3; i++) {
      const ly = baseY + offset + (innerT * (i + 0.5)) / 3
      lines.push({ x1: lx1, y1: ly, x2: lx2, y2: ly })
    }
  } else {
    const baseX = edge === 'left' ? x : x + w - t
    const ly1 = y + t + gapStart
    const ly2 = y + t + gapStart + widthPx
    for (let i = 0; i < 3; i++) {
      const lx = baseX + offset + (innerT * (i + 0.5)) / 3
      lines.push({ x1: lx, y1: ly1, x2: lx, y2: ly2 })
    }
  }

  return (
    <g pointerEvents="none">
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={WALL_COLOR}
          strokeWidth={0.6}
        />
      ))}
    </g>
  )
}

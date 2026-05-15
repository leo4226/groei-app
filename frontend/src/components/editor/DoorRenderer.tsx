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
  const { edge, position, swingSide = 'left', swingDirection = 'inward' } = element
  const { x, y, width: w, height: h } = zone
  const t = wallThicknessPx

  const isHorizontal = edge === 'top' || edge === 'bottom'
  const edgeLength = isHorizontal ? w : h

  const center = position * edgeLength
  const gapStart = center - widthPx / 2
  const radius = widthPx

  let pivotX: number, pivotY: number
  let arcEndX: number, arcEndY: number
  let sweepFlag: 0 | 1

  if (edge === 'top') {
    const wallY = y
    const insideY = y + t
    const outsideY = y - radius + t
    pivotX = swingSide === 'left' ? x + gapStart : x + gapStart + widthPx
    pivotY = wallY + t / 2
    if (swingDirection === 'inward') {
      arcEndX = swingSide === 'left' ? pivotX + widthPx : pivotX - widthPx
      arcEndY = insideY + radius
      sweepFlag = swingSide === 'left' ? 1 : 0
    } else {
      arcEndX = swingSide === 'left' ? pivotX + widthPx : pivotX - widthPx
      arcEndY = outsideY
      sweepFlag = swingSide === 'left' ? 0 : 1
    }
  } else if (edge === 'bottom') {
    const wallY = y + h
    const insideY = y + h - t - radius
    const outsideY = y + h - t + radius
    pivotX = swingSide === 'left' ? x + gapStart : x + gapStart + widthPx
    pivotY = wallY - t / 2
    if (swingDirection === 'inward') {
      arcEndX = swingSide === 'left' ? pivotX + widthPx : pivotX - widthPx
      arcEndY = insideY
      sweepFlag = swingSide === 'left' ? 0 : 1
    } else {
      arcEndX = swingSide === 'left' ? pivotX + widthPx : pivotX - widthPx
      arcEndY = outsideY
      sweepFlag = swingSide === 'left' ? 1 : 0
    }
  } else if (edge === 'left') {
    const wallX = x
    const insideX = x + t + radius
    const outsideX = x - radius + t
    pivotX = wallX + t / 2
    pivotY = swingSide === 'left' ? y + t + gapStart : y + t + gapStart + widthPx
    if (swingDirection === 'inward') {
      arcEndX = insideX
      arcEndY = swingSide === 'left' ? pivotY + widthPx : pivotY - widthPx
      sweepFlag = swingSide === 'left' ? 0 : 1
    } else {
      arcEndX = outsideX
      arcEndY = swingSide === 'left' ? pivotY + widthPx : pivotY - widthPx
      sweepFlag = swingSide === 'left' ? 1 : 0
    }
  } else {
    const wallX = x + w
    const insideX = x + w - t - radius
    const outsideX = x + w - t + radius
    pivotX = wallX - t / 2
    pivotY = swingSide === 'left' ? y + t + gapStart : y + t + gapStart + widthPx
    if (swingDirection === 'inward') {
      arcEndX = insideX
      arcEndY = swingSide === 'left' ? pivotY + widthPx : pivotY - widthPx
      sweepFlag = swingSide === 'left' ? 1 : 0
    } else {
      arcEndX = outsideX
      arcEndY = swingSide === 'left' ? pivotY + widthPx : pivotY - widthPx
      sweepFlag = swingSide === 'left' ? 0 : 1
    }
  }

  return (
    <g pointerEvents="none">
      <path
        d={`M ${pivotX},${pivotY} A ${radius},${radius} 0 0,${sweepFlag} ${arcEndX},${arcEndY}`}
        fill="none"
        stroke={WALL_COLOR}
        strokeWidth={0.8}
        strokeDasharray="3 2"
      />
      <line
        x1={pivotX}
        y1={pivotY}
        x2={arcEndX}
        y2={arcEndY}
        stroke={WALL_COLOR}
        strokeWidth={0.8}
      />
    </g>
  )
}

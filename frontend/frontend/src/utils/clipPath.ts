import type { CornerCut } from '../types'

/** Build a clip-path polygon string for a corner-cut rectangle. */
export function computeClipPoints(
  x: number, y: number, w: number, h: number,
  cut: CornerCut
): string {
  const { corner, widthPx: cw, heightPx: ch } = cut
  const safeW = Math.min(cw, w * 0.9)
  const safeH = Math.min(ch, h * 0.9)

  switch (corner) {
    case 'tl': return [
      [x + safeW, y], [x + w, y], [x + w, y + h], [x, y + h],
      [x, y + safeH], [x + safeW, y + safeH],
    ].map(p => p.join(',')).join(' ')
    case 'tr': return [
      [x, y], [x + w - safeW, y], [x + w - safeW, y + safeH],
      [x + w, y + safeH], [x + w, y + h], [x, y + h],
    ].map(p => p.join(',')).join(' ')
    case 'br': return [
      [x, y], [x + w, y], [x + w, y + h - safeH],
      [x + w - safeW, y + h - safeH], [x + w - safeW, y + h], [x, y + h],
    ].map(p => p.join(',')).join(' ')
    case 'bl': return [
      [x, y], [x + w, y], [x + w, y + h],
      [x + safeW, y + h], [x + safeW, y + h - safeH], [x, y + h - safeH],
    ].map(p => p.join(',')).join(' ')
  }
}

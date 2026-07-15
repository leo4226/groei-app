export type PlantPassportSwipeDirection = 'prev' | 'next'

const MIN_HORIZONTAL_SWIPE_PX = 60

/**
 * Classify an intentional horizontal passport swipe.
 *
 * Horizontal movement must clear a minimum distance and dominate vertical
 * movement, so diagonal scrolling remains normal page scrolling.
 */
export function plantPassportSwipeDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): PlantPassportSwipeDirection | null {
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dx) < MIN_HORIZONTAL_SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return null
  return dx > 0 ? 'prev' : 'next'
}
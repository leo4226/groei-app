import { describe, expect, it } from 'vitest'
import { zoomAroundViewportCenter } from './editorViewport'

describe('zoomAroundViewportCenter', () => {
  it('keeps unpanned content centred when zooming out', () => {
    expect(zoomAroundViewportCenter({ x: 0, y: 0 }, 1, 0.75, 680, 680)).toEqual({
      x: 85,
      y: 85,
    })
  })

  it('keeps the current viewport centre stationary after panning', () => {
    const pan = { x: -120, y: 48 }
    const result = zoomAroundViewportCenter(pan, 1.5, 1, 680, 680)

    expect(result.x).toBeCloseTo(33.333, 3)
    expect(result.y).toBeCloseTo(145.333, 3)
  })

  it('does not move the viewport when zoom is unchanged', () => {
    expect(zoomAroundViewportCenter({ x: 24, y: -15 }, 1, 1, 680, 680)).toEqual({
      x: 24,
      y: -15,
    })
  })
})

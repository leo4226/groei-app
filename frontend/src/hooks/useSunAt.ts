import { useState, useEffect, useMemo } from 'react'
import type { MapInfo, CanvasData } from '../types'
import { createLightEngine } from '../utils/lightEngine'
import { deriveAllShadowCasters, deriveGardenBounds, deriveGardenPerimeter } from '../utils/gardenFromCanvas'

export function useSunAt(
  coord: { x: number; y: number } | null,
  month: number,
  mapInfo: MapInfo | null,
): { sunHours: number | null; isLoading: boolean } {
  const [sunHours, setSunHours] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const engine = useMemo(() => {
    if (!mapInfo || mapInfo.map_type !== 'outdoor' || mapInfo.lat == null || mapInfo.lon == null) return null
    let canvasData: CanvasData | null = null
    try {
      canvasData = mapInfo.canvas_data ? (JSON.parse(mapInfo.canvas_data) as CanvasData) : null
    } catch {
      // malformed canvas_data — proceed without shadow casters
    }
    const shadowCasters = canvasData ? deriveAllShadowCasters(canvasData) : []
    const gardenBounds = canvasData
      ? (deriveGardenBounds(canvasData.zones) ?? { minX: 0, minY: 0, maxX: canvasData.canvas_w, maxY: canvasData.canvas_h })
      : { minX: 0, minY: 0, maxX: 680, maxY: 680 }
    const gardenPerimeter = canvasData
      ? (canvasData.gardenPerimeter && canvasData.gardenPerimeter.length >= 3
          ? canvasData.gardenPerimeter
          : deriveGardenPerimeter(canvasData.zones))
      : null
    return createLightEngine({
      lat: mapInfo.lat,
      lon: mapInfo.lon,
      bearing: mapInfo.bearing,
      shadowCasters,
      gardenBounds,
      gardenPerimeter,
    })
  }, [mapInfo])

  useEffect(() => {
    if (!engine || !coord) {
      setSunHours(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    engine.computeHeatmap(month).then(() => {
      if (cancelled) return
      setSunHours(engine.getSunHoursAtPosition(coord.x, coord.y, month))
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [engine, coord?.x, coord?.y, month])

  return { sunHours, isLoading }
}

import { useState, useEffect, useRef } from 'react'
import { computeHeatmap, type HeatmapCell } from '../utils/heatmapCalc'
import type { LightEngine } from '../utils/lightEngine'

/**
 * Computes sun hours heatmap for a given month.
 * When an engine is provided, uses per-map config (lat/lon/bearing/shadowCasters/gardenBounds).
 * Falls back to hardcoded defaults when no engine is available.
 */
export function useSunHeatmap(month: number, active: boolean, engine?: LightEngine | null) {
  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  const cacheRef = useRef<Map<number, HeatmapCell[]>>(new Map())

  // The per-month cache is keyed only by month, so it must be dropped whenever
  // the engine changes (bearing, shadow casters, plant-shade toggle) — otherwise
  // a recomputed month returns stale cells for the old configuration.
  const prevEngineRef = useRef(engine)
  if (prevEngineRef.current !== engine) {
    cacheRef.current.clear()
    prevEngineRef.current = engine
  }

  useEffect(() => {
    if (!active) {
      setCells([])
      return
    }

    // Check cache first
    const cached = cacheRef.current.get(month)
    if (cached) {
      setCells(cached)
      return
    }

    setIsCalculating(true)

    if (engine) {
      // Use per-map engine (async — returns Promise)
      engine.computeHeatmap(month).then(result => {
        cacheRef.current.set(month, result)
        setCells(result)
        setIsCalculating(false)
      })
    } else {
      // Fallback: hardcoded defaults
      const handle = setTimeout(() => {
        const result = computeHeatmap(month)
        cacheRef.current.set(month, result)
        setCells(result)
        setIsCalculating(false)
      }, 0)
      return () => clearTimeout(handle)
    }
  }, [month, active, engine])

  return { cells, isCalculating }
}

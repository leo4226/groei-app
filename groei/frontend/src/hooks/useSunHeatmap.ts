import { useState, useEffect, useRef } from 'react'
import { computeHeatmap, type HeatmapCell } from '../utils/heatmapCalc'

/**
 * Computes sun hours heatmap for a given month.
 * Caches results per month so switching back is instant.
 */
export function useSunHeatmap(month: number, active: boolean) {
  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  const cacheRef = useRef<Map<number, HeatmapCell[]>>(new Map())

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

    // Compute in next tick so loading state renders
    setIsCalculating(true)
    const handle = setTimeout(() => {
      const result = computeHeatmap(month)
      cacheRef.current.set(month, result)
      setCells(result)
      setIsCalculating(false)
    }, 0)

    return () => clearTimeout(handle)
  }, [month, active])

  return { cells, isCalculating }
}

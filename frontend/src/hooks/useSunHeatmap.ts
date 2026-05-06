import { useState, useEffect } from 'react'
import type { HeatmapCell } from '../utils/heatmapCalc'
import type { LightEngine } from '../utils/lightEngine'

export function useSunHeatmap(month: number, active: boolean, engine: LightEngine | null) {
  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [isCalculating, setIsCalculating] = useState(false)

  useEffect(() => {
    if (!active || !engine) {
      setCells([])
      return
    }

    let cancelled = false
    setIsCalculating(true)
    engine.computeHeatmap(month).then(result => {
      if (!cancelled) {
        setCells(result)
        setIsCalculating(false)
      }
    })

    return () => { cancelled = true }
  }, [month, active, engine])

  return { cells, isCalculating }
}

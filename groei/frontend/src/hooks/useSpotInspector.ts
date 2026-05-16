import { useState, useCallback } from 'react'
import { getSunHoursAtPosition } from '../utils/heatmapCalc'
import type { LightEngine } from '../utils/lightEngine'

export interface SpeciesSuggestion {
  species_id: number
  common_name_nl: string
  common_name_en: string | null
  latin_name: string | null
  tier: 'suitable' | 'marginal' | 'unsuitable'
  avg_shortfall_hours: number
  max_shortfall_hours: number
  sow_window: number[]
  transplant_window: number[]
  harvest_window: number[]
  frost_sensitive: boolean
  interesting_facts_nl: string
  active_months: number[]
}

export interface SpotInspectorResult {
  x: number
  y: number
  sunByMonth: number[]
  species: SpeciesSuggestion[]
  error: string | null
}

export function useSpotInspector(engine?: LightEngine | null) {
  const [result, setResult] = useState<SpotInspectorResult | null>(null)
  const [loading, setLoading] = useState(false)

  const inspect = useCallback(async (x: number, y: number) => {
    setLoading(true)
    const sunByMonth = Array.from({ length: 12 }, (_, i) => {
      if (engine) {
        return engine.getSunHoursAtPosition(x, y, i + 1) ?? 0
      }
      return getSunHoursAtPosition(x, y, i + 1)
    })

    try {
      const resp = await fetch('/api/spots/suitability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, sun_by_month: sunByMonth }),
      })
      const data = await resp.json()
      setResult({ x, y, sunByMonth, species: data.species, error: null })
    } catch {
      setResult({ x, y, sunByMonth, species: [], error: 'Kon niet laden' })
    } finally {
      setLoading(false)
    }
  }, [engine])

  const clear = useCallback(() => setResult(null), [])

  return { result, loading, inspect, clear }
}

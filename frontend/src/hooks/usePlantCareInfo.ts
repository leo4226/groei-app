import { useState, useEffect } from 'react'
import { apiRequest } from '../api/client'

export interface BoomkeuringItem {
  aspect: string
  score: string
  toelichting: string
}

export interface PlantNotesData {
  stamdiameter_cm?: number
  hoogte_m?: number
  leeftijd?: string
  boomkeuring?: BoomkeuringItem[]
}

export interface CareInfo {
  scientific_name: string | null
  common_name: string | null
  family: string | null
  duration: string | null          // "perennial" | "annual" | "biennial" | null
  leaf_retention: boolean | null   // true = evergreen
  light_label: 'shade' | 'partial' | 'full_sun' | null
  light_raw: number | null         // 0–10
  precip_min_mm: number | null
  precip_max_mm: number | null
  bloom_months: string[]           // lowercase month names e.g. ["august","september"]
  flower_colors: string[]
  avg_height_cm: number | null
  toxicity: string | null
  edible: boolean | null
  image_url: string | null
  source: 'trefle' | 'cache' | 'local_registry' | 'llm' | 'not_found'
  cached_at: string | null
  plant_notes: string | null
}

interface State {
  data: CareInfo | null
  loading: boolean
  error: boolean
}

// Module-level cache — survives sidebar close/open within a session
const _cache = new Map<number, CareInfo>()

export function usePlantCareInfo(plantId: number | null) {
  const [state, setState] = useState<State>(() => ({
    data: plantId != null ? (_cache.get(plantId) ?? null) : null,
    loading: plantId != null && !_cache.has(plantId),
    error: false,
  }))

  useEffect(() => {
    if (plantId == null) return

    if (_cache.has(plantId)) {
      setState({ data: _cache.get(plantId)!, loading: false, error: false })
      return
    }

    let cancelled = false
    setState({ data: null, loading: true, error: false })

    apiRequest<CareInfo>('GET', `/plants/${plantId}/care-info`)
      .then(data => {
        if (cancelled) return
        _cache.set(plantId, data)
        setState({ data, loading: false, error: false })
      })
      .catch((err) => {
        if (cancelled) return
        console.error(`[usePlantCareInfo] Failed to fetch care info for plant ${plantId}:`, err)
        setState({ data: null, loading: false, error: true })
      })

    return () => { cancelled = true }
  }, [plantId])

  return state
}

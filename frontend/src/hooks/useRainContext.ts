import { useState, useEffect } from 'react'

export interface RainDay {
  date: string
  mm: number
}

export interface RainContext {
  days: RainDay[]
  total_7day_mm: number
  assessment: 'well_watered' | 'moderate' | 'dry' | 'very_dry' | 'unknown'
}

interface State {
  data: RainContext | null
  loading: boolean
  error: string | null
}

// Module-level cache — fetched once per app session
let _cached: RainContext | null = null
let _fetchPromise: Promise<RainContext> | null = null

export function useRainContext() {
  const [state, setState] = useState<State>({
    data: _cached,
    loading: _cached == null,
    error: null,
  })

  useEffect(() => {
    if (_cached) {
      setState({ data: _cached, loading: false, error: null })
      return
    }

    if (!_fetchPromise) {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
      _fetchPromise = fetch(`${apiBase}/garden/rain-context`)
        .then((r) => {
          if (!r.ok) throw new Error('Failed to load rain data')
          return r.json() as Promise<RainContext>
        })
        .then((data) => {
          _cached = data
          return data
        })
    }

    let cancelled = false
    _fetchPromise
      .then((data) => {
        if (cancelled) return
        setState({ data, loading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        _fetchPromise = null
        setState({ data: null, loading: false, error: err.message })
      })

    return () => { cancelled = true }
  }, [])

  return state
}

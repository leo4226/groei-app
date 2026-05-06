import { useState, useEffect } from 'react'

export interface TempDay {
  date: string
  min: number
  max: number
}

export interface TempContext {
  days: TempDay[]
  avg_max_7day: number
  assessment: 'hot' | 'warm' | 'mild' | 'cool' | 'cold'
}

interface State {
  data: TempContext | null
  loading: boolean
  error: string | null
}

// Module-level cache — fetched once per app session
let _cached: TempContext | null = null
let _fetchPromise: Promise<TempContext> | null = null

export function useTemperatureContext() {
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
      _fetchPromise = fetch('/api/garden/temperature-context')
        .then((r) => {
          if (!r.ok) throw new Error('Failed to load temperature data')
          return r.json() as Promise<TempContext>
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

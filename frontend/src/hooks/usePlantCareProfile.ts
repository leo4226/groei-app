import { useState, useEffect, useCallback } from 'react'
import type { PlantWarningStateOut } from '../types'
import { plants as plantsApi } from '../api/client'

const _cache = new Map<number, { data: PlantWarningStateOut; ts: number }>()
const CACHE_TTL = 60_000 // 1 minute

interface UseCareProfileResult {
  state: PlantWarningStateOut | null
  loading: boolean
  error: boolean
  invalidate: () => void
}

export function usePlantCareProfile(plantId: number | null): UseCareProfileResult {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{
    data: PlantWarningStateOut | null
    loading: boolean
    error: boolean
  }>(() => {
    const cached = plantId !== null ? _cache.get(plantId) : undefined
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { data: cached.data, loading: false, error: false }
    }
    return { data: null, loading: true, error: false }
  })

  const invalidate = useCallback(() => {
    if (plantId !== null) _cache.delete(plantId)
    setVersion(v => v + 1)
  }, [plantId])

  useEffect(() => {
    if (plantId === null) return

    const cached = _cache.get(plantId)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setState({ data: cached.data, loading: false, error: false })
      return
    }

    let cancelled = false
    setState(s => ({ ...s, loading: true }))

    plantsApi.warnings(plantId).then(data => {
      if (cancelled) return
      _cache.set(plantId, { data, ts: Date.now() })
      setState({ data, loading: false, error: false })
    }).catch(() => {
      if (!cancelled) setState(s => ({ ...s, loading: false, error: true }))
    })

    return () => { cancelled = true }
  }, [plantId, version])

  return {
    state: state.data,
    loading: state.loading,
    error: state.error,
    invalidate,
  }
}

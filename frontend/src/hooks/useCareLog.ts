import { useState, useEffect, useCallback } from 'react'
import type { CareLogEntry } from '../types'
import { care } from '../api/client'

const _cache = new Map<number, CareLogEntry[]>()

interface UseCareLogResult {
  data: CareLogEntry[] | null
  loading: boolean
  error: boolean
  invalidate: () => void
}

export function useCareLog(plantId: number | null): UseCareLogResult {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{
    data: CareLogEntry[] | null
    loading: boolean
    error: boolean
  }>(() => ({
    data: plantId != null ? (_cache.get(plantId) ?? null) : null,
    loading: plantId != null && !_cache.has(plantId),
    error: false,
  }))

  const invalidate = useCallback(() => {
    if (plantId != null) {
      _cache.delete(plantId)
    }
    setVersion(v => v + 1)
  }, [plantId])

  useEffect(() => {
    if (plantId == null) return

    if (_cache.has(plantId) && version === 0) {
      setState({ data: _cache.get(plantId)!, loading: false, error: false })
      return
    }

    let cancelled = false
    setState({ data: null, loading: true, error: false })

    care.log(plantId)
      .then(data => {
        if (cancelled) return
        _cache.set(plantId, data)
        setState({ data, loading: false, error: false })
      })
      .catch(() => {
        if (cancelled) return
        setState({ data: null, loading: false, error: true })
      })

    return () => { cancelled = true }
  }, [plantId, version])

  return { ...state, invalidate }
}

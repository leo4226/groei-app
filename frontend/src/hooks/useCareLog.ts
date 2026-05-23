import { useState, useEffect, useRef } from 'react'
import type { CareLogEntry } from '../types'
import { care } from '../api/client'
import { useFloreren } from '../store/useFloreren'

const _cache = new Map<number, CareLogEntry[]>()

interface UseCareLogResult {
  data: CareLogEntry[] | null
  loading: boolean
  error: boolean
}

export function useCareLog(plantId: number | null): UseCareLogResult {
  const [version, setVersion] = useState(0)
  const careVersion = useFloreren(s => s.careVersions[plantId ?? -1] ?? 0)
  const prevCareVersionRef = useRef(careVersion)

  // Auto-invalidate when care is marked done/skipped
  useEffect(() => {
    if (prevCareVersionRef.current !== careVersion) {
      prevCareVersionRef.current = careVersion
      if (plantId != null) _cache.delete(plantId)
      setVersion(v => v + 1)
    }
  }, [careVersion, plantId])

  const [state, setState] = useState<{
    data: CareLogEntry[] | null
    loading: boolean
    error: boolean
  }>(() => ({
    data: plantId != null ? (_cache.get(plantId) ?? null) : null,
    loading: plantId != null && !_cache.has(plantId),
    error: false,
  }))

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

  return state
}

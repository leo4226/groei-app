import { useCallback, useEffect, useRef, useState } from 'react'
import {
  gardenCare,
  mapWateringRound,
  type MapWateringRoundData,
} from '../api/client'

export interface UseMapWateringRoundReturn {
  data: MapWateringRoundData | null
  isOpen: boolean
  loading: boolean
  saving: boolean
  error: string | null
  open: () => Promise<void>
  close: () => void
  refresh: () => Promise<MapWateringRoundData | null>
  complete: (
    completedAt: string,
    userId: number,
    scheduleIds: number[],
  ) => Promise<void>
  undo: (operationId: number) => Promise<void>
}

export function useMapWateringRound(
  mapId: number | null,
): UseMapWateringRoundReturn {
  const [data, setData] = useState<MapWateringRoundData | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (mapId == null) {
      if (requestId === requestIdRef.current) setData(null)
      return null
    }
    setLoading(true)
    setError(null)
    try {
      const next = await mapWateringRound.get(mapId)
      if (requestId === requestIdRef.current) setData(next)
      return next
    } catch {
      if (requestId === requestIdRef.current) setError('load_failed')
      return null
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [mapId])

  useEffect(() => {
    setData(null)
    setError(null)
    void refresh()
    return () => {
      requestIdRef.current += 1
    }
  }, [refresh])

  const open = useCallback(async () => {
    setIsOpen(true)
    await refresh()
  }, [refresh])

  const close = useCallback(() => setIsOpen(false), [])

  const complete = useCallback(async (
    completedAt: string,
    userId: number,
    scheduleIds: number[],
  ) => {
    if (mapId == null) return
    setSaving(true)
    setError(null)
    try {
      await mapWateringRound.complete(
        mapId,
        completedAt,
        userId,
        scheduleIds,
      )
      await refresh()
      setIsOpen(false)
    } catch (cause) {
      setError('complete_failed')
      throw cause
    } finally {
      setSaving(false)
    }
  }, [mapId, refresh])

  const undo = useCallback(async (operationId: number) => {
    setSaving(true)
    setError(null)
    try {
      await gardenCare.undo(operationId)
      await refresh()
    } catch (cause) {
      setError('undo_failed')
      throw cause
    } finally {
      setSaving(false)
    }
  }, [refresh])

  return {
    data,
    isOpen,
    loading,
    saving,
    error,
    open,
    close,
    refresh,
    complete,
    undo,
  }
}

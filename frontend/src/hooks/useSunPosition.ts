import { useState, useMemo, useCallback } from 'react'
import type { LightEngine } from '../utils/lightEngine'
import type { SunPosition } from '../utils/sunCalc'
import type { ShadowPolygon } from '../utils/shadowGeometry'

export function useSunPosition(engine: LightEngine | null) {
  const now = new Date()
  const [sunModeActive, setSunModeActive] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedHour, setSelectedHour] = useState(now.getHours() + now.getMinutes() / 60)

  const toggleSunMode = useCallback(() => setSunModeActive(v => !v), [])

  const setToNow = useCallback(() => {
    const n = new Date()
    setSelectedMonth(n.getMonth() + 1)
    setSelectedHour(n.getHours() + n.getMinutes() / 60)
  }, [])

  const sunPosition: SunPosition | null = useMemo(() => {
    if (!sunModeActive || !engine) return null
    return engine.getSunPosition(selectedMonth, selectedHour)
  }, [sunModeActive, selectedMonth, selectedHour, engine])

  const shadows: ShadowPolygon[] = useMemo(() => {
    if (!sunPosition || !engine) return []
    return engine.getShadows(sunPosition)
  }, [sunPosition, engine])

  return {
    sunModeActive,
    toggleSunMode,
    selectedMonth,
    setSelectedMonth,
    selectedHour,
    setSelectedHour,
    sunPosition,
    shadows,
    setToNow,
  }
}

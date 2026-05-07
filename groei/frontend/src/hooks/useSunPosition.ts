import { useState, useMemo, useCallback } from 'react'
import { getSunPosition } from '../utils/sunCalc'
import { SHADOW_CASTERS } from '../utils/gardenStructures'
import { computeShadows } from '../utils/shadowGeometry'
import type { SunPosition } from '../utils/sunCalc'
import type { ShadowPolygon } from '../utils/shadowGeometry'

export function useSunPosition() {
  const now = new Date()
  const [sunModeActive, setSunModeActive] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-12
  const [selectedHour, setSelectedHour] = useState(now.getHours() + now.getMinutes() / 60)

  const toggleSunMode = useCallback(() => setSunModeActive(v => !v), [])

  const setToNow = useCallback(() => {
    const n = new Date()
    setSelectedMonth(n.getMonth() + 1)
    setSelectedHour(n.getHours() + n.getMinutes() / 60)
  }, [])

  const sunPosition: SunPosition | null = useMemo(() => {
    if (!sunModeActive) return null
    const date = new Date(now.getFullYear(), selectedMonth - 1, 15)
    const hours = Math.floor(selectedHour)
    const minutes = Math.round((selectedHour - hours) * 60)
    date.setHours(hours, minutes, 0, 0)
    return getSunPosition(date)
  }, [sunModeActive, selectedMonth, selectedHour])

  const shadows: ShadowPolygon[] = useMemo(() => {
    if (!sunPosition) return []
    return computeShadows(sunPosition, SHADOW_CASTERS)
  }, [sunPosition])

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

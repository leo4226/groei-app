import { useState, useCallback, useMemo } from 'react'
import { useSunPosition } from './useSunPosition'
import { useSunHeatmap } from './useSunHeatmap'
import { useSpotInspector, type SpotInspectorResult } from './useSpotInspector'
import { createLightEngine } from '../utils/lightEngine'
import { shadowCastersToObstructions } from '../utils/heatmapCalc'
import { deriveAllShadowCasters, deriveGardenBounds, deriveGardenPerimeter, deriveViewBoxString } from '../utils/gardenFromCanvas'
import { derivePlantShadowCasters } from '../utils/plantShade'
import type { SunPosition } from '../utils/sunCalc'
import type { ShadowPolygon } from '../utils/shadowGeometry'
import type { ShadowCaster } from '../utils/gardenStructures'
import type { HeatmapCell } from '../utils/heatmapCalc'
import type { PlantSunProfile } from '../utils/plantSunRequirements'

import type { Obstruction } from '../utils/skyViewFactor'
import type { SunViewMode } from '../components/sun/SunControls'
import type { CanvasData, MapPlant } from '../types'

export type { SpotInspectorResult }

export interface SunVisualization {
  // Sun mode
  active: boolean
  available: boolean  // lat/lon set + isOutdoor → engine can be created
  toggle: () => void
  // Time
  month: number
  hour: number
  setMonth: (m: number) => void
  setHour: (h: number) => void
  setToNow: () => void
  // View mode
  viewMode: SunViewMode
  setViewMode: (mode: SunViewMode) => void
  // Heatmap
  cells: HeatmapCell[]
  isCalculating: boolean
  tappedCell: HeatmapCell | null
  // Plant suitability
  profile: PlantSunProfile | null
  setProfile: (p: PlantSunProfile | null) => void
  // Grow here
  showGrowHere: boolean
  openGrowHere: () => void
  closeGrowHere: () => void
  // Inspector
  inspectorMode: boolean
  toggleInspectorMode: () => void
  inspectorResult: SpotInspectorResult | null
  inspectorLoading: boolean
  clearInspector: () => void
  // Computed outputs for MapView
  sunPosition: SunPosition | null
  shadows: ShadowPolygon[]
  shadowCasters: ShadowCaster[]
  isLiveActive: boolean
  isHeatmapActive: boolean
  gardenObstructions: Obstruction[]
  // Dynamic garden geometry
  gardenPerimeter: [number, number][] | null  // null = no masking
  gardenBounds: { minX: number; minY: number; maxX: number; maxY: number }
  gardenViewBox: string
  // Encapsulates inspector-vs-tappedCell branch
  handleCellTap: (cell: HeatmapCell) => void
  // Auto-shade from plant height (#648) — per-map toggle, default off
  estimatePlantShade: boolean
  toggleEstimatePlantShade: () => void
}

export function useSunVisualization(options: {
  isOutdoor: boolean
  lat?: number
  lon?: number
  bearing?: number
  canvasData?: CanvasData | null
  plants?: MapPlant[]
  mapId?: number | null
}): SunVisualization {
  const { isOutdoor, lat, lon, bearing = 0, canvasData, plants, mapId } = options

  // Per-map "estimate plant shade" toggle (#648). Default off; persisted per
  // map in localStorage while the model is validated.
  const shadeKey = mapId != null ? `floreren_plant_shade_${mapId}` : null
  const [estimatePlantShade, setEstimatePlantShade] = useState<boolean>(
    () => (shadeKey ? localStorage.getItem(shadeKey) === '1' : false),
  )
  const toggleEstimatePlantShade = useCallback(() => {
    setEstimatePlantShade((v) => {
      const next = !v
      if (shadeKey) localStorage.setItem(shadeKey, next ? '1' : '0')
      return next
    })
  }, [shadeKey])

  // Derive shadow casters and garden geometry from canvas_data
  const baseShadowCasters = useMemo(() => {
    if (!canvasData) return []
    return deriveAllShadowCasters(canvasData)
  }, [canvasData])

  // Soft casters for tall plants, only when the toggle is on (view-time only).
  const plantShadowCasters = useMemo(() => {
    if (!estimatePlantShade || !plants || plants.length === 0 || !canvasData) return []
    return derivePlantShadowCasters(plants, { scalePxPerM: canvasData.scale_px_per_m })
  }, [estimatePlantShade, plants, canvasData])

  const shadowCasters = useMemo(
    () => (plantShadowCasters.length ? [...baseShadowCasters, ...plantShadowCasters] : baseShadowCasters),
    [baseShadowCasters, plantShadowCasters],
  )

  const gardenBounds = useMemo(() => {
    if (!canvasData) return { minX: 0, minY: 0, maxX: 680, maxY: 680 }
    return deriveGardenBounds(canvasData.zones)
      ?? { minX: 0, minY: 0, maxX: canvasData.canvas_w, maxY: canvasData.canvas_h }
  }, [canvasData])

  const gardenPerimeter = useMemo((): [number, number][] | null => {
    if (!canvasData) return [[0, 0], [680, 0], [680, 680], [0, 680]]
    // Prefer manually saved perimeter over auto-detection
    if (canvasData.gardenPerimeter && canvasData.gardenPerimeter.length >= 3) {
      return canvasData.gardenPerimeter
    }
    return deriveGardenPerimeter(canvasData.zones)
  }, [canvasData])

  const gardenViewBox = useMemo(() => {
    if (!canvasData) return '0 0 680 680'
    return deriveViewBoxString(canvasData.zones, canvasData.canvas_w, canvasData.canvas_h)
  }, [canvasData])

  const engine = useMemo(
    () => lat != null && lon != null
      ? createLightEngine({ lat, lon, bearing, shadowCasters, gardenBounds, gardenPerimeter })
      : null,
    [lat, lon, bearing, shadowCasters, gardenBounds, gardenPerimeter]
  )

  const sunAvailable = isOutdoor && lat != null && lon != null

  const {
    sunModeActive, toggleSunMode,
    selectedMonth, setSelectedMonth,
    selectedHour, setSelectedHour,
    setToNow,
  } = useSunPosition()

  // Compute sun position and shadows through the engine so that the correct
  // lat/lon/bearing and dynamic shadow casters are used.
  const sunPosition = useMemo((): SunPosition | null => {
    if (!sunModeActive || !engine) return null
    return engine.getSunPosition(selectedMonth, selectedHour)
  }, [sunModeActive, engine, selectedMonth, selectedHour])

  const shadows = useMemo((): ShadowPolygon[] => {
    if (!sunPosition || !engine) return []
    return engine.getShadows(sunPosition)
  }, [sunPosition, engine])

  const [viewMode, setViewModeRaw] = useState<SunViewMode>('live')
  const [profile, setProfileRaw] = useState<PlantSunProfile | null>(null)
  const [tappedCell, setTappedCell] = useState<HeatmapCell | null>(null)
  const [showGrowHere, setShowGrowHere] = useState(false)
  const [inspectorMode, setInspectorMode] = useState(false)

  const { result: inspectorResult, loading: inspectorLoading, inspect, clear: clearInspector } = useSpotInspector(engine, mapId)

  const isHeatmapActive = isOutdoor && sunModeActive && viewMode === 'heatmap'
  const isLiveActive = isOutdoor && sunModeActive && viewMode === 'live'

  const { cells, isCalculating } = useSunHeatmap(selectedMonth, isHeatmapActive, engine)

  const gardenObstructions = useMemo(() => shadowCastersToObstructions(shadowCasters), [shadowCasters])

  const setViewMode = useCallback((mode: SunViewMode) => {
    setViewModeRaw(mode)
    setTappedCell(null)
    setProfileRaw(null)
  }, [])

  const setMonth = useCallback((m: number) => {
    setSelectedMonth(m)
    setTappedCell(null)
    setShowGrowHere(false)
  }, [setSelectedMonth])

  const setProfile = useCallback((p: PlantSunProfile | null) => {
    setProfileRaw(p)
  }, [])

  const toggleInspectorMode = useCallback(() => {
    setInspectorMode(m => !m)
    clearInspector()
    if (!inspectorMode) {
      if (!sunModeActive) toggleSunMode()
      setViewModeRaw('heatmap')
    }
  }, [clearInspector, inspectorMode, sunModeActive, toggleSunMode, setViewModeRaw])

  const handleCellTap = useCallback((cell: HeatmapCell) => {
    if (inspectorMode) {
      inspect(cell.x + cell.w / 2, cell.y + cell.h / 2)
    } else {
      setTappedCell(cell)
    }
  }, [inspectorMode, inspect])

  return {
    active: sunModeActive,
    available: sunAvailable,
    toggle: toggleSunMode,
    month: selectedMonth,
    hour: selectedHour,
    setMonth,
    setHour: setSelectedHour,
    setToNow,
    viewMode,
    setViewMode,
    cells,
    isCalculating,
    tappedCell,
    profile,
    setProfile,
    showGrowHere,
    openGrowHere: () => setShowGrowHere(true),
    closeGrowHere: () => setShowGrowHere(false),
    inspectorMode,
    toggleInspectorMode,
    inspectorResult,
    inspectorLoading,
    clearInspector,
    sunPosition,
    shadows,
    shadowCasters,
    isLiveActive,
    isHeatmapActive,
    gardenObstructions,
    gardenPerimeter,
    gardenBounds,
    gardenViewBox,
    handleCellTap,
    estimatePlantShade,
    toggleEstimatePlantShade,
  }
}

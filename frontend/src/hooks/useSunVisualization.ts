import { useState, useCallback, useMemo } from 'react'
import { useSunPosition } from './useSunPosition'
import { useSunHeatmap } from './useSunHeatmap'
import { useSpotInspector, type SpotInspectorResult } from './useSpotInspector'
import { createLightEngine } from '../utils/lightEngine'
import { shadowCastersToObstructions } from '../utils/heatmapCalc'
import { SHADOW_CASTERS, GARDEN_FLOOR, GARDEN_SVG_TOP_AZIMUTH } from '../utils/gardenStructures'
import type { SunPosition } from '../utils/sunCalc'
import type { ShadowPolygon } from '../utils/shadowGeometry'
import type { HeatmapCell } from '../utils/heatmapCalc'
import type { PlantSunProfile } from '../utils/plantSunRequirements'
import type { HeatmapLayer } from '../utils/lightQuality'
import type { Obstruction } from '../utils/skyViewFactor'
import type { SunViewMode } from '../components/sun/SunControls'

export type { SpotInspectorResult }

export interface SunVisualization {
  // Sun mode
  active: boolean
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
  layer: HeatmapLayer
  setLayer: (l: HeatmapLayer) => void
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
  isLiveActive: boolean
  isHeatmapActive: boolean
  gardenObstructions: Obstruction[]
  // Encapsulates inspector-vs-tappedCell branch
  handleCellTap: (cell: HeatmapCell) => void
}

// Stable garden bounds derived from GARDEN_FLOOR — module-level so they don't recreate
const [_tl, _tr, , _bl] = GARDEN_FLOOR
const GARDEN_BOUNDS = { minX: _tl[0], minY: _tl[1], maxX: _tr[0], maxY: _bl[1] }

export function useSunVisualization(options: {
  isOutdoor: boolean
  lat?: number
  lon?: number
}): SunVisualization {
  const { isOutdoor, lat, lon } = options

  const engine = useMemo(
    () => lat != null && lon != null
      ? createLightEngine({ lat, lon, bearing: GARDEN_SVG_TOP_AZIMUTH, shadowCasters: SHADOW_CASTERS, gardenBounds: GARDEN_BOUNDS })
      : null,
    [lat, lon]
  )

  const {
    sunModeActive, toggleSunMode,
    selectedMonth, setSelectedMonth,
    selectedHour, setSelectedHour,
    sunPosition, shadows, setToNow,
  } = useSunPosition(engine)

  const [viewMode, setViewModeRaw] = useState<SunViewMode>('live')
  const [layer, setLayerRaw] = useState<HeatmapLayer>('sun_hours')
  const [profile, setProfileRaw] = useState<PlantSunProfile | null>(null)
  const [tappedCell, setTappedCell] = useState<HeatmapCell | null>(null)
  const [showGrowHere, setShowGrowHere] = useState(false)
  const [inspectorMode, setInspectorMode] = useState(false)

  const { result: inspectorResult, loading: inspectorLoading, inspect, clear: clearInspector } = useSpotInspector(engine)

  const isHeatmapActive = isOutdoor && sunModeActive && viewMode === 'heatmap'
  const isLiveActive = isOutdoor && sunModeActive && viewMode === 'live'

  const { cells, isCalculating } = useSunHeatmap(selectedMonth, isHeatmapActive, engine)

  // Debug SVF overlay — only consumer of raw Obstruction[]; kept outside engine seam intentionally
  const gardenObstructions = useMemo(() => shadowCastersToObstructions(SHADOW_CASTERS), [])

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

  const setLayer = useCallback((l: HeatmapLayer) => {
    setLayerRaw(l)
    setTappedCell(null)
  }, [])

  const setProfile = useCallback((p: PlantSunProfile | null) => {
    setProfileRaw(p)
  }, [])

  const toggleInspectorMode = useCallback(() => {
    setInspectorMode(m => !m)
    clearInspector()
  }, [clearInspector])

  const handleCellTap = useCallback((cell: HeatmapCell) => {
    if (inspectorMode) {
      inspect(cell.x + cell.w / 2, cell.y + cell.h / 2)
    } else {
      setTappedCell(cell)
    }
  }, [inspectorMode, inspect])

  return {
    active: sunModeActive,
    toggle: toggleSunMode,
    month: selectedMonth,
    hour: selectedHour,
    setMonth,
    setHour: setSelectedHour,
    setToNow,
    viewMode,
    setViewMode,
    layer,
    setLayer,
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
    isLiveActive,
    isHeatmapActive,
    gardenObstructions,
    handleCellTap,
  }
}

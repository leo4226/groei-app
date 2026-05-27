import { useCallback, useReducer, useRef, useState } from 'react'
import type { EditorZone, ZoneStyleType, CanvasData, WallElement, MapType, ObjectShapeType, ObjectType, ObjectCategory, ShadowCaster } from '../types'
import {
  DEFAULT_DOOR_WIDTH_CM,
  DEFAULT_WINDOW_WIDTH_CM,
} from '../constants/mapDefaults'

export type EditorTool = 'select' | 'draw' | 'place_door' | 'place_window' | 'shadow_caster' | 'place_object'

export interface ObjectPreset {
  label: string
  object_type: ObjectType
  shape: ObjectShapeType
  diameter_cm?: number
  width_cm?: number
  depth_cm?: number
  material: string
  color: string
  category: ObjectCategory
  preset?: string
}

export const CONTAINER_PRESETS: ObjectPreset[] = [
  { label: 'Round pot',   object_type: 'pot',        shape: 'circle',    diameter_cm: 30,  material: 'terracotta', color: '#B7654B', category: 'container' },
  { label: 'Square pot',  object_type: 'pot',        shape: 'square',    width_cm: 30,     material: 'plastic',    color: '#888888', category: 'container' },
  { label: 'Planter',     object_type: 'planter',    shape: 'rectangle', width_cm: 80,  depth_cm: 30,  material: 'wood',       color: '#8B6914', category: 'container' },
  { label: 'Corten ring', object_type: 'pot',        shape: 'circle',    diameter_cm: 100, material: 'corten',     color: '#A0522D', category: 'container' },
  { label: 'Raised bed',  object_type: 'raised_bed', shape: 'rectangle', width_cm: 200, depth_cm: 80,  material: 'wood',       color: '#8B5A30', category: 'container' },
]

export const HARDSCAPE_PRESETS: ObjectPreset[] = [
  { label: 'Stepping stone', object_type: 'furniture', shape: 'rectangle', width_cm: 60,  depth_cm: 40, material: 'stone',   color: '#a8a090', category: 'hardscape', preset: 'stepping_stone' },
  { label: 'Bench',          object_type: 'furniture', shape: 'rectangle', width_cm: 180, depth_cm: 40, material: 'wood',    color: '#8b7355', category: 'hardscape', preset: 'bench' },
  { label: 'Table',          object_type: 'furniture', shape: 'rectangle', width_cm: 80,  depth_cm: 80, material: 'wood',    color: '#8b7355', category: 'hardscape', preset: 'table' },
  { label: 'Chair',          object_type: 'furniture', shape: 'rectangle', width_cm: 50,  depth_cm: 50, material: 'wood',    color: '#8b7355', category: 'hardscape', preset: 'chair' },
  { label: 'Rain barrel',    object_type: 'furniture', shape: 'circle',    diameter_cm: 60,              material: 'plastic', color: '#3d5a6b', category: 'utility',   preset: 'rain_barrel' },
]

// ── State & actions ──────────────────────────────────────────────────────────

interface EditorState {
  zones: EditorZone[]
  wallElements: WallElement[]
  shadowCasters: ShadowCaster[]
  selectedZoneId: string | null
  selectedWallElementId: string | null
  selectedShadowCasterId: string | null
  activeTool: EditorTool
  activeZoneType: ZoneStyleType
  objectPreset: ObjectPreset | null
  shadowCasterPreset: 'building' | 'tree'
  isDirty: boolean
  scalePxPerM: number
  mapType: MapType
}

/** The slice of state that undo restores */
interface Snapshot {
  zones: EditorZone[]
  wallElements: WallElement[]
  shadowCasters: ShadowCaster[]
  scalePxPerM: number
  mapType: MapType
}

type Action =
  | { type: 'LOAD'; data: CanvasData }
  | { type: 'ADD_ZONE'; zone: EditorZone }
  | { type: 'UPDATE_ZONE'; id: string; updates: Partial<EditorZone> }
  | { type: 'DELETE_ZONE'; id: string }
  | { type: 'SELECT_ZONE'; id: string | null }
  | { type: 'SET_TOOL'; tool: EditorTool }
  | { type: 'SET_ZONE_TYPE'; zoneType: ZoneStyleType }
  | { type: 'SET_SCALE'; pxPerM: number }
  | { type: 'MARK_CLEAN' }
  | { type: 'ADD_WALL_ELEMENT'; element: WallElement }
  | { type: 'UPDATE_WALL_ELEMENT'; id: string; updates: Partial<WallElement> }
  | { type: 'DELETE_WALL_ELEMENT'; id: string }
  | { type: 'SELECT_WALL_ELEMENT'; id: string | null }
  | { type: 'SET_MAP_TYPE'; mapType: MapType }
  | { type: 'ADD_SHADOW_CASTER'; caster: ShadowCaster }
  | { type: 'UPDATE_SHADOW_CASTER'; id: string; updates: Partial<ShadowCaster> }
  | { type: 'DELETE_SHADOW_CASTER'; id: string }
  | { type: 'SELECT_SHADOW_CASTER'; id: string | null }
  | { type: 'SET_OBJECT_PRESET'; preset: ObjectPreset | null }
  | { type: 'SET_SHADOW_CASTER_PRESET'; preset: 'building' | 'tree' }
  | { type: 'UNDO'; snapshot: Snapshot }

/** Actions that record undo history before being applied */
const UNDOABLE = new Set([
  'ADD_ZONE', 'UPDATE_ZONE', 'DELETE_ZONE',
  'ADD_WALL_ELEMENT', 'UPDATE_WALL_ELEMENT', 'DELETE_WALL_ELEMENT',
  'ADD_SHADOW_CASTER', 'UPDATE_SHADOW_CASTER', 'DELETE_SHADOW_CASTER',
  'SET_SCALE', 'SET_MAP_TYPE',
])

const MAX_HISTORY = 60

// ── Reducer ──────────────────────────────────────────────────────────────────

const initialState: EditorState = {
  zones: [],
  wallElements: [],
  shadowCasters: [],
  selectedZoneId: null,
  selectedWallElementId: null,
  selectedShadowCasterId: null,
  activeTool: 'draw',
  activeZoneType: 'deck',
  objectPreset: null,
  shadowCasterPreset: 'building',
  isDirty: false,
  scalePxPerM: 46,
  mapType: 'outdoor',
}

function isInsideStructure(room: EditorZone, zones: EditorZone[]): boolean {
  return zones.some(
    (z) =>
      z.type === 'structure' &&
      room.x >= z.x &&
      room.y >= z.y &&
      room.x + room.width <= z.x + z.width &&
      room.y + room.height <= z.y + z.height
  )
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        zones: action.data.zones,
        wallElements: action.data.wallElements ?? [],
        shadowCasters: action.data.shadowCasters ?? [],
        scalePxPerM: action.data.scale_px_per_m,
        mapType: action.data.mapType ?? 'outdoor',
        isDirty: false,
      }
    case 'ADD_ZONE': {
      const zone = action.zone
      if (zone.type === 'room' && zone.wallThickness === undefined) {
        zone.wallThickness = isInsideStructure(zone, state.zones)
          ? 'interior'
          : 'exterior'
      }
      return {
        ...state,
        zones: [...state.zones, zone],
        selectedZoneId: zone.id,
        selectedWallElementId: null,
        activeTool: 'select',
        isDirty: true,
      }
    }
    case 'UPDATE_ZONE': {
      const posChanged = action.updates.x !== undefined ||
        action.updates.y !== undefined ||
        action.updates.width !== undefined ||
        action.updates.height !== undefined
      return {
        ...state,
        zones: state.zones.map((z) => {
          if (z.id !== action.id) return z
          const updated = { ...z, ...action.updates }
          // Auto-detect wallThickness when a room's position/size changes
          if (posChanged && updated.type === 'room') {
            updated.wallThickness = isInsideStructure(updated, state.zones.filter((oz) => oz.id !== action.id))
              ? 'interior'
              : 'exterior'
          }
          return updated
        }),
        isDirty: true,
      }
    }
    case 'DELETE_ZONE':
      return {
        ...state,
        zones: state.zones.filter((z) => z.id !== action.id),
        wallElements: state.wallElements.filter((w) => w.zoneId !== action.id),
        selectedZoneId:
          state.selectedZoneId === action.id ? null : state.selectedZoneId,
        isDirty: true,
      }
    case 'SELECT_ZONE':
      return { ...state, selectedZoneId: action.id, selectedWallElementId: null }
    case 'SET_TOOL':
      return {
        ...state,
        activeTool: action.tool,
        selectedZoneId: action.tool === 'draw' ? null : state.selectedZoneId,
        selectedWallElementId:
          action.tool === 'draw' ? null : state.selectedWallElementId,
      }
    case 'SET_ZONE_TYPE':
      return { ...state, activeZoneType: action.zoneType }
    case 'SET_SCALE':
      return { ...state, scalePxPerM: action.pxPerM, isDirty: true }
    case 'MARK_CLEAN':
      return { ...state, isDirty: false }
    case 'ADD_WALL_ELEMENT':
      return {
        ...state,
        wallElements: [...state.wallElements, action.element],
        selectedWallElementId: action.element.id,
        selectedZoneId: null,
        activeTool: 'select',
        isDirty: true,
      }
    case 'UPDATE_WALL_ELEMENT':
      return {
        ...state,
        wallElements: state.wallElements.map((w) =>
          w.id === action.id ? { ...w, ...action.updates } : w
        ),
        isDirty: true,
      }
    case 'DELETE_WALL_ELEMENT':
      return {
        ...state,
        wallElements: state.wallElements.filter((w) => w.id !== action.id),
        selectedWallElementId:
          state.selectedWallElementId === action.id
            ? null
            : state.selectedWallElementId,
        isDirty: true,
      }
    case 'SELECT_WALL_ELEMENT':
      return {
        ...state,
        selectedWallElementId: action.id,
        selectedZoneId: null,
      }
    case 'SET_MAP_TYPE':
      return { ...state, mapType: action.mapType, isDirty: true }
    case 'ADD_SHADOW_CASTER':
      return {
        ...state,
        shadowCasters: [...state.shadowCasters, action.caster],
        selectedShadowCasterId: action.caster.id,
        selectedZoneId: null,
        selectedWallElementId: null,
        activeTool: 'select',
        isDirty: true,
      }
    case 'UPDATE_SHADOW_CASTER':
      return {
        ...state,
        shadowCasters: state.shadowCasters.map((sc) =>
          sc.id === action.id ? { ...sc, ...action.updates } as ShadowCaster : sc
        ),
        isDirty: true,
      }
    case 'DELETE_SHADOW_CASTER':
      return {
        ...state,
        shadowCasters: state.shadowCasters.filter((sc) => sc.id !== action.id),
        selectedShadowCasterId:
          state.selectedShadowCasterId === action.id ? null : state.selectedShadowCasterId,
        isDirty: true,
      }
    case 'SELECT_SHADOW_CASTER':
      return {
        ...state,
        selectedShadowCasterId: action.id,
        selectedZoneId: null,
        selectedWallElementId: null,
      }
    case 'SET_OBJECT_PRESET':
      return { ...state, objectPreset: action.preset }
    case 'SET_SHADOW_CASTER_PRESET':
      return { ...state, shadowCasterPreset: action.preset }
    case 'UNDO':
      return {
        ...state,
        zones: action.snapshot.zones,
        wallElements: action.snapshot.wallElements,
        shadowCasters: action.snapshot.shadowCasters,
        scalePxPerM: action.snapshot.scalePxPerM,
        mapType: action.snapshot.mapType,
        selectedZoneId: null,
        selectedWallElementId: null,
        selectedShadowCasterId: null,
        isDirty: true,
      }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

let zoneCounter = 0
let wallElementCounter = 0
let shadowCasterCounter = 0

export function useEditorState() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state   // always up-to-date without dep-array churn

  // History stack — stored in a ref so writes don't trigger re-renders;
  // historyLength is separate state so canUndo is reactive.
  const historyRef = useRef<Snapshot[]>([])
  const [historyLength, setHistoryLength] = useState(0)

  // Track the last push so we can coalesce rapid UPDATE_ZONE calls during drag.
  // Without coalescing, every mousemove creates a separate undo step.
  const lastPushRef = useRef<{ actionType: string; zoneId?: string; time: number } | null>(null)

  function snapState(s: EditorState): Snapshot {
    return { zones: s.zones, wallElements: s.wallElements, shadowCasters: s.shadowCasters, scalePxPerM: s.scalePxPerM, mapType: s.mapType }
  }

  /** Dispatch wrapper that records the pre-action snapshot for undoable actions. */
  const dispatchWithHistory = useCallback((action: Action) => {
    if (UNDOABLE.has(action.type)) {
      const now = Date.now()
      const last = lastPushRef.current

      // Coalesce drag: if UPDATE_ZONE fires repeatedly on the same zone within
      // 800 ms, collapse all moves into one undo step.
      const coalesce =
        action.type === 'UPDATE_ZONE' &&
        last?.actionType === 'UPDATE_ZONE' &&
        'id' in action && last?.zoneId === (action as { id: string }).id &&
        now - last.time < 800

      if (!coalesce) {
        const snap = snapState(stateRef.current)
        historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), snap]
        setHistoryLength(historyRef.current.length)
        lastPushRef.current = {
          actionType: action.type,
          zoneId: action.type === 'UPDATE_ZONE' ? (action as { id: string }).id : undefined,
          time: now,
        }
      } else if (lastPushRef.current) {
        // Refresh timestamp so coalescing window stays open while dragging
        lastPushRef.current.time = now
      }
    }
    dispatch(action)
  }, []) // stable — reads state through stateRef

  // ── Public callbacks ────────────────────────────────────────────────────────

  const loadCanvasData = useCallback((data: CanvasData) => {
    zoneCounter = data.zones.length
    wallElementCounter = (data.wallElements ?? []).length
    shadowCasterCounter = (data.shadowCasters ?? []).length
    // Clear history on load so you can't undo past a page load
    historyRef.current = []
    setHistoryLength(0)
    lastPushRef.current = null
    dispatch({ type: 'LOAD', data })
  }, [])

  const undo = useCallback(() => {
    const history = historyRef.current
    if (history.length === 0) return
    const snapshot = history[history.length - 1]
    historyRef.current = history.slice(0, -1)
    setHistoryLength(historyRef.current.length)
    lastPushRef.current = null   // reset coalescing after undo
    dispatch({ type: 'UNDO', snapshot })
  }, [])

  const addZone = useCallback(
    (x: number, y: number, width: number, height: number, type: ZoneStyleType) => {
      zoneCounter++
      const zone: EditorZone = {
        id: `zone_${zoneCounter}_${Date.now()}`,
        type,
        shape: 'rect',
        x,
        y,
        width,
        height,
        label: '',
      }
      dispatchWithHistory({ type: 'ADD_ZONE', zone })
    },
    [dispatchWithHistory]
  )

  const updateZone = useCallback((id: string, updates: Partial<EditorZone>) => {
    dispatchWithHistory({ type: 'UPDATE_ZONE', id, updates })
  }, [dispatchWithHistory])

  const deleteZone = useCallback((id: string) => {
    dispatchWithHistory({ type: 'DELETE_ZONE', id })
  }, [dispatchWithHistory])

  const selectZone = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_ZONE', id })
  }, [])

  const setTool = useCallback((tool: EditorTool) => {
    dispatch({ type: 'SET_TOOL', tool })
  }, [])

  const setZoneType = useCallback((zoneType: ZoneStyleType) => {
    dispatch({ type: 'SET_ZONE_TYPE', zoneType })
  }, [])

  const setScalePxPerM = useCallback((pxPerM: number) => {
    dispatchWithHistory({ type: 'SET_SCALE', pxPerM })
  }, [dispatchWithHistory])

  const markClean = useCallback(() => {
    dispatch({ type: 'MARK_CLEAN' })
  }, [])

  const addWallElement = useCallback(
    (
      zoneId: string,
      type: 'door' | 'window',
      edge: WallElement['edge'],
      position: number
    ) => {
      wallElementCounter++
      const element: WallElement = {
        id: `we_${wallElementCounter}_${Date.now()}`,
        type,
        zoneId,
        edge,
        position,
        widthCm: type === 'door' ? DEFAULT_DOOR_WIDTH_CM : DEFAULT_WINDOW_WIDTH_CM,
        ...(type === 'door' && { swingSide: 'left' as const, swingDirection: 'inward' as const }),
      }
      dispatchWithHistory({ type: 'ADD_WALL_ELEMENT', element })
    },
    [dispatchWithHistory]
  )

  const updateWallElement = useCallback(
    (id: string, updates: Partial<WallElement>) => {
      dispatchWithHistory({ type: 'UPDATE_WALL_ELEMENT', id, updates })
    },
    [dispatchWithHistory]
  )

  const deleteWallElement = useCallback((id: string) => {
    dispatchWithHistory({ type: 'DELETE_WALL_ELEMENT', id })
  }, [dispatchWithHistory])

  const selectWallElement = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_WALL_ELEMENT', id })
  }, [])

  const setMapType = useCallback((mapType: MapType) => {
    dispatchWithHistory({ type: 'SET_MAP_TYPE', mapType })
  }, [dispatchWithHistory])

  const addShadowCaster = useCallback((caster: Omit<ShadowCaster, 'id'>) => {
    shadowCasterCounter++
    const id = `sc_${shadowCasterCounter}_${Date.now()}`
    dispatchWithHistory({ type: 'ADD_SHADOW_CASTER', caster: { ...caster, id } as ShadowCaster })
  }, [dispatchWithHistory])

  const updateShadowCaster = useCallback((id: string, updates: Partial<ShadowCaster>) => {
    dispatchWithHistory({ type: 'UPDATE_SHADOW_CASTER', id, updates })
  }, [dispatchWithHistory])

  const deleteShadowCaster = useCallback((id: string) => {
    dispatchWithHistory({ type: 'DELETE_SHADOW_CASTER', id })
  }, [dispatchWithHistory])

  const selectShadowCaster = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_SHADOW_CASTER', id })
  }, [])

  const setObjectPreset = useCallback((preset: ObjectPreset | null) => {
    dispatch({ type: 'SET_TOOL', tool: preset ? 'place_object' : 'select' })
    dispatch({ type: 'SET_OBJECT_PRESET', preset })
  }, [])

  const setShadowCasterPreset = useCallback((preset: 'building' | 'tree') => {
    dispatch({ type: 'SET_SHADOW_CASTER_PRESET', preset })
  }, [])

  const toCanvasData = useCallback((): CanvasData => {
    return {
      zones: state.zones,
      wallElements: state.wallElements,
      shadowCasters: state.shadowCasters,
      scale_px_per_m: state.scalePxPerM,
      canvas_w: 680,
      canvas_h: 680,
      mapType: state.mapType,
    }
  }, [state.zones, state.wallElements, state.shadowCasters, state.scalePxPerM, state.mapType])

  return {
    ...state,
    canUndo: historyLength > 0,
    loadCanvasData,
    undo,
    addZone,
    updateZone,
    deleteZone,
    selectZone,
    setTool,
    setZoneType,
    setScalePxPerM,
    markClean,
    addWallElement,
    updateWallElement,
    deleteWallElement,
    selectWallElement,
    setMapType,
    addShadowCaster,
    updateShadowCaster,
    deleteShadowCaster,
    selectShadowCaster,
    setObjectPreset,
    setShadowCasterPreset,
    toCanvasData,
  }
}

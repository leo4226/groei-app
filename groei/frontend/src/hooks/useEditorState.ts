import { useCallback, useReducer } from 'react'
import type { EditorZone, ZoneStyleType, CanvasData } from '../types'

export type EditorTool = 'select' | 'draw'

interface EditorState {
  zones: EditorZone[]
  selectedZoneId: string | null
  activeTool: EditorTool
  activeZoneType: ZoneStyleType
  isDirty: boolean
  scalePxPerM: number
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

const initialState: EditorState = {
  zones: [],
  selectedZoneId: null,
  activeTool: 'draw',
  activeZoneType: 'deck',
  isDirty: false,
  scalePxPerM: 46,
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        zones: action.data.zones,
        scalePxPerM: action.data.scale_px_per_m,
        isDirty: false,
      }
    case 'ADD_ZONE':
      return {
        ...state,
        zones: [...state.zones, action.zone],
        selectedZoneId: action.zone.id,
        activeTool: 'select',
        isDirty: true,
      }
    case 'UPDATE_ZONE':
      return {
        ...state,
        zones: state.zones.map((z) =>
          z.id === action.id ? { ...z, ...action.updates } : z
        ),
        isDirty: true,
      }
    case 'DELETE_ZONE':
      return {
        ...state,
        zones: state.zones.filter((z) => z.id !== action.id),
        selectedZoneId: state.selectedZoneId === action.id ? null : state.selectedZoneId,
        isDirty: true,
      }
    case 'SELECT_ZONE':
      return { ...state, selectedZoneId: action.id }
    case 'SET_TOOL':
      return {
        ...state,
        activeTool: action.tool,
        selectedZoneId: action.tool === 'draw' ? null : state.selectedZoneId,
      }
    case 'SET_ZONE_TYPE':
      return { ...state, activeZoneType: action.zoneType }
    case 'SET_SCALE':
      return { ...state, scalePxPerM: action.pxPerM, isDirty: true }
    case 'MARK_CLEAN':
      return { ...state, isDirty: false }
  }
}

let zoneCounter = 0

export function useEditorState() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const loadCanvasData = useCallback((data: CanvasData) => {
    zoneCounter = data.zones.length
    dispatch({ type: 'LOAD', data })
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
      dispatch({ type: 'ADD_ZONE', zone })
    },
    []
  )

  const updateZone = useCallback((id: string, updates: Partial<EditorZone>) => {
    dispatch({ type: 'UPDATE_ZONE', id, updates })
  }, [])

  const deleteZone = useCallback((id: string) => {
    dispatch({ type: 'DELETE_ZONE', id })
  }, [])

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
    dispatch({ type: 'SET_SCALE', pxPerM })
  }, [])

  const markClean = useCallback(() => {
    dispatch({ type: 'MARK_CLEAN' })
  }, [])

  const toCanvasData = useCallback((): CanvasData => {
    return {
      zones: state.zones,
      scale_px_per_m: state.scalePxPerM,
      canvas_w: 680,
      canvas_h: 680,
    }
  }, [state.zones, state.scalePxPerM])

  return {
    ...state,
    loadCanvasData,
    addZone,
    updateZone,
    deleteZone,
    selectZone,
    setTool,
    setZoneType,
    setScalePxPerM,
    markClean,
    toCanvasData,
  }
}

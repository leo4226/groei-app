import { useReducer } from 'react'

export interface MapSelection {
  selectedId: string | null       // "plant-3" | "object-7"
  selectedType: 'plant' | 'object' | null
  mode: 'selected' | 'resizing' | 'rotating' | null
  resizeHandle: string | null     // "nw"|"ne"|"sw"|"se"|"n"|"s"|"e"|"w"
}

export type SelectionAction =
  | { type: 'SELECT'; id: string; itemType: 'plant' | 'object' }
  | { type: 'DESELECT' }
  | { type: 'START_RESIZE'; handle: string }
  | { type: 'END_RESIZE' }
  | { type: 'START_ROTATE' }
  | { type: 'END_ROTATE' }

const initialState: MapSelection = {
  selectedId: null,
  selectedType: null,
  mode: null,
  resizeHandle: null,
}

function selectionReducer(state: MapSelection, action: SelectionAction): MapSelection {
  switch (action.type) {
    case 'SELECT':
      return {
        selectedId: action.id,
        selectedType: action.itemType,
        mode: 'selected',
        resizeHandle: null,
      }
    case 'DESELECT':
      return initialState
    case 'START_RESIZE':
      return { ...state, mode: 'resizing', resizeHandle: action.handle }
    case 'END_RESIZE':
      return { ...state, mode: 'selected', resizeHandle: null }
    case 'START_ROTATE':
      return { ...state, mode: 'rotating', resizeHandle: null }
    case 'END_ROTATE':
      return { ...state, mode: 'selected', resizeHandle: null }
  }
}

export function useMapSelection() {
  const [selection, dispatch] = useReducer(selectionReducer, initialState)
  return { selection, dispatch } as const
}

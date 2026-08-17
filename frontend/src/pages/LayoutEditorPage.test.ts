// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageContext'
import LayoutEditorPage from './LayoutEditorPage'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  byId: vi.fn(),
  objectsList: vi.fn(),
  editor: {} as Record<string, unknown>,
  canEdit: true,
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '1' }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('../api/client', () => ({
  maps: { byId: mocks.byId, update: vi.fn() },
  objects: { list: mocks.objectsList },
}))

vi.mock('../hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    me: null,
    canEdit: mocks.canEdit,
    canManageHousehold: false,
    isViewer: !mocks.canEdit,
  }),
}))

// The editor hooks only matter for the write UI; the read-only block screen
// must render before any of their state is consumed.
vi.mock('../hooks/useEditorState', () => ({
  useEditorState: () => mocks.editor,
}))

vi.mock('../hooks/useEditorTour', () => ({
  useEditorTour: () => ({ isActive: false, currentStep: 0, steps: [], start: vi.fn(), next: vi.fn(), skip: vi.fn() }),
  hasTourBeenSeen: () => true,
  markTourSeen: () => {},
}))

vi.mock('../hooks/useIsTouch', () => ({
  useIsTouch: () => false,
}))

describe('LayoutEditorPage — viewer gate', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('floreren_lang', 'en')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    })
    mocks.canEdit = true
    mocks.byId.mockReset()
    mocks.byId.mockResolvedValue({
      id: 1, name: 'Garden', slug: 'garden', svg_file: '', viewbox: '0 0 100 100',
      scale_info: null, sort_order: 0, canvas_data: null, thumbnail_file: null,
      map_type: 'outdoor', lat: null, lon: null, bearing: 0,
    })
    mocks.objectsList.mockReset()
    mocks.objectsList.mockResolvedValue([])
    mocks.editor = {
      mapType: 'outdoor',
      zones: [],
      wallElements: [],
      shadowCasters: [],
      scalePxPerM: 46,
      isDirty: false,
      canUndo: false,
      activeTool: 'select',
      selectedZoneId: null,
      selectedWallElementId: null,
      selectedShadowCasterId: null,
      underlay: null,
      loadCanvasData: vi.fn(),
      setMapTypeSilently: vi.fn(),
    }
    mocks.navigate.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  async function render() {
    await act(async () => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(LayoutEditorPage),
      ))
      await Promise.resolve()
    })
  }

  it('blocks viewers with a read-only screen instead of the editor', async () => {
    mocks.canEdit = false
    await render()
    expect(container.textContent).toContain('Read-only')
    expect(container.textContent).toContain('Layout editing is for editors')
    // No canvas / toolbar / tool dock may render.
    expect(container.querySelector('[data-editor-canvas]')).toBeNull()
    expect(container.textContent).not.toContain('Undo')
    // The way out is offered.
    expect(container.textContent).toContain('Back')
  })
})

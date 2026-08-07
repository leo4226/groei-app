// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useEditorState } from '../useEditorState'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Editor = ReturnType<typeof useEditorState>

let root: Root | null = null

function mountEditor(): () => Editor {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let latest: Editor
  function Probe() {
    latest = useEditorState()
    return null
  }
  root = createRoot(container)
  act(() => { root!.render(createElement(Probe)) })
  return () => latest
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
})

function addZone(editor: () => Editor) {
  act(() => { editor().addZone(10, 10, 100, 80, 'lawn') })
  return editor().zones[0].id
}

describe('selecting an element switches to the select tool', () => {
  it('opens in draw', () => {
    // Regression cover for the editor audit: EditorCanvas gates the resize
    // handles on activeTool === 'select', so if selecting a shape leaves the
    // tool on 'draw' the shape is selected with no way to resize it.
    expect(mountEditor()().activeTool).toBe('draw')
  })

  it('switches to select when a zone is selected', () => {
    const editor = mountEditor()
    const id = addZone(editor)

    // Adding already flips to select — go back to draw to model the real case:
    // reopening a saved map and tapping an existing shape.
    act(() => { editor().setTool('draw') })
    expect(editor().activeTool).toBe('draw')

    act(() => { editor().selectZone(id) })
    expect(editor().activeTool).toBe('select')
    expect(editor().selectedZoneId).toBe(id)
  })

  it('leaves the tool alone when a selection is cleared', () => {
    // Drawing clears the selection on every stroke start; that must not yank
    // the user out of the draw tool.
    const editor = mountEditor()
    act(() => { editor().setTool('draw') })
    act(() => { editor().selectZone(null) })
    expect(editor().activeTool).toBe('draw')
  })

  it('switches to select for shadow casters too', () => {
    const editor = mountEditor()
    act(() => {
      // `Omit<ShadowCaster, 'id'>` collapses the discriminated union to its
      // shared keys, so the rect variant's geometry doesn't type-check through
      // addShadowCaster's parameter. Cast here; the widening is the app's, not
      // this test's, and is out of scope for the editor-loop fix.
      editor().addShadowCaster({
        label: 'Schuur', type: 'rect', x: 5, y: 5, width: 20, height: 20, heightCm: 300,
      } as Parameters<Editor['addShadowCaster']>[0])
    })
    const casterId = editor().shadowCasters[0].id
    act(() => { editor().setTool('draw') })
    act(() => { editor().selectShadowCaster(casterId) })
    expect(editor().activeTool).toBe('select')
  })
})

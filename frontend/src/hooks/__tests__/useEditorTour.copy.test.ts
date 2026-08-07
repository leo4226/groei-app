import { describe, it, expect } from 'vitest'
import { buildSteps } from '../useEditorTour'
import { nl } from '../../i18n/nl'
import { en } from '../../i18n/en'

const bodies = (
  mapType: 'outdoor' | 'indoor',
  tour: typeof nl.editor.tour,
  isTouch: boolean,
) => buildSteps(mapType, tour, isTouch).map((s) => s.body)

describe('editor tour copy follows the pointer type', () => {
  it('does not send a phone user to a sidebar that is not there', () => {
    // F2: the first instruction a new mobile user read was "pick a zone type in
    // the sidebar". On a phone there is no sidebar — the palette is behind a
    // button in the bottom dock.
    const touch = bodies('outdoor', nl.editor.tour, true)[1]
    expect(touch).not.toMatch(/zijbalk/i)
    expect(touch).toMatch(/balk onderaan/i)

    expect(bodies('outdoor', nl.editor.tour, false)[1]).toMatch(/zijbalk/i)
  })

  it('branches the same way in English', () => {
    const touch = bodies('outdoor', en.editor.tour, true)[1]
    expect(touch).not.toMatch(/sidebar/i)
    expect(touch).toMatch(/bottom bar/i)

    expect(bodies('outdoor', en.editor.tour, false)[1]).toMatch(/sidebar/i)
  })

  it('covers the indoor steps too, including tap-vs-click on a wall', () => {
    const touch = bodies('indoor', en.editor.tour, true)
    expect(touch[1]).toMatch(/bottom bar/i)
    expect(touch[2]).toMatch(/^Tap a wall/)

    expect(bodies('indoor', en.editor.tour, false)[2]).toMatch(/^Click on a wall/)
  })

  it('tells people to drag, not click — a click draws nothing', () => {
    // EditorCanvas discards anything under MIN_ZONE_SIZE, so a plain click on
    // the canvas silently produces no zone. Both wordings said "click"/"klik".
    expect(bodies('outdoor', en.editor.tour, false)[1]).toMatch(/drag/i)
    expect(bodies('outdoor', nl.editor.tour, false)[1]).toMatch(/sleep/i)
    expect(bodies('indoor', en.editor.tour, false)[1]).toMatch(/drag/i)
  })

  it('leaves steps that name no control with one wording', () => {
    const touch = bodies('outdoor', en.editor.tour, true)
    const pointer = bodies('outdoor', en.editor.tour, false)
    expect(touch[0]).toBe(pointer[0])
    expect(touch[2]).toBe(pointer[2])
    expect(touch[3]).toBe(pointer[3])
  })

  it('keeps the spotlight targets, which the copy now points at', () => {
    const ids = buildSteps('outdoor', en.editor.tour, true).map((s) => s.tourTargetId)
    expect(ids).toEqual([undefined, 'tool-draw', 'tool-shadow-caster', undefined])
  })
})

import { describe, expect, it } from 'vitest'
import {
  getAssistantPanelConfig,
  canRequestDraft,
  feedbackChatContext,
  careCompletionArgs,
  resolveNavigateHref,
} from './helpAssistantModel'

describe('HelpAssistant mobile model', () => {
  it('uses a compact non-modal pocket dock on mobile by default', () => {
    expect(getAssistantPanelConfig({ isMobile: true, sheetState: 'compact' })).toEqual({
      maxHeight: '42dvh',
      backdrop: 'none',
      pageInteractive: true,
    })
  })

  it('can expand on mobile without becoming the old blocking 85dvh modal', () => {
    expect(getAssistantPanelConfig({ isMobile: true, sheetState: 'expanded' })).toEqual({
      maxHeight: '72dvh',
      backdrop: 'soft',
      pageInteractive: false,
    })
  })

  it('keeps desktop behavior modal-sized so the redesign is mobile-first', () => {
    expect(getAssistantPanelConfig({ isMobile: false, sheetState: 'compact' })).toEqual({
      maxHeight: '85dvh',
      backdrop: 'scrim',
      pageInteractive: false,
    })
  })

})

describe('feedback flow model', () => {
  it('accepts a one-line report — no three-question wizard to clear', () => {
    expect(canRequestDraft('de waterknop doet niks')).toBe(true)
  })

  it('rejects empty or whitespace-only reports', () => {
    expect(canRequestDraft('')).toBe(false)
    expect(canRequestDraft('   \n ')).toBe(false)
  })

  it('rejects a stray single keystroke but allows a genuinely short report', () => {
    expect(canRequestDraft('a')).toBe(false)
    expect(canRequestDraft('bug')).toBe(true)
  })

  it('carries the chat transcript along as report context', () => {
    expect(feedbackChatContext([
      { role: 'user', content: 'waarom is mijn kaart leeg?' },
      { role: 'assistant', content: 'Dat zou niet moeten gebeuren.' },
    ])).toEqual([
      { role: 'user', content: 'waarom is mijn kaart leeg?' },
      { role: 'assistant', content: 'Dat zou niet moeten gebeuren.' },
    ])
  })

  it('drops empty turns and strips anything beyond role/content', () => {
    const withAction = [
      { role: 'assistant' as const, content: 'Doe dit', action: { type: 'navigate' } },
      { role: 'user' as const, content: '   ' },
    ]
    expect(feedbackChatContext(withAction as never)).toEqual([
      { role: 'assistant', content: 'Doe dit' },
    ])
  })

  it('handles an empty chat', () => {
    expect(feedbackChatContext([])).toEqual([])
  })
})

describe('resolveNavigateHref (#410 action buttons)', () => {
  const maps = [{ id: 10, slug: 'balcony' }]

  it('links a plant navigate action to the plant detail page', () => {
    expect(resolveNavigateHref({ target: 'plant', id: 101 }, maps)).toBe('/plants/101')
  })

  it('drops a plant navigate action with no id', () => {
    expect(resolveNavigateHref({ target: 'plant' }, maps)).toBeNull()
  })

  it('links a map navigate action by slug directly', () => {
    expect(resolveNavigateHref({ target: 'map', slug: 'balcony' }, maps)).toBe('/map/balcony')
  })

  it('resolves a map navigate action by id via the store map list', () => {
    expect(resolveNavigateHref({ target: 'map', id: 10 }, maps)).toBe('/map/balcony')
  })

  it('drops a map navigate action whose id is not in the store map list', () => {
    expect(resolveNavigateHref({ target: 'map', id: 999 }, maps)).toBeNull()
  })

  it('links calendar and add_plant navigate actions to their static routes', () => {
    expect(resolveNavigateHref({ target: 'calendar' }, maps)).toBe('/calendar')
    expect(resolveNavigateHref({ target: 'add_plant' }, maps)).toBe('/plants/add')
  })
})

describe('careCompletionArgs (#410 action buttons)', () => {
  it('preserves the validated schedule id for execution', () => {
    expect(careCompletionArgs({
      plant_id: 101,
      care_type: 'water',
      schedule_id: 456,
    })).toEqual({
      plantId: 101,
      careType: 'water',
      scheduleId: 456,
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  bugStepFromAnswerCount,
  getAssistantPanelConfig,
  isBugReportReadyToSubmit,
  bugQuestions,
  resolveNavigateHref,
} from './helpAssistantModel'

const mockChat = {
  bugQuestions: [
    { title: 'Waar was je?', prompt: 'Op welke pagina was je?' },
    { title: 'Wat gebeurde er?', prompt: 'Kreeg je een foutmelding?' },
    { title: 'Wat was de laatste stap?', prompt: 'Bijvoorbeeld: ik tikte op het water-icoontje.' },
  ],
  // minimal stubs for the other required keys
  inputPlaceholder: '', send: '', thinking: '', error: '', unavailable: '',
  empty: '', example: '', bugReport: '', bugReportHeader: '', expand: '', collapse: '',
  next: '', review: '', stepLabel: (c: number, t: number) => `${c}/${t}`,
  reviewTitle: '', reviewHint: '', submit: '', submitting: '', submitted: '', submitError: '',
  actionConfirm: '', actionCancel: '', actionDone: '', actionError: '',
}

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

  it('turns bug reporting into a three-step wizard with a review state', () => {
    expect(bugStepFromAnswerCount(0, mockChat)).toEqual({ current: 1, total: 3, readyToReview: false })
    expect(bugStepFromAnswerCount(2, mockChat)).toEqual({ current: 3, total: 3, readyToReview: false })
    expect(bugStepFromAnswerCount(3, mockChat)).toEqual({ current: 3, total: 3, readyToReview: true })
    expect(isBugReportReadyToSubmit(['page', 'thing broke', 'last tap'], mockChat)).toBe(true)
  })

  it('stores mobile-friendly bug questions without markdown formatting noise', () => {
    const questions = bugQuestions(mockChat)
    expect(questions).toHaveLength(3)
    expect(questions.join('\n')).not.toContain('**')
    expect(questions[0].title).toBe('Waar was je?')
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

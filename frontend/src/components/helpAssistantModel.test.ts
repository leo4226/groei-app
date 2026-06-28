import { describe, expect, it } from 'vitest'
import {
  bugStepFromAnswerCount,
  getAssistantPanelConfig,
  isBugReportReadyToSubmit,
  STEKKIE_BUG_QUESTIONS,
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

  it('turns bug reporting into a three-step wizard with a review state', () => {
    expect(bugStepFromAnswerCount(0)).toEqual({ current: 1, total: 3, readyToReview: false })
    expect(bugStepFromAnswerCount(2)).toEqual({ current: 3, total: 3, readyToReview: false })
    expect(bugStepFromAnswerCount(3)).toEqual({ current: 3, total: 3, readyToReview: true })
    expect(isBugReportReadyToSubmit(['page', 'thing broke', 'last tap'])).toBe(true)
  })

  it('stores mobile-friendly bug questions without markdown formatting noise', () => {
    expect(STEKKIE_BUG_QUESTIONS).toHaveLength(3)
    expect(STEKKIE_BUG_QUESTIONS.join('\n')).not.toContain('**')
    expect(STEKKIE_BUG_QUESTIONS[0].title).toBe('Waar was je?')
  })
})

import type { Translations } from '../i18n/translations'
import type { NavigateActionPayload } from '../api/chat'

export type AssistantSheetState = 'compact' | 'expanded'
export type AssistantBackdrop = 'none' | 'soft' | 'scrim'

export interface AssistantPanelConfig {
  maxHeight: string
  backdrop: AssistantBackdrop
  pageInteractive: boolean
}

export interface BugQuestion {
  title: string
  prompt: string
}

export function bugQuestions(t: Translations['help']['chat']): BugQuestion[] {
  return t.bugQuestions
}

export function getAssistantPanelConfig({
  isMobile,
  sheetState,
}: {
  isMobile: boolean
  sheetState: AssistantSheetState
}): AssistantPanelConfig {
  if (!isMobile) {
    return {
      maxHeight: '85dvh',
      backdrop: 'scrim',
      pageInteractive: false,
    }
  }

  if (sheetState === 'expanded') {
    return {
      maxHeight: '72dvh',
      backdrop: 'soft',
      pageInteractive: false,
    }
  }

  return {
    maxHeight: '42dvh',
    backdrop: 'none',
    pageInteractive: true,
  }
}

export function bugStepFromAnswerCount(answerCount: number, t: Translations['help']['chat']) {
  const total = bugQuestions(t).length
  const readyToReview = answerCount >= total
  return {
    current: readyToReview ? total : Math.min(answerCount + 1, total),
    total,
    readyToReview,
  }
}

export function isBugReportReadyToSubmit(answers: string[], t: Translations['help']['chat']) {
  return answers.filter(answer => answer.trim().length > 0).length >= bugQuestions(t).length
}

/** Resolves a validated navigate action (see #410) to an in-app route, or
 * null if it can't be resolved (e.g. a map id with no matching slug). Maps
 * may arrive by slug or by id — the store's map list backfills the slug. */
export function resolveNavigateHref(
  payload: NavigateActionPayload,
  maps: { id: number; slug: string }[],
): string | null {
  switch (payload.target) {
    case 'plant':
      return payload.id != null ? `/plants/${payload.id}` : null
    case 'map': {
      if (payload.slug) return `/map/${payload.slug}`
      const map = maps.find((m) => m.id === payload.id)
      return map ? `/map/${map.slug}` : null
    }
    case 'calendar':
      return '/calendar'
    case 'add_plant':
      return '/plants/add'
    default:
      return null
  }
}

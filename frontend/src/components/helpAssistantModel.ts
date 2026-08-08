import type { ChatMessage, MarkCareDoneActionPayload, NavigateActionPayload } from '../api/chat'

export type AssistantSheetState = 'compact' | 'expanded'
export type AssistantBackdrop = 'none' | 'soft' | 'scrim'

export interface AssistantPanelConfig {
  maxHeight: string
  backdrop: AssistantBackdrop
  pageInteractive: boolean
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

/** Feedback flow: one free-text box → Stekkie drafts an issue → user confirms.
 * Replaces the old three-question bug wizard, which forced three paragraphs
 * out of anyone reporting "the water button does nothing". */
export type FeedbackStep = 'compose' | 'preview' | 'done'

/** A report needs a couple of real characters — enough to stop an accidental
 * one-key submit, loose enough never to nag someone with a short, clear bug. */
export const MIN_REPORT_LENGTH = 3

export function canRequestDraft(report: string): boolean {
  return report.trim().length >= MIN_REPORT_LENGTH
}

/** Strip the chat down to what the report needs: plain role/content pairs,
 * no attached suggested-actions, no UI-only placeholder turns. */
export function feedbackChatContext(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.content.trim().length > 0)
    .map(({ role, content }) => ({ role, content }))
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

export function careCompletionArgs(payload: MarkCareDoneActionPayload) {
  return {
    plantId: payload.plant_id,
    careType: payload.care_type,
    scheduleId: payload.schedule_id,
  }
}

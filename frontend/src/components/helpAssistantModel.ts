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

export const STEKKIE_BUG_QUESTIONS: BugQuestion[] = [
  {
    title: 'Waar was je?',
    prompt: 'Op welke pagina was je en wat probeerde je te doen?',
  },
  {
    title: 'Wat gebeurde er?',
    prompt: 'Kreeg je een foutmelding, gebeurde er niks, werd de pagina wit, of zag je iets anders dan verwacht?',
  },
  {
    title: 'Wat was de laatste stap?',
    prompt: 'Bijvoorbeeld: ik tikte op het water-icoontje, of ik opende de plantenlijst.',
  },
]

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

export function bugStepFromAnswerCount(answerCount: number) {
  const total = STEKKIE_BUG_QUESTIONS.length
  const readyToReview = answerCount >= total
  return {
    current: readyToReview ? total : Math.min(answerCount + 1, total),
    total,
    readyToReview,
  }
}

export function isBugReportReadyToSubmit(answers: string[]) {
  return answers.filter(answer => answer.trim().length > 0).length >= STEKKIE_BUG_QUESTIONS.length
}

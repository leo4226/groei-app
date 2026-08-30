import { apiRequest } from './client'

/**
 * Spaced-repetition learning over the field guide and your own plants.
 *
 * Separate from the party game on purpose: the hunt avoids repeating a plant,
 * and learning depends on exactly that repetition.
 */

export interface StudyStats {
  total: number
  due: number
  new: number
  learned: number
}

export interface StudyCard {
  card_id: number
  photo_url: string | null
  box: number
  /** `choose` while the card is new, `type` once it has been practised. */
  mode: 'choose' | 'type'
  /** Present only in `choose` mode — in `type` mode the server withholds them
   *  rather than trusting the page to hide the answer. */
  options: string[] | null
}

export interface StudyNext {
  card: StudyCard | null
  /** `no_material` (nothing photographed yet) or `all_caught_up`. */
  reason?: 'no_material' | 'all_caught_up'
  next_due_at?: string | null
  stats: StudyStats
}

export interface StudyResult {
  correct: boolean
  box: number
  next_due_at: string
  /** Always returned, right or wrong — the moment after answering is when the
   *  name is worth reading. */
  answer: { name_nl: string; name_en: string | null; latin: string | null }
}

export const studyApi = {
  next: () => apiRequest<StudyNext>('GET', '/study/next'),
  stats: () => apiRequest<StudyStats>('GET', '/study/stats'),
  answer: (cardId: number, answer: string) =>
    apiRequest<StudyResult>('POST', '/study/answer', {
      body: { card_id: cardId, answer },
    }),
}

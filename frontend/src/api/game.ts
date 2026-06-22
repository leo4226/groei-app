import { apiRequest } from './client'

export interface GamePlayer {
  id: number
  account_id: number
  player_name: string
  score: number
  answered_current_round: boolean
}

export interface GameClue {
  round_index: number
  plant_name_nl: string
  plant_name_en: string | null
  clue_photo_url: string | null
  clue_hint_nl: string | null
  clue_hint_en: string | null
}

export interface GameSession {
  id: number
  join_code: string
  status: 'waiting' | 'active' | 'finished'
  current_round: number
  total_rounds: number
  map_name: string
  map_slug: string
  host_account_id: number
  host_name: string
  clue_mode: 'photo' | 'name'
}

export interface MyAnswer {
  is_correct: boolean
  points_awarded: number
  answered_at: string
}

export interface GameState {
  session: GameSession
  players: GamePlayer[]
  current_clue: GameClue | null
  rounds: GameClue[]
  my_answer: MyAnswer | null
}

export interface AnswerResult {
  is_correct: boolean
  points_awarded: number
}

export const gameApi = {
  create: (map_id: number, plant_ids: number[], clue_mode: 'photo' | 'name' = 'photo') =>
    apiRequest<{ join_code: string }>('POST', '/games', { body: { map_id, plant_ids, clue_mode } }),

  getState: (code: string) =>
    apiRequest<GameState>('GET', `/games/${code}`),

  join: (code: string) =>
    apiRequest<GameState>('POST', `/games/${code}/join`),

  start: (code: string) =>
    apiRequest<GameState>('POST', `/games/${code}/start`),

  next: (code: string) =>
    apiRequest<GameState>('POST', `/games/${code}/next`),

  answer: (
    code: string,
    scanned_species: string,
    candidates: string[] = [],
    confidence = 0,
    image_data_url?: string,
  ) =>
    apiRequest<AnswerResult>('POST', `/games/${code}/answer`, {
      body: { scanned_species, candidates, confidence, image_data_url },
    }),

  delete: (code: string) =>
    apiRequest<void>('DELETE', `/games/${code}`),
}

const BASE = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * The game speaks its own dialect of the API client.
 *
 * Party guests hold a session-scoped guest token, not a Floreren account token,
 * so game requests can't go through `apiRequest`: that helper treats any 401 as
 * an expired login and hard-redirects to `/login`, which would throw a guest out
 * of the game mid-round. Here a 401 is just an error the caller handles.
 */

const GUEST_TOKEN_KEY = 'floreren-game-guest'

interface StoredGuest {
  code: string
  token: string
  player_id: number
  name: string
}

/** The guest identity for `code`, if this browser holds one. */
export function getGuest(code?: string): StoredGuest | null {
  try {
    const raw = sessionStorage.getItem(GUEST_TOKEN_KEY)
    if (!raw) return null
    const guest = JSON.parse(raw) as StoredGuest
    if (code && guest.code.toUpperCase() !== code.toUpperCase()) return null
    return guest
  } catch {
    return null
  }
}

export function saveGuest(guest: StoredGuest): void {
  sessionStorage.setItem(GUEST_TOKEN_KEY, JSON.stringify(guest))
}

export function clearGuest(): void {
  sessionStorage.removeItem(GUEST_TOKEN_KEY)
}

/** Guest token for this game if we have one, otherwise the account token. */
function gameAuthHeaders(code?: string): Record<string, string> {
  const guest = getGuest(code)
  if (guest) return { Authorization: `Bearer ${guest.token}` }
  const token = localStorage.getItem('floreren-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function gameFetch<T>(
  method: string,
  path: string,
  options: { body?: unknown; form?: FormData; code?: string; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> =
    options.auth === false ? {} : gameAuthHeaders(options.code)

  const init: RequestInit = { method, headers }
  if (options.form) {
    init.body = options.form
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  const res = await fetch(BASE + path, init)
  if (!res.ok) {
    let msg = `Failed: ${method} ${path}`
    try {
      const body = await res.json()
      if (body.detail) {
        msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
      }
    } catch { /* keep fallback */ }
    // Status, not message text — the backend localises its details.
    throw Object.assign(new Error(msg), { status: res.status })
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface GamePlayer {
  id: number
  account_id: number | null
  player_name: string
  score: number
  is_guest: boolean
  answered_current_round: boolean
}

export interface GameClue {
  round_index: number
  plant_name_nl: string
  plant_name_en: string | null
  clue_photo_url: string | null
  clue_hint_nl: string | null
  clue_hint_en: string | null
  map_id: number | null
  map_name: string | null
  map_type: 'outdoor' | 'indoor' | null
}

export interface GameMap {
  id: number
  name: string
  slug: string
  map_type: 'outdoor' | 'indoor'
}

export interface GameSession {
  id: number
  join_code: string
  status: 'waiting' | 'active' | 'finished'
  current_round: number
  total_rounds: number
  map_name: string
  map_slug: string
  maps: GameMap[]
  host_account_id: number
  host_name: string
  clue_mode: 'photo' | 'name' | 'logbook'
  pacing: 'host' | 'race'
  round_seconds: number | null
  /** Server-computed countdown for race rounds; null in host-paced games. */
  seconds_remaining: number | null
}

export interface MyAnswer {
  is_correct: boolean
  points_awarded: number
  answered_at: string
  finish_rank: number | null
}

export interface RoundStat {
  round_index: number
  plant_name_nl: string
  plant_name_en: string | null
  answered_count: number
  avg_seconds: number | null
  /**
   * How the correct answers were accepted, keyed by match kind
   * (photo / exact / exact_below_threshold / common / genus / unknown).
   * Null for anyone who is not the host — the server withholds it.
   */
  match_kinds: Record<string, number> | null
}

export interface GameState {
  session: GameSession
  players: GamePlayer[]
  current_clue: GameClue | null
  rounds: GameClue[]
  my_answer: MyAnswer | null
  my_player_id: number | null
  is_host: boolean
  round_stats: RoundStat[] | null
}

export interface AnswerResult {
  is_correct: boolean
  points_awarded: number
  finish_rank: number | null
  /** How the answer was accepted: exact / genus / common / photo. */
  match_kind: string | null
  candidates?: string[]
}

export interface GamePreview {
  status: 'waiting' | 'active' | 'finished'
  map_name: string
  host_name: string
  player_count: number
}

export interface GuestJoinResult {
  guest_token: string
  player_id: number
  state: GameState
}

export interface GameCreateOptions {
  mapIds: number[]
  plantIds: number[]
  clueMode: 'photo' | 'name' | 'logbook'
  pacing: 'host' | 'race'
  roundSeconds?: number
  roundCount?: number
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const gameApi = {
  create: (opts: GameCreateOptions) =>
    gameFetch<{ join_code: string }>('POST', '/games', {
      body: {
        map_ids: opts.mapIds,
        plant_ids: opts.plantIds,
        clue_mode: opts.clueMode,
        pacing: opts.pacing,
        round_seconds: opts.roundSeconds ?? null,
        round_count: opts.roundCount ?? null,
      },
    }),

  /**
   * Which plants on these maps have stored photo embeddings, and so can be
   * graded on their own photographs rather than on a species-name guess.
   */
  plantReadiness: (mapIds: number[]) =>
    gameFetch<{ ready_plant_ids: number[]; total: number }>(
      'GET', `/games/plant-readiness?map_ids=${mapIds.join(',')}`,
    ),

  /** Unauthenticated peek, so the join screen can name the game before signup. */
  preview: (code: string) =>
    gameFetch<GamePreview>('GET', `/games/${code}/preview`, { auth: false }),

  getState: (code: string) => gameFetch<GameState>('GET', `/games/${code}`, { code }),

  join: (code: string) => gameFetch<GameState>('POST', `/games/${code}/join`, { code }),

  joinAsGuest: (code: string, name: string) =>
    gameFetch<GuestJoinResult>('POST', `/games/${code}/join-guest`, {
      body: { name },
      auth: false,
    }),

  start: (code: string) => gameFetch<GameState>('POST', `/games/${code}/start`, { code }),

  next: (code: string) => gameFetch<GameState>('POST', `/games/${code}/next`, { code }),

  /** Host override for a guest the identifier refuses to satisfy. */
  award: (code: string, playerId: number) =>
    gameFetch<AnswerResult>('POST', `/games/${code}/players/${playerId}/award`, { code }),

  /** Identify + grade in one call — the path guests use to scan. */
  scan: (code: string, blob: Blob, lang: 'nl' | 'en') => {
    const form = new FormData()
    form.append('image', blob, 'scan.jpg')
    return gameFetch<AnswerResult>('POST', `/games/${code}/scan?lang=${lang}`, {
      form,
      code,
    })
  },

  /** Grade a name the client already has (logbook quiz taps). */
  answer: (code: string, scanned_species: string, candidates: string[] = []) =>
    gameFetch<AnswerResult>('POST', `/games/${code}/answer`, {
      body: { scanned_species, candidates, confidence: 0 },
      code,
    }),

  delete: (code: string) => gameFetch<void>('DELETE', `/games/${code}`, { code }),
}

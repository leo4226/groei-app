import { getToken } from './auth'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PageContext {
  route: string
  map_slug?: string
  plant_id?: number
  selected_plant_id?: number
  selected_object_id?: number
  clicked_map_x?: number
  clicked_map_y?: number
  ground_zone_id?: string
  ground_zone_name?: string
  ground_zone_type?: string
  light_bucket?: 'full' | 'part' | 'bright_shade' | 'deep_shade'
  direct_sun_hours?: number
  sky_view_factor?: number
}

/**
 * Thrown when the /chat request gets a non-OK HTTP response. Carries the
 * status so callers can distinguish a worker-offline failure (the backend
 * proxy returns 502/503/504 when the Stekkie worker is unreachable or times
 * out) from a generic error.
 */
export class ChatRequestError extends Error {
  status: number
  constructor(status: number) {
    super(`Chat error: ${status}`)
    this.name = 'ChatRequestError'
    this.status = status
  }
}

// See issue #410. The backend already validated this against the caller's
// household before sending it — ids are real, but this file still never
// executes anything just because the worker suggested it; the confirm
// button in HelpAssistant.tsx always calls the normal authenticated
// endpoints (via the useFloreren store) to actually perform the action.
export interface NavigateActionPayload {
  target: 'plant' | 'map' | 'calendar' | 'add_plant'
  id?: number
  slug?: string
}

export interface MarkCareDoneActionPayload {
  plant_id: number
  schedule_id: number
  care_type: string
}

export type StekkieAction =
  | { type: 'navigate'; label: string; requires_confirmation: boolean; payload: NavigateActionPayload }
  | { type: 'mark_care_done'; label: string; requires_confirmation: boolean; payload: MarkCareDoneActionPayload }

export interface ChatReply {
  response: string
  suggestedAction: StekkieAction | null
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  pageContext?: PageContext,
  options?: { activeUserId?: number | null; language?: 'nl' | 'en' },
): Promise<ChatReply> {
  const token = getToken()
  const resp = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      history: history.map(({ role, content }) => ({ role, content })),
      page_context: pageContext ?? null,
      active_user_id: options?.activeUserId ?? null,
      language: options?.language ?? null,
    }),
  })
  if (!resp.ok) throw new ChatRequestError(resp.status)
  const data = await resp.json()
  return { response: data.response, suggestedAction: data.suggested_action ?? null }
}

export interface BugReportResponse {
  success: boolean
  issue_url: string | null
  issue_number: number | null
  error: string | null
}

export interface BugReportDeviceInfo {
  user_agent: string
  screen_size: string
}

export async function submitBugReport(
  conversation: ChatMessage[],
  page: string,
  device?: BugReportDeviceInfo,
): Promise<BugReportResponse> {
  const token = getToken()
  const resp = await fetch(`${BASE}/bug-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      conversation,
      page,
      device: device ?? { user_agent: navigator.userAgent, screen_size: `${window.innerWidth}x${window.innerHeight}` },
    }),
  })
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }))
    throw new Error(errBody.detail ?? `Bug report error: ${resp.status}`)
  }
  return resp.json()
}

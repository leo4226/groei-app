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
  kind: FeedbackKind | null
}

export interface BugReportDeviceInfo {
  user_agent: string
  screen_size: string
}

export type FeedbackKind = 'bug' | 'feature'

/** What Stekkie made of the user's free-text report, shown for confirmation
 * before anything is filed. `composed_by` is 'fallback' when the LLM was
 * unavailable and the report is being filed as written. */
export interface FeedbackDraft {
  kind: FeedbackKind
  title: string
  body: string
  difficulty: string | null
  composed_by: 'llm' | 'fallback'
}

interface FeedbackPayload {
  report: string
  page: string
  conversation: ChatMessage[]
  device: BugReportDeviceInfo
}

function feedbackPayload(
  report: string,
  conversation: ChatMessage[],
  device?: BugReportDeviceInfo,
): FeedbackPayload {
  return {
    report,
    page: window.location.pathname,
    conversation,
    device: device ?? {
      user_agent: navigator.userAgent,
      screen_size: `${window.innerWidth}x${window.innerHeight}`,
    },
  }
}

async function postFeedback<T>(path: string, body: unknown): Promise<T> {
  const token = getToken()
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new ChatRequestError(resp.status)
  return resp.json()
}

/** Ask the backend to turn a free-text report into a titled, classified issue
 * draft. Side-effect free — nothing is filed until submitFeedback(). */
export async function draftFeedback(
  report: string,
  conversation: ChatMessage[] = [],
  device?: BugReportDeviceInfo,
): Promise<FeedbackDraft> {
  return postFeedback<FeedbackDraft>(
    '/bug-report/draft',
    feedbackPayload(report, conversation, device),
  )
}

/** File the confirmed draft as a GitHub issue. The server re-derives labels
 * from `kind`, so only the kind the user actually saw can take effect. */
export async function submitFeedback(
  report: string,
  draft: FeedbackDraft,
  conversation: ChatMessage[] = [],
  device?: BugReportDeviceInfo,
): Promise<BugReportResponse> {
  return postFeedback<BugReportResponse>('/bug-report', {
    ...feedbackPayload(report, conversation, device),
    kind: draft.kind,
    title: draft.title,
    body: draft.body,
    difficulty: draft.difficulty,
    // So the filed issue says who actually wrote the text — the preview
    // already told the user whether the AI was available.
    composed_by: draft.composed_by,
  })
}

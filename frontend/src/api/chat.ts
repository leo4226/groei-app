import { getToken } from './auth'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<string> {
  const token = getToken()
  const resp = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history }),
  })
  if (!resp.ok) throw new Error(`Chat error: ${resp.status}`)
  const data = await resp.json()
  return data.response
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

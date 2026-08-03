import { withNetworkRetry } from './retry'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

/**
 * POST helper for the unauthenticated endpoints.
 *
 * These are the FIRST requests a visitor makes, so they are the ones most
 * likely to hit a cold-started backend — yet they were the only calls in the
 * app not wrapped in the client's network retry (see api/client.ts), which is
 * why a sleeping Fly machine showed up as a login error and nowhere else.
 */
/** Long enough for a Fly boot plus a Neon wake, short enough that a genuinely
 *  dead connection can't hold the submit button hostage. */
const PUBLIC_POST_TIMEOUT_MS = 20000

async function postPublic<T>(path: string, body: unknown, fallbackError: string): Promise<T> {
  // Only one retry here, unlike the rest of the client: a person is watching
  // this button, and a hung connection that fails slowly would otherwise spin
  // for the browser's timeout times three.
  return withNetworkRetry(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PUBLIC_POST_TIMEOUT_MS)
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        // Carry the status so callers can branch on it instead of matching
        // (language-dependent) message text.
        throw Object.assign(new Error(detail.detail ?? fallbackError), { status: res.status })
      }
      return res.json() as Promise<T>
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new Error(fallbackError)
      throw e
    } finally {
      clearTimeout(timeout)
    }
  }, 1)
}

/**
 * Wake the backend without waiting for it. Fly stops the machine when idle
 * (`min_machines_running = 0`), so the first request after a quiet spell pays
 * for a boot — and on Neon's free tier, a database wake on top of it. Firing
 * this when a pre-auth page mounts means the machine is warming while the
 * visitor reads or types, instead of during their login submit.
 *
 * Fire-and-forget by design: /health lives at the API root rather than under
 * /api, and in dev the Vite proxy only forwards /api, so a miss here is
 * expected and must never surface to the user.
 */
export function healthUrlFor(base: string): string | null {
  const origin = base.replace(/\/api\/?$/, '')
  // A relative base means the dev proxy, which only forwards /api — and a local
  // backend has no cold start to hide. Nothing to warm.
  if (!origin || origin.startsWith('/')) return null
  return `${origin}/health`
}

export function warmBackend(): void {
  const url = healthUrlFor(BASE)
  if (!url) return
  void fetch(url, { method: 'GET', mode: 'cors' }).catch(() => {})
}

export interface AuthResponse {
  token: string
  account_id: number
  household_id: number
  name: string
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return postPublic<AuthResponse>('/auth/login', { email, password }, 'Login failed')
}

export async function register(
  email: string,
  password: string,
  name: string,
  householdName: string,
  language: 'nl' | 'en' = 'nl',
): Promise<AuthResponse> {
  return postPublic<AuthResponse>(
    '/auth/register',
    { email, password, name, household_name: householdName, language },
    'Registration failed',
  )
}

export function getToken(): string | null {
  return localStorage.getItem('floreren-token')
}

export function saveToken(token: string): void {
  localStorage.setItem('floreren-token', token)
}

export function clearToken(): void {
  localStorage.removeItem('floreren-token')
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return postPublic<{ message: string }>('/auth/forgot-password', { email }, 'Request failed')
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return postPublic<{ message: string }>(
    '/auth/reset-password',
    { token, new_password: newPassword },
    'Reset failed',
  )
}

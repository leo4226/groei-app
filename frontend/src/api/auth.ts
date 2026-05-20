const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface AuthResponse {
  token: string
  account_id: number
  household_id: number
  name: string
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Login failed')
  }
  return res.json()
}

export async function register(
  email: string,
  password: string,
  name: string,
  householdName: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, household_name: householdName }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Registration failed')
  }
  return res.json()
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

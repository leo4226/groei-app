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
  language: 'nl' | 'en' = 'nl',
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, household_name: householdName, language }),
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

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Reset failed')
  }
  return res.json()
}

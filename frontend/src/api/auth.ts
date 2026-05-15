     1|const BASE = '/api'
     2|
     3|export interface AuthResponse {
     4|  token: string
     5|  account_id: number
     6|  household_id: number
     7|  name: string
     8|}
     9|
    10|export async function login(email: string, password: string): Promise<AuthResponse> {
    11|  const res = await fetch(`${BASE}/auth/login`, {
    12|    method: 'POST',
    13|    headers: { 'Content-Type': 'application/json' },
    14|    body: JSON.stringify({ email, password }),
    15|  })
    16|  if (!res.ok) {
    17|    const body = await res.json().catch(() => ({}))
    18|    throw new Error(body.detail ?? 'Login failed')
    19|  }
    20|  return res.json()
    21|}
    22|
    23|export async function register(
    24|  email: string,
    25|  password: string,
    26|  name: string,
    27|  householdName: string,
    28|): Promise<AuthResponse> {
    29|  const res = await fetch(`${BASE}/auth/register`, {
    30|    method: 'POST',
    31|    headers: { 'Content-Type': 'application/json' },
    32|    body: JSON.stringify({ email, password, name, household_name: householdName }),
    33|  })
    34|  if (!res.ok) {
    35|    const body = await res.json().catch(() => ({}))
    36|    throw new Error(body.detail ?? 'Registration failed')
    37|  }
    38|  return res.json()
    39|}
    40|
    41|export function getToken(): string | null {
    42|  return localStorage.getItem('floreren-token')
    43|}
    44|
    45|export function saveToken(token: string): void {
    46|  localStorage.setItem('floreren-token', token)
    47|}
    48|
    49|export function clearToken(): void {
    50|  localStorage.removeItem('floreren-token')
    51|}
    52|
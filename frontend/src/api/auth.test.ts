import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { healthUrlFor, login, warmBackend } from './auth'

// A cold-started Fly machine makes fetch reject with a TypeError before any
// response exists — the browser then reports it as "NetworkError" or even
// "CORS request did not succeed" with a null status. These calls were the only
// ones in the app without the client's retry, which is why a sleeping backend
// surfaced as a login failure and nowhere else.
describe('auth requests survive a cold-started backend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries a transient network failure and returns the eventual success', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('NetworkError when attempting to fetch resource.'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: 't', account_id: 1, household_id: 1, name: 'Leon' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const pending = login('leon@example.com', 'pw')
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ token: 't', name: 'Leon' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after one retry so the submit button cannot spin forever', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('NetworkError'))
    vi.stubGlobal('fetch', fetchMock)

    const pending = login('leon@example.com', 'pw').catch((e) => e)
    await vi.runAllTimersAsync()
    await pending

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a real credential rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid email or password' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const pending = login('leon@example.com', 'wrong').catch((e) => e)
    await vi.runAllTimersAsync()
    const error = await pending

    // A 401 is an answer, not a transport failure: one attempt, status carried
    // so callers branch on it rather than on (translated) message text.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error & { status?: number }).status).toBe(401)
  })

  it('warms the API root, never the /api router prefix', () => {
    // /health is mounted at the app root in backend/main.py; /api/health 404s.
    expect(healthUrlFor('https://api.floreren.app/api')).toBe('https://api.floreren.app/health')
    expect(healthUrlFor('https://api.floreren.app/api/')).toBe('https://api.floreren.app/health')
  })

  it('skips warming when the base is the dev proxy', () => {
    // The Vite proxy only forwards /api, and a local backend never sleeps.
    expect(healthUrlFor('/api')).toBeNull()
  })

  it('never lets a failed warm-up surface to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    expect(() => warmBackend()).not.toThrow()
    await vi.runAllTimersAsync()
  })
})

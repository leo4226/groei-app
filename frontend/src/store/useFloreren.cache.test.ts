// @vitest-environment jsdom
//
// Instant start-up: a cached copy is drawn at once and refreshed quietly,
// never behind the loading state.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  listUsers: vi.fn(),
  locations: vi.fn(),
  listMaps: vi.fn(),
  listPlants: vi.fn(),
}))

vi.mock('../api/client', () => ({
  auth: { me: mocks.me },
  users: { list: mocks.listUsers, locations: mocks.locations, setLanguage: vi.fn() },
  plants: { list: mocks.listPlants },
  care: { householdLog: vi.fn() },
  maps: { list: mocks.listMaps },
  icons: { sync: vi.fn() },
  weatherWarnings: { acknowledge: vi.fn(), restore: vi.fn() },
}))

const token = `h.${btoa(JSON.stringify({ sub: '1', household_id: 1 }))}.s`
const me = {
  id: 1, household_id: 1, email: 'a@example.com', name: 'Leon', avatar: null, is_admin: false,
  household_name: 'Huis', role: 'owner' as const,
  capabilities: { can_edit: true, can_manage_household: true },
}
const cachedPlant = { id: 7, name: 'Monstera (cached)' }
const freshPlant = { id: 7, name: 'Monstera' }

async function freshStore() {
  vi.resetModules()
  return (await import('./useFloreren')).useFloreren
}

describe('useFloreren — device cache', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    mocks.me.mockResolvedValue(me)
    mocks.listUsers.mockResolvedValue([{ id: 3, name: 'Leon', account_id: 1 }])
    mocks.locations.mockResolvedValue([])
    mocks.listMaps.mockResolvedValue([])
    mocks.listPlants.mockResolvedValue([freshPlant])
  })

  it('starts empty and unloaded without a cache', async () => {
    localStorage.setItem('floreren-token', token)
    const store = await freshStore()
    expect(store.getState().hasLoaded).toBe(false)
    expect(store.getState().plants).toEqual([])
  })

  it('draws the cached copy at once, then refreshes it without the loading state', async () => {
    localStorage.setItem('floreren-token', token)
    localStorage.setItem('floreren-cache:1:1-1:boot', JSON.stringify({
      me, users: [{ id: 3, name: 'Leon', account_id: 1 }], locations: [], maps: [], plants: [cachedPlant],
    }))
    const store = await freshStore()

    expect(store.getState().hasLoaded).toBe(true)
    expect(store.getState().isStale).toBe(true)
    expect(store.getState().plants).toEqual([cachedPlant])
    expect(store.getState().activeUserId).toBe(3)

    const loading = store.getState().load({ quiet: true })
    expect(store.getState().isLoading).toBe(false)
    await loading

    expect(store.getState().plants).toEqual([freshPlant])
    expect(store.getState().isStale).toBe(false)
  })

  it('ignores a cache that belongs to another account', async () => {
    localStorage.setItem('floreren-token', token)
    localStorage.setItem('floreren-cache:1:2-1:boot', JSON.stringify({
      me, users: [], locations: [], maps: [], plants: [cachedPlant],
    }))
    const store = await freshStore()
    expect(store.getState().hasLoaded).toBe(false)
    expect(store.getState().plants).toEqual([])
  })

  it('sends one set of requests when several callers load at once', async () => {
    localStorage.setItem('floreren-token', token)
    const store = await freshStore()
    await Promise.all([store.getState().load(), store.getState().load({ quiet: true })])
    expect(mocks.listPlants).toHaveBeenCalledTimes(1)
    expect(mocks.me).toHaveBeenCalledTimes(1)
  })

  it('saves what it loaded for next time, and forgets it for a new session', async () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem('floreren-token', token)
      const store = await freshStore()
      await store.getState().load()
      await vi.advanceTimersByTimeAsync(500)
      const saved = JSON.parse(localStorage.getItem('floreren-cache:1:1-1:boot') ?? 'null')
      expect(saved?.plants).toEqual([freshPlant])

      store.getState().resetForNewSession()
      await vi.advanceTimersByTimeAsync(500)
      expect(localStorage.getItem('floreren-cache:1:1-1:boot')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

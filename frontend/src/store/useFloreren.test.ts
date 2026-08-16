// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  listUsers: vi.fn(),
  locations: vi.fn(),
  listMaps: vi.fn(),
  listPlants: vi.fn(),
  householdLog: vi.fn(),
  warningSummary: vi.fn(),
}))

vi.mock('../api/client', () => ({
  auth: { me: mocks.me },
  users: { list: mocks.listUsers, locations: mocks.locations, setLanguage: vi.fn() },
  plants: { list: mocks.listPlants, warningSummary: mocks.warningSummary },
  care: { householdLog: mocks.householdLog },
  maps: { list: mocks.listMaps },
  icons: { sync: vi.fn() },
  weatherWarnings: { acknowledge: vi.fn(), restore: vi.fn() },
}))

import { useFloreren } from './useFloreren'

const ownerMe = {
  id: 1,
  household_id: 1,
  email: 'a@example.com',
  name: 'A',
  avatar: null,
  is_admin: false,
  household_name: 'House',
  role: 'owner' as const,
  capabilities: { can_edit: true, can_manage_household: true },
}

describe('useFloreren — signed-in account (me)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.me.mockResolvedValue(ownerMe)
    mocks.listUsers.mockResolvedValue([])
    mocks.locations.mockResolvedValue([])
    mocks.listMaps.mockResolvedValue([])
    mocks.listPlants.mockResolvedValue([])
    mocks.householdLog.mockResolvedValue([])
    mocks.warningSummary.mockResolvedValue(null)
    localStorage.clear()
    useFloreren.setState({ me: null })
  })

  it('starts with me === null', () => {
    expect(useFloreren.getState().me).toBeNull()
  })

  it('load() seeds me from auth.me alongside the shared data', async () => {
    await useFloreren.getState().load()
    expect(mocks.me).toHaveBeenCalledTimes(1)
    expect(useFloreren.getState().me).toEqual(ownerMe)
    expect(useFloreren.getState().hasLoaded).toBe(true)
  })

  it('resetForNewSession() clears me so a new account does not inherit capabilities', () => {
    useFloreren.setState({ me: ownerMe })
    useFloreren.getState().resetForNewSession()
    expect(useFloreren.getState().me).toBeNull()
  })

  it('refreshAll() quietly re-fetches me', async () => {
    await useFloreren.getState().refreshAll()
    expect(mocks.me).toHaveBeenCalled()
    expect(useFloreren.getState().me).toEqual(ownerMe)
  })

  it('a failed auth.me during load() leaves me null', async () => {
    mocks.me.mockRejectedValue(new Error('401'))
    await useFloreren.getState().load()
    expect(useFloreren.getState().me).toBeNull()
  })
})

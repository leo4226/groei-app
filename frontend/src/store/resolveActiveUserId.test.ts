import { describe, expect, it } from 'vitest'
import type { User } from '../types'
import { resolveActiveUserId } from './useFloreren'

const users: User[] = [
  { id: 1, name: 'Leon', avatar: null, language: 'nl', account_id: 10 },
  { id: 2, name: 'Lisbeth', avatar: null, language: 'en', account_id: 20 },
]

describe('resolveActiveUserId', () => {
  it("picks the signed-in account's own profile, not the household's first", () => {
    expect(resolveActiveUserId(users, { id: 20 }, null)).toBe(2)
  })

  it('ignores a saved profile that belongs to someone else', () => {
    // Leon used this device before; Lisbeth is signed in now.
    expect(resolveActiveUserId(users, { id: 20 }, 1)).toBe(2)
  })

  it('falls back to a valid saved id, then the first profile, for legacy rows', () => {
    const legacy = users.map((user) => ({ ...user, account_id: null }))
    expect(resolveActiveUserId(legacy, { id: 20 }, 2)).toBe(2)
    expect(resolveActiveUserId(legacy, { id: 20 }, 99)).toBe(1)
    expect(resolveActiveUserId([], null, null)).toBeNull()
  })
})

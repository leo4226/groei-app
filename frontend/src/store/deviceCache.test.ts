// @vitest-environment jsdom
//
// The device copy of household data (instant start-up) must never leak from
// one account to another and must go with the session.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheOwner, clearDeviceCache, readCache, writeCache } from './deviceCache'

function tokenFor(sub: number, household: number): string {
  const payload = btoa(JSON.stringify({ sub: String(sub), household_id: household, sv: 0 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `header.${payload}.signature`
}

describe('deviceCache', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('reads nothing and writes nothing while signed out', () => {
    writeCache('boot', { plants: [1] })
    expect(cacheOwner()).toBeNull()
    expect(readCache('boot')).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('keeps each account and household apart', () => {
    localStorage.setItem('floreren-token', tokenFor(1, 10))
    writeCache('boot', { owner: 'leon' })
    expect(readCache('boot')).toEqual({ owner: 'leon' })

    localStorage.setItem('floreren-token', tokenFor(2, 10))
    expect(readCache('boot')).toBeNull()

    // Same account moved to another household (a join) is a fresh start too.
    localStorage.setItem('floreren-token', tokenFor(1, 11))
    expect(readCache('boot')).toBeNull()
  })

  it('clears every cached entry but nothing else', () => {
    localStorage.setItem('floreren-token', tokenFor(1, 10))
    writeCache('boot', { a: 1 })
    writeCache('map:tuin', { b: 2 })
    localStorage.setItem('floreren_lang', 'en')

    clearDeviceCache()

    expect(readCache('boot')).toBeNull()
    expect(readCache('map:tuin')).toBeNull()
    expect(localStorage.getItem('floreren_lang')).toBe('en')
    expect(localStorage.getItem('floreren-token')).not.toBeNull()
  })

  it('drops the cache instead of throwing when storage is full', () => {
    localStorage.setItem('floreren-token', tokenFor(1, 10))
    writeCache('boot', { old: true })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(() => writeCache('map:tuin', { big: true })).not.toThrow()
    vi.restoreAllMocks()
    expect(readCache('boot')).toBeNull()
  })

  it('treats a malformed token as signed out', () => {
    localStorage.setItem('floreren-token', 'not-a-jwt')
    expect(cacheOwner()).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { resetErrorMessage } from './authErrors'
import { en } from '../i18n/en'
import { nl } from '../i18n/nl'

const t = en.resetPassword

describe('resetErrorMessage', () => {
  it('says the link is dead, not the server English, on a 400', () => {
    expect(resetErrorMessage({ status: 400, code: 'reset_link_invalid' }, t)).toBe(t.invalidLink)
  })

  it('tells a too-short password apart from a dead link', () => {
    expect(resetErrorMessage({ status: 400, code: 'password_too_short' }, t)).toBe(t.tooShort)
  })

  it('maps rate limiting and network failures', () => {
    expect(resetErrorMessage({ status: 429 }, t)).toBe(t.tooManyAttempts)
    expect(resetErrorMessage(new TypeError('Failed to fetch'), t)).toBe(t.networkError)
  })

  it('falls back to a generic message in the reader language', () => {
    expect(resetErrorMessage({ status: 500 }, nl.resetPassword)).toBe(nl.resetPassword.genericError)
  })
})

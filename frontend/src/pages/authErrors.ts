/** Auth failures worded in the reader's language. Both pages branch on the
 * HTTP status and the server's machine code, never on its (English) text. */
import type { Translations } from '../i18n/translations'

export type AuthMode = 'login' | 'register' | 'join' | 'forgot'

type AuthErrorCopy = Record<
  | 'networkError' | 'tooManyAttempts' | 'invalidCredentials' | 'emailTaken'
  | 'nameTaken' | 'inviteInvalid' | 'inviteExpired' | 'checkFields' | 'genericError',
  string
>

/**
 * Word an auth failure in the visitor's language, from its HTTP status and
 * machine code. The page used to show the server's own text: English to Dutch
 * visitors, one Dutch message to English ones, and "[object Object]" (or raw
 * JSON) for a rate limit or a validation error (#795).
 */
export function authErrorMessage(err: unknown, mode: AuthMode, t: AuthErrorCopy): string {
  const { status, code } = (err ?? {}) as { status?: number; code?: string }
  if (status === undefined) return t.networkError
  if (status === 429) return t.tooManyAttempts
  if (status === 401 && mode === 'login') return t.invalidCredentials
  if (status === 409) return code === 'name_taken' ? t.nameTaken : t.emailTaken
  if (status === 404 && mode === 'join') return t.inviteInvalid
  if (status === 410) return t.inviteExpired
  if (status === 422 || status === 400) return t.checkFields
  return t.genericError
}

type ResetCopy = Translations['resetPassword']

/** What to tell the user when the reset call fails. Branches on the HTTP
 * status and the server's error code, never on its (English) message text. */
export function resetErrorMessage(err: unknown, t: ResetCopy): string {
  const { status, code } = (err ?? {}) as { status?: number; code?: string }
  if (status === undefined) return t.networkError
  if (status === 429) return t.tooManyAttempts
  if (code === 'password_too_short' || status === 422) return t.tooShort
  if (status === 400) return t.invalidLink
  return t.genericError
}

import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { resetPassword } from '../api/auth'
import { translationsFor, useT } from '../context/LanguageContext'
import { resetErrorMessage } from './authErrors'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  // The email says which language it was written in; this device may never
  // have been logged in, so its stored language would just be the default.
  const contextT = useT()
  const t = (translationsFor(searchParams.get('lang')) ?? contextT).resetPassword

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [linkDead, setLinkDead] = useState(false)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError(t.tooShort)
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t.mismatch)
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, newPassword)
      setSuccess(true)
    } catch (err) {
      const status = (err as { status?: number } | null)?.status
      const code = (err as { code?: string } | null)?.code
      setLinkDead(status === 400 && code !== 'password_too_short')
      setError(resetErrorMessage(err, t))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    fontSize: '0.95rem',
    color: 'var(--color-text)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--color-text-soft)',
    marginBottom: '6px',
  }

  if (!token) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: '360px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '2.8rem', color: 'var(--color-primary)', margin: '0 0 24px', letterSpacing: '-0.02em' }}>
            Floreren
          </h1>
          <div className="card" style={{ padding: '24px' }}>
            <p style={{ color: 'var(--color-overdue)', margin: '0 0 20px', fontSize: '0.95rem' }}>
              {t.missingToken}
            </p>
            <Link
              to="/login"
              style={{
                color: 'var(--color-primary)',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: '0.9rem',
              }}
            >
              {t.backToLogin}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '2.8rem', color: 'var(--color-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Floreren
          </h1>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '1.1rem', margin: '0 0 8px' }}>
                {t.successTitle}
              </p>
              <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', margin: '0 0 20px' }}>
                {t.successBody}
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                style={{
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.logIn}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="reset-new-password" style={labelStyle}>{t.newPassword}</label>
                <input
                  id="reset-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder={t.newPasswordPlaceholder}
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="reset-confirm-password" style={labelStyle}>{t.confirmPassword}</label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder={t.confirmPasswordPlaceholder}
                  style={inputStyle}
                />
              </div>

              {error && (
                <p role="alert" style={{ color: 'var(--color-overdue)', fontSize: '0.85rem', margin: 0 }}>
                  {error}
                  {linkDead && (
                    <>
                      {' '}
                      <Link to="/login?mode=forgot" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        {t.requestNewLink}
                      </Link>
                    </>
                  )}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  fontFamily: 'inherit',
                  marginTop: '4px',
                }}
              >
                {loading ? '…' : t.submit}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

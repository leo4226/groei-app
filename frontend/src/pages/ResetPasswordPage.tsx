import { useState, useEffect } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { resetPassword } from '../api/auth'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing reset token. Please use the link from your email.')
    }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, newPassword)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
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
              {error || 'Invalid reset link.'}
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
              ← Back to log in
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
                Password updated!
              </p>
              <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', margin: '0 0 20px' }}>
                Your password has been reset successfully.
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
                Log in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  style={inputStyle}
                />
              </div>

              {error && (
                <p style={{ color: 'var(--color-overdue)', fontSize: '0.85rem', margin: 0 }}>
                  {error}
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
                {loading ? '…' : 'Reset password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

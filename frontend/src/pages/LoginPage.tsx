import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, forgotPassword, saveToken } from '../api/auth'
import { household } from '../api/client'
import { useFloreren } from '../store/useFloreren'
import PageDecor from '../components/PageDecor'
import Glyph from '../components/ui/Glyph'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register' | 'join' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await login(email, password)
        saveToken(res.token)
        useFloreren.getState().resetForNewSession()
        navigate('/maps', { replace: true })
      } else if (mode === 'register') {
        const hName = householdName.trim() || `${name.trim()}'s Garden`
        const res = await register(email, password, name, hName)
        saveToken(res.token)
        useFloreren.getState().resetForNewSession()
        navigate('/maps', { replace: true })
      } else if (mode === 'join') {
        const res = await household.join({ code: code.toUpperCase().trim(), email, password, name })
        saveToken(res.token)
        useFloreren.getState().resetForNewSession()
        navigate('/maps', { replace: true })
      } else {
        await forgotPassword(email)
        setForgotSent(true)
      }
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

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      {/* Botanical decor */}
      <PageDecor />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '360px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '2.8rem', color: 'var(--color-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Floreren
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: '6px 0 0' }}>
            Laat je tuin floreren
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '24px' }}>
          {/* Mode toggle — only login/register, not forgot */}
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: '8px', padding: '3px', marginBottom: '22px' }}>
              {(['login', 'register', 'join'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); setForgotSent(false) }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: mode === m ? 'var(--color-surface)' : 'transparent',
                    color: mode === m ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontWeight: mode === m ? 600 : 400,
                    fontSize: '0.875rem',
                    boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  {m === 'login' ? 'Log in' : m === 'register' ? 'Register' : 'Join'}
                </button>
              ))}
            </div>
          )}

          {mode === 'forgot' && forgotSent ? (
            /* Success state — no form */
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ color: 'var(--color-text)', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 20px' }}>
                Check your inbox — if that email is registered, a reset link is on its way.
              </p>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setForgotSent(false) }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                }}
              >
                <Glyph name="arrow-left" size={14} className="inline-block align-[-2px] mr-1" />
                Back to log in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {mode === 'register' && (
                <>
                  <div>
                    <label style={labelStyle}>Your name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Sam"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Household name{' '}
                      <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={householdName}
                      onChange={(e) => setHouseholdName(e.target.value)}
                      placeholder={name ? `${name}'s Garden` : 'My Garden'}
                      style={inputStyle}
                    />
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '-4px 0 0', lineHeight: 1.4, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                    <Glyph name="alert" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>Names must be unique across all users. If someone already uses this name, registration will fail.</span>
                  </p>
                </>
              )}
              {mode === 'join' && (
                <>
                  <div>
                    <label style={labelStyle}>Invite code</label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      required
                      placeholder="A3K9XZ"
                      style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Your name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Lisbeth"
                      style={inputStyle}
                    />
                  </div>
                </>
              )}

              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  style={inputStyle}
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      style={{ ...inputStyle, paddingRight: '48px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '4px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '6px 10px',
                        fontSize: '0.8rem',
                        color: 'var(--color-text-muted)',
                        fontFamily: 'inherit',
                      }}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(null); setEmail(''); setPassword('') }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        padding: '6px 0 0',
                        fontFamily: 'inherit',
                        fontWeight: 500,
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
              )}

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
                {loading ? '…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : mode === 'join' ? 'Join garden' : 'Send reset link'}
              </button>

              {mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null) }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                  }}
                >
                  <Glyph name="arrow-left" size={14} className="inline-block align-[-2px] mr-1" />
                  Back to log in
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

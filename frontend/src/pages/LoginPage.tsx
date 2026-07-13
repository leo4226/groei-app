import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, forgotPassword, saveToken } from '../api/auth'
import { household } from '../api/client'
import { useFloreren } from '../store/useFloreren'
import PageDecor from '../components/PageDecor'
import Glyph from '../components/ui/Glyph'
import { resolveIconUrl } from '../utils/icons'

// This page is shown BEFORE there is an account language. It renders in
// English (the default for new visitors; Dutch is a Settings option), with
// only the brand name carrying the Dutch flavour (see CLAUDE.md § Languages —
// LoginPage is the documented exception to the translation-catalog rule).
const FEATURES = [
  {
    no: '01',
    icon: 'daisy',
    title: 'Identify',
    text: 'Photograph any plant in the wild and the field scanner names it in seconds.',
  },
  {
    no: '02',
    icon: 'rosemary',
    title: 'Care',
    text: 'Watering, feeding and pruning reminders tuned to your own garden.',
  },
  {
    no: '03',
    icon: 'oak',
    title: 'Collect',
    text: 'Every find becomes a numbered specimen card in your personal field guide.',
  },
] as const

const MRZ_LINE = 'V<FLO<<FIELD<GUIDE<<PLANT<CARE<<<<<<<<<<<<'

/** Faded circular herbarium stamp, echoing the specimen-card motif. */
function HerbariumStamp({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className={`motion-safe:animate-[spin_120s_linear_infinite] ${className ?? ''}`}
    >
      <defs>
        <path id="stamp-ring" d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0" fill="none" />
      </defs>
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" />
      <text fontSize="13" letterSpacing="5.5" fill="currentColor" style={{ fontFamily: 'var(--font-mono)' }}>
        <textPath href="#stamp-ring">FLOREREN · FIELD GUIDE · PLANT CARE ·</textPath>
      </text>
    </svg>
  )
}

function SpecimenEntry({ f, compact }: { f: (typeof FEATURES)[number]; compact?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={`flex flex-none items-center justify-center rounded-full border border-border bg-surface shadow-[0_2px_8px_rgba(31,42,30,0.06)] ${compact ? 'h-11 w-11' : 'h-14 w-14'}`}
      >
        <img src={resolveIconUrl(f.icon)!} alt="" className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="m-0 font-mono text-[9.5px] uppercase tracking-[0.2em] text-text-muted">
          № {f.no} · <span className="text-primary">{f.title}</span>
        </p>
        <p className={`m-0 mt-1 leading-[1.45] text-text-soft ${compact ? 'text-[12.5px]' : 'text-[13.5px]'}`}>
          {f.text}
        </p>
      </div>
    </div>
  )
}

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
    <div className="relative min-h-dvh overflow-hidden">
      {/* Botanical garden-bed decor + a calm wash behind the content */}
      <PageDecor variant="landing" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 60% 44% at 50% 50%, var(--color-bg) 12%, transparent 72%)' }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1060px] flex-col items-center justify-center gap-8 px-5 py-10 lg:flex-row lg:items-center lg:gap-20">
        {/* ── Left: field-guide cover hero (desktop) ── */}
        <section className="relative hidden max-w-[520px] flex-1 lg:block">
          <HerbariumStamp className="absolute -left-16 -top-24 h-52 w-52 text-primary opacity-[0.07]" />

          <p className="relative m-0 mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            <span className="h-px w-7 flex-none bg-border" />
            Field guide &amp; plant care
            <span className="h-px min-w-[24px] max-w-[70px] flex-1 bg-border" />
          </p>

          <h1 className="relative m-0 font-heading text-[clamp(52px,6.5vw,76px)] font-medium leading-[0.98] tracking-[-0.02em] text-primary">
            Floreren<span className="text-text">.</span>
          </h1>

          <p className="relative mt-4 max-w-[440px] font-heading text-[16px] italic leading-[1.55] text-text-soft">
            A field journal and plant-care companion. Identify wild plants, log
            every find, and keep your garden thriving.
          </p>

          <div className="relative mt-9 flex flex-col gap-5">
            {FEATURES.map((f) => (
              <SpecimenEntry key={f.no} f={f} />
            ))}
          </div>

          <p
            aria-hidden="true"
            className="relative m-0 mt-9 overflow-hidden whitespace-nowrap border-t border-dashed border-border pt-4 font-mono text-[11px] tracking-[0.24em] text-text-muted opacity-50"
          >
            {MRZ_LINE}
          </p>
        </section>

        {/* ── Right: auth column ── */}
        <div className="w-full max-w-[380px] flex-none">
          {/* Brand block (mobile shows the full bilingual tagline here) */}
          <div className="mb-7 text-center lg:hidden">
            <h1 className="m-0 font-heading text-[44px] font-medium leading-none tracking-[-0.02em] text-primary">
              Floreren
            </h1>
            <p className="m-0 mt-2 font-heading text-[15px] italic text-text-soft">
              Let your garden flourish
            </p>
            <p className="m-0 mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Field guide &amp; plant care
            </p>
          </div>

          <div className="rounded-[18px] border border-border bg-surface p-6 shadow-[0_18px_50px_rgba(31,42,30,0.10)]">
            <p className="m-0 mb-5 flex items-center gap-2.5 font-mono text-[9.5px] uppercase tracking-[0.22em] text-text-muted">
              <span className="h-px flex-1 bg-border" />
              Sign in
              <span className="h-px flex-1 bg-border" />
            </p>

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
                  Check your inbox. If that email is registered, a reset link is on its way.
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

          {/* Compact specimen entries under the card (mobile) */}
          <div className="mt-8 flex flex-col gap-4 lg:hidden">
            {FEATURES.map((f) => (
              <SpecimenEntry key={f.no} f={f} compact />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

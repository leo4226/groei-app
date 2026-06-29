import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { gameApi } from '../api/game'
import Glyph from '../components/ui/Glyph'
import { getToken } from '../api/auth'

export default function GameJoinPage() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // After login redirect, auto-join if code is in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('game_join_code')
    if (saved && getToken()) {
      sessionStorage.removeItem('game_join_code')
      setCode(saved.toUpperCase())
      handleJoin(saved.toUpperCase())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleJoin(codeOverride?: string) {
    const target = (codeOverride ?? code).trim().toUpperCase()
    if (!target) return
    if (!getToken()) {
      sessionStorage.setItem('game_join_code', target)
      navigate(`/login?next=/game?code=${target}`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await gameApi.join(target)
      navigate(`/game/${target}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('already started') || msg.includes('al begonnen')) {
        setError(t.game.gameAlreadyStarted)
      } else {
        setError(t.game.invalidCode)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4 text-primary"><Glyph name="leaf" size={44} /></div>
          <h1 className="text-2xl font-bold text-text">Floreren</h1>
          <p className="text-text-muted text-sm">Tuinspel</p>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4 shadow-sm">
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-text-muted">{t.game.enterCode}</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="GROEN4"
              maxLength={6}
              autoFocus
              className="mt-2 w-full text-3xl font-bold tracking-[0.25em] text-center bg-bg border border-border rounded-xl px-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <button
            onClick={() => handleJoin()}
            disabled={code.length < 6 || loading}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
          >
            {loading ? t.common.loading : t.game.joinButton}
          </button>
        </div>
      </div>
    </div>
  )
}

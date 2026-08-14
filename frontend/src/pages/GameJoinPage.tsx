import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { gameApi, saveGuest, type GamePreview } from '../api/game'
import Glyph from '../components/ui/Glyph'

/**
 * Join screen — the first thing a party guest sees after scanning the QR code.
 *
 * No account, no email, no password: a name and a tap. Requiring a Floreren
 * login here was the single thing that made the game unusable at a party, since
 * nobody signs up for an account while holding a drink.
 */
export default function GameJoinPage() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase())
  const [name, setName] = useState(() => sessionStorage.getItem('floreren-game-name') ?? '')
  const [preview, setPreview] = useState<GamePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Look the game up as soon as we have a full code, so the guest can see
  // whose garden they're about to join before committing a name.
  useEffect(() => {
    if (code.length < 6) {
      setPreview(null)
      return
    }
    let cancelled = false
    gameApi.preview(code)
      .then((p) => { if (!cancelled) { setPreview(p); setError(null) } })
      .catch(() => { if (!cancelled) setPreview(null) })
    return () => { cancelled = true }
  }, [code])

  const handleJoin = useCallback(async () => {
    const target = code.trim().toUpperCase()
    const playerName = name.trim()
    if (target.length < 6 || !playerName || loading) return

    setLoading(true)
    setError(null)
    try {
      const result = await gameApi.joinAsGuest(target, playerName)
      saveGuest({
        code: target,
        token: result.guest_token,
        player_id: result.player_id,
        name: playerName,
      })
      // Remember the name so a guest rejoining after a phone lock doesn't retype it.
      sessionStorage.setItem('floreren-game-name', playerName)
      navigate(`/game/${target}`)
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 404) setError(t.game.invalidCode)
      else if (status === 400) setError(t.game.gameAlreadyFinished)
      else setError(t.game.joinFailed)
      setLoading(false)
    }
  }, [code, name, loading, navigate, t])

  const canJoin = code.trim().length === 6 && name.trim().length > 0 && !loading

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4 text-primary"><Glyph name="leaf" size={44} /></div>
          <h1 className="text-2xl font-bold text-text">Floreren</h1>
          <p className="text-text-muted text-sm">{t.game.gameName}</p>
        </div>

        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4 shadow-sm">
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-text-muted">
              {t.game.enterCode}
            </span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="GROEN4"
              maxLength={6}
              autoFocus={!code}
              className="mt-2 w-full text-3xl font-bold tracking-[0.25em] text-center bg-bg border border-border rounded-xl px-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
            />
          </label>

          {preview && (
            <div className="rounded-xl bg-primary/10 px-4 py-3 text-center space-y-0.5">
              <p className="text-sm font-semibold text-primary">
                {t.game.previewHosted.replace('{name}', preview.host_name)}
              </p>
              <p className="text-xs text-primary/70">
                {preview.map_name} ·{' '}
                {t.game.previewPlayers.replace('{count}', String(preview.player_count))}
              </p>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-text-muted">
              {t.game.yourName}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder={t.game.yourNamePlaceholder}
              maxLength={40}
              autoFocus={Boolean(code)}
              className="mt-2 w-full text-lg text-center bg-bg border border-border rounded-xl px-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button
            onClick={handleJoin}
            disabled={!canJoin}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
          >
            {loading ? t.common.loading : t.game.joinButton}
          </button>

          <p className="text-xs text-text-muted text-center">{t.game.noAccountNeeded}</p>
        </div>
      </div>
    </div>
  )
}

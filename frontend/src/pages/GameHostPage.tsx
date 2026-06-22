import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { gameApi, type GameState } from '../api/game'
import GameLeaderboard from '../components/game/GameLeaderboard'

type HostStep = 'waiting' | 'round' | 'done'

export default function GameHostPage() {
  const t = useT()
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<GameState | null>(null)
  const [step, setStep] = useState<HostStep>('waiting')
  const [advancing, setAdvancing] = useState(false)
  const [copied, setCopied] = useState(false)

  const poll = useCallback(async () => {
    if (!code) return
    try {
      const s = await gameApi.getState(code)
      setState(s)
      if (s.session.status === 'active' && step === 'waiting') setStep('round')
      if (s.session.status === 'finished') setStep('done')
    } catch {
      // ignore transient errors
    }
  }, [code, step])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [poll])

  async function handleStart() {
    if (!code) return
    const s = await gameApi.start(code)
    setState(s)
    setStep('round')
  }

  async function handleNext() {
    if (!code || advancing) return
    setAdvancing(true)
    try {
      const s = await gameApi.next(code)
      setState(s)
      if (s.session.status === 'finished') setStep('done')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleCancel() {
    if (!code) return
    try { await gameApi.delete(code) } catch { /* best effort */ }
    navigate('/maps')
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/game?code=${code}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-text-muted">{t.common.loading}</p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <GameLeaderboard
        state={state}
        isHost
        onPlayAgain={() => navigate(`/map/${state.session.map_slug}`)}
        onBackToMap={() => navigate(`/map/${state.session.map_slug}`)}
      />
    )
  }

  // ── Waiting room ────────────────────────────────────────────────────────────
  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted">{t.game.joinCode}</p>
          <div className="text-6xl font-black tracking-[0.15em] text-primary">{code}</div>
          <p className="text-text-muted text-sm">{state.session.map_name}</p>
        </div>

        <button
          onClick={copyLink}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-sm text-text-muted hover:bg-surface transition-colors"
        >
          <span>{copied ? '✓' : '🔗'}</span>
          <span>{copied ? t.game.linkCopied : t.game.copyLink}</span>
        </button>

        <div className="w-full max-w-xs bg-surface rounded-2xl border border-border p-4 space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
            {state.players.length} {t.game.playersJoined}
          </p>
          {state.players.map((p) => (
            <div key={p.account_id} className="flex items-center gap-3 py-1">
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-sm flex items-center justify-center">
                {p.player_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text">{p.player_name}</span>
            </div>
          ))}
        </div>

        {state.players.length < 2 && (
          <p className="text-xs text-text-muted text-center">{t.game.minPlayersHint}</p>
        )}

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handleStart}
            disabled={state.players.length < 2}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
          >
            {t.game.startGame}
          </button>
          <button
            onClick={handleCancel}
            className="w-full py-2 text-sm text-text-muted hover:text-text transition-colors"
          >
            {t.game.cancelGame}
          </button>
        </div>
      </div>
    )
  }

  // ── Round view ──────────────────────────────────────────────────────────────
  const clue = state.current_clue
  const roundNum = state.session.current_round + 1
  const totalRounds = state.session.total_rounds
  const answeredCount = state.players.filter((p) => p.answered_current_round).length

  return (
    <div className="min-h-screen bg-bg flex flex-col p-6 max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
          {t.game.roundTitle} {roundNum} {t.game.roundOf} {totalRounds}
        </p>
        <span className="text-xs text-text-muted">{answeredCount}/{state.players.length} {t.game.answered}</span>
      </div>

      {/* Host-only plant name hint */}
      {clue && (
        <div className="bg-primary/10 rounded-xl px-4 py-3">
          <p className="text-xs text-primary/70 font-mono uppercase tracking-widest mb-0.5">{t.game.plantHint}</p>
          <p className="font-semibold text-primary">{clue.plant_name_nl}</p>
          {clue.plant_name_en && clue.plant_name_en !== clue.plant_name_nl && (
            <p className="text-xs text-primary/60">{clue.plant_name_en}</p>
          )}
        </div>
      )}

      {/* Player answer status */}
      <div className="bg-surface rounded-2xl border border-border p-4 space-y-2">
        {state.players.map((p) => (
          <div key={p.account_id} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-bg border border-border text-xs font-bold flex items-center justify-center text-text-muted">
                {p.player_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text">{p.player_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">{p.score} pt</span>
              {p.answered_current_round
                ? <span className="text-green-500 text-base">✓</span>
                : <span className="text-text-muted/30 text-base">○</span>}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={advancing}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-60 transition-opacity mt-auto"
      >
        {advancing ? t.common.loading : roundNum === totalRounds ? t.game.endGame : t.game.nextRound}
      </button>
    </div>
  )
}

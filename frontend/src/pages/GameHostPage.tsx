import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { gameApi, type GameState, type AnswerResult } from '../api/game'
import { plants as plantsApi } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import GameLeaderboard from '../components/game/GameLeaderboard'
import Glyph from '../components/ui/Glyph'

// The host is also a player (create_game registers them in game_players), so
// the round view doubles as their play screen: clue + scan, with the answer
// hidden behind a peek toggle so a playing host isn't spoiled but a refereeing
// host can still nudge stuck guests (#244).
type HostStep = 'waiting' | 'round' | 'camera' | 'analyzing' | 'result' | 'done'

export default function GameHostPage() {
  const t = useT()
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<GameState | null>(null)
  const [step, setStep] = useState<HostStep>('waiting')
  const [advancing, setAdvancing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [scanResult, setScanResult] = useState<AnswerResult | null>(null)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const activeLang = useFloreren((s) => {
    const user = s.users.find((u) => u.id === s.activeUserId)
    return user?.language === 'en' ? 'en' : 'nl'
  })

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
      setScanResult(null)
      setAnswerRevealed(false)
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

  // Host scans just like a player — same identify → answer flow as GamePlayerPage.
  async function handleCapture(blob: Blob, dataUrl: string) {
    if (!code) return
    setStep('analyzing')
    try {
      const resp = await plantsApi.identify(blob, activeLang)
      const topCandidate = resp.candidates?.[0]?.scientific_name ?? ''
      const otherCandidates = resp.candidates?.slice(1, 3).map((c) => c.scientific_name) ?? []
      const confidence = resp.candidates?.[0]?.confidence ?? 0

      const result = await gameApi.answer(code, topCandidate, otherCandidates, confidence, dataUrl)
      setScanResult(result)
      setStep('result')
      poll()
    } catch {
      setStep('round')
    }
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
          <Glyph name={copied ? 'check' : 'link'} size={15} />
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

  // ── Live camera (host scanning their own answer) ────────────────────────────
  if (step === 'camera') {
    return (
      <IdentifyCamera
        onCapture={(blob, dataUrl) => handleCapture(blob, dataUrl)}
        onCancel={() => setStep('round')}
      />
    )
  }

  if (step === 'analyzing') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-sm">{t.game.scanning}</p>
      </div>
    )
  }

  // ── Round view ──────────────────────────────────────────────────────────────
  const clue = state.current_clue
  const roundNum = state.session.current_round + 1
  const totalRounds = state.session.total_rounds
  const answeredCount = state.players.filter((p) => p.answered_current_round).length
  const hostAnswered = Boolean(state.my_answer?.is_correct)
  // In name mode the clue IS the plant name, so there's no answer to hide.
  const photoMode = state.session.clue_mode !== 'name'

  // Brief own-scan result overlay, then back to the round panel.
  if (step === 'result' && scanResult) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
        {scanResult.is_correct ? (
          <>
            <div className="text-amber-500"><Glyph name="sparkle" size={52} /></div>
            <p className="text-2xl font-bold text-text">{t.game.correct}</p>
            <p className="text-primary font-semibold text-lg">
              {t.game.pointsEarned.replace('{points}', String(scanResult.points_awarded))}
            </p>
          </>
        ) : (
          <>
            <div className="text-text-muted/60"><Glyph name="leaf" size={44} /></div>
            <p className="text-lg font-semibold text-text">{t.game.wrongScan}</p>
          </>
        )}
        <div className="flex flex-col gap-2 w-full max-w-xs mt-4">
          {!scanResult.is_correct && (
            <button
              onClick={() => setStep('camera')}
              className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold"
            >
              {t.game.scanButton}
            </button>
          )}
          <button
            onClick={() => setStep('round')}
            className="px-6 py-2 text-sm text-text-muted hover:text-text transition-colors"
          >
            {t.game.backToRound}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col p-6 max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
          {t.game.roundTitle} {roundNum} {t.game.roundOf} {totalRounds}
        </p>
        <span className="text-xs text-text-muted">{answeredCount}/{state.players.length} {t.game.answered}</span>
      </div>

      {/* Clue — same view the players get, so the host can hunt along */}
      {clue && (
        photoMode ? (
          clue.clue_photo_url ? (
            <div className="w-full aspect-square max-h-64 rounded-2xl overflow-hidden shadow-lg mx-auto">
              <img src={clue.clue_photo_url} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-40 h-40 rounded-2xl bg-surface flex items-center justify-center text-text-muted border border-border mx-auto">
              <Glyph name="sprout" size={44} />
            </div>
          )
        ) : (
          <div className="bg-surface rounded-2xl border border-border p-5 flex flex-col items-center gap-2">
            <Glyph name="leaf" size={32} className="text-primary" />
            <p className="text-xl font-bold text-text text-center">{clue.plant_name_nl}</p>
            {clue.plant_name_en && clue.plant_name_en !== clue.plant_name_nl && (
              <p className="text-xs text-text-muted text-center italic">{clue.plant_name_en}</p>
            )}
          </div>
        )
      )}

      {/* Host scan — the host plays too */}
      {hostAnswered ? (
        <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/10 text-green-600 text-sm font-semibold">
          <Glyph name="check" size={16} strokeWidth={2.4} /> {t.game.correctScan}
        </div>
      ) : (
        <button
          onClick={() => setStep('camera')}
          className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold text-base"
        >
          {t.game.scanButton}
        </button>
      )}

      {/* Answer peek — collapsed by default so a playing host isn't spoiled;
          photo mode only (in name mode the clue is the name already) */}
      {photoMode && clue && (
        <div className="bg-primary/10 rounded-xl px-4 py-3">
          <button
            onClick={() => setAnswerRevealed((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-primary/70 font-mono uppercase tracking-widest"
          >
            <Glyph name="eye" size={13} />
            {answerRevealed ? t.game.hideAnswer : t.game.revealAnswer}
          </button>
          {answerRevealed && (
            <div className="mt-1.5">
              <p className="font-semibold text-primary">{clue.plant_name_nl}</p>
              {clue.plant_name_en && clue.plant_name_en !== clue.plant_name_nl && (
                <p className="text-xs text-primary/60">{clue.plant_name_en}</p>
              )}
            </div>
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
                ? <Glyph name="check" size={16} className="text-green-500" />
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { gameApi, type GameState, type AnswerResult } from '../api/game'
import { plants as plantsApi } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import GameLeaderboard from '../components/game/GameLeaderboard'

type PlayerStep =
  | 'waiting'
  | 'clue'
  | 'camera'
  | 'analyzing'
  | 'result'
  | 'answered'
  | 'done'

export default function GamePlayerPage() {
  const t = useT()
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<GameState | null>(null)
  const [step, setStep] = useState<PlayerStep>('waiting')
  const [scanResult, setScanResult] = useState<AnswerResult | null>(null)
  const [countdown, setCountdown] = useState(3)
  const lastRoundRef = useRef<number>(-1)
  const activeLang = useFloreren((s) => {
    const user = s.users.find((u) => u.id === s.activeUserId)
    return user?.language === 'en' ? 'en' : 'nl'
  })

  const poll = useCallback(async () => {
    if (!code) return
    try {
      const s = await gameApi.getState(code)
      setState(s)

      if (s.session.status === 'finished') {
        setStep('done')
        return
      }

      if (s.session.status === 'active') {
        const roundIdx = s.session.current_round
        if (roundIdx !== lastRoundRef.current) {
          lastRoundRef.current = roundIdx
          setScanResult(null)
          setStep('clue')
        }
      }
    } catch {
      // ignore transient errors
    }
  }, [code])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [poll])

  // Countdown after a correct scan before showing the leaderboard wait screen
  useEffect(() => {
    if (step !== 'result') return
    setCountdown(3)
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id)
          setStep('answered')
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [step])

  async function handleCapture(blob: Blob) {
    if (!code) return
    setStep('analyzing')
    try {
      const resp = await plantsApi.identify(blob, activeLang)
      const topCandidate = resp.candidates?.[0]?.scientific_name ?? ''
      const otherCandidates = resp.candidates?.slice(1, 3).map((c) => c.scientific_name) ?? []
      const confidence = resp.candidates?.[0]?.confidence ?? 0

      const result = await gameApi.answer(code, topCandidate, otherCandidates, confidence)
      setScanResult(result)
      setStep('result')
    } catch {
      setStep('clue')
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
        isHost={false}
        onPlayAgain={() => navigate('/game')}
        onBackToMap={() => navigate(`/map/${state.session.map_slug}`)}
      />
    )
  }

  // ── Waiting for host to start ────────────────────────────────────────────────
  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 space-y-6 text-center">
        <div className="text-5xl animate-bounce">🌱</div>
        <div className="space-y-1">
          <p className="font-semibold text-text">{t.game.youAreIn}</p>
          <p className="text-text-muted text-sm">{t.game.waitingForHost}</p>
        </div>
        <div className="w-full max-w-xs bg-surface rounded-2xl border border-border p-4 space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted">{t.game.otherPlayers}</p>
          {state.players.map((p) => (
            <div key={p.account_id} className="flex items-center gap-2 py-1">
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center">
                {p.player_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text">{p.player_name}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Live camera ──────────────────────────────────────────────────────────────
  if (step === 'camera') {
    return (
      <IdentifyCamera
        onCapture={(blob) => handleCapture(blob)}
        onCancel={() => setStep('clue')}
      />
    )
  }

  // ── Analyzing capture ────────────────────────────────────────────────────────
  if (step === 'analyzing') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-sm">{t.game.scanning}</p>
      </div>
    )
  }

  const clue = state.current_clue
  const roundNum = state.session.current_round + 1
  const totalRounds = state.session.total_rounds

  // ── Clue view — show plant photo, then tap to scan ───────────────────────────
  if (step === 'clue' && !state.my_answer?.is_correct) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-border">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
            {t.game.roundTitle} {roundNum} / {totalRounds}
          </p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          {clue?.clue_photo_url ? (
            <div className="w-full max-w-xs aspect-square rounded-2xl overflow-hidden shadow-lg">
              <img
                src={clue.clue_photo_url}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-40 h-40 rounded-2xl bg-surface flex items-center justify-center text-5xl border border-border">
              🌱
            </div>
          )}
          <p className="text-lg font-semibold text-text text-center">{t.game.findThisPlant}</p>
        </div>

        <div className="px-5 pb-[max(env(safe-area-inset-bottom,0px),20px)]">
          <button
            onClick={() => setStep('camera')}
            className="w-full py-4 rounded-2xl bg-primary text-white font-semibold text-base"
          >
            {t.game.scanButton}
          </button>
        </div>
      </div>
    )
  }

  // ── Already answered correctly this round ───────────────────────────────────
  if (step === 'answered' || (step === 'clue' && state.my_answer?.is_correct)) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <p className="font-semibold text-text">{t.game.correctScan}</p>
        <p className="text-text-muted text-sm">{t.game.waitingForNextRound}</p>
        <div className="mt-4 bg-surface rounded-2xl border border-border px-6 py-4">
          {state.players.slice(0, 5).map((p, i) => (
            <div key={p.account_id} className="flex justify-between items-center py-1 text-sm">
              <span className="text-text-muted">
                {i === 0 ? t.game.place1 : i === 1 ? t.game.place2 : i === 2 ? t.game.place3 : `${i + 1}.`}{' '}
                {p.player_name}
              </span>
              <span className="text-text font-semibold">{p.score} pt</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Scan result (briefly shown before auto-advancing) ──────────────────────
  if (step === 'result' && scanResult) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
        {scanResult.is_correct ? (
          <>
            <div className="text-6xl">🎉</div>
            <p className="text-2xl font-bold text-text">{t.game.correct}</p>
            <p className="text-primary font-semibold text-lg">
              {t.game.pointsEarned.replace('{points}', String(scanResult.points_awarded))}
            </p>
          </>
        ) : (
          <>
            <div className="text-5xl">🍂</div>
            <p className="text-lg font-semibold text-text">{t.game.wrongScan}</p>
          </>
        )}
        {scanResult.is_correct && (
          <p className="text-text-muted text-sm">{t.game.nextRoundSoon.replace('{seconds}', String(countdown))}</p>
        )}
        {!scanResult.is_correct && (
          <button
            onClick={() => setStep('clue')}
            className="mt-4 px-6 py-2 rounded-full bg-primary text-white text-sm font-semibold"
          >
            {t.game.scanButton}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-text-muted">{t.common.loading}</p>
    </div>
  )
}

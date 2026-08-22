import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { gameApi, getGuest, type GameState, type AnswerResult } from '../api/game'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import GameLeaderboard from '../components/game/GameLeaderboard'
import GameQuizRound from '../components/game/GameQuizRound'
import GameRoundHeader from '../components/game/GameRoundHeader'
import GameNameClue from '../components/game/GameNameClue'
import Glyph from '../components/ui/Glyph'
import ReadOnlyWritePage from '../components/ui/ReadOnlyWritePage'
import { useCapabilities } from '../hooks/useCapabilities'

type PlayerStep = 'waiting' | 'clue' | 'camera' | 'analyzing' | 'result' | 'answered' | 'done'

export default function GamePlayerPage() {
  const t = useT()
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { canEdit } = useCapabilities()
  const [state, setState] = useState<GameState | null>(null)
  const [step, setStep] = useState<PlayerStep>('waiting')
  const [scanResult, setScanResult] = useState<AnswerResult | null>(null)
  const [quizSubmitting, setQuizSubmitting] = useState(false)
  const [notInGame, setNotInGame] = useState(false)
  const lastRoundRef = useRef<number>(-1)
  const accountLang = useFloreren((s) => {
    const user = s.users.find((u) => u.id === s.activeUserId)
    return user?.language === 'en' ? 'en' : 'nl'
  })
  // Guests have no account, so their language comes from the UI catalog.
  const activeLang: 'nl' | 'en' = getGuest(code) ? (t.locale?.startsWith('en') ? 'en' : 'nl') : accountLang
  // The player page is public so party guests can join without an account.
  // A signed-in viewer has no guest token, and answering quiz rounds is an
  // editor write — show the calm read-only notice instead of a broken play UI.
  const isGuest = Boolean(getGuest(code))

  const poll = useCallback(async () => {
    if (!code) return
    try {
      const s = await gameApi.getState(code)
      setState(s)
      setNotInGame(false)

      if (s.session.status === 'finished') {
        setStep('done')
        return
      }
      if (s.session.status === 'active') {
        const roundIdx = s.session.current_round
        if (roundIdx !== lastRoundRef.current) {
          lastRoundRef.current = roundIdx
          setScanResult(null)
          // Don't yank the camera out from under someone mid-capture.
          setStep((prev) => (prev === 'camera' || prev === 'analyzing' ? prev : 'clue'))
        }
      }
    } catch (e) {
      // A guest whose token expired (or who opened a stale link) needs to be
      // told, not left staring at a spinner.
      const status = (e as { status?: number }).status
      if (status === 401 || status === 403) setNotInGame(true)
    }
  }, [code])

  useEffect(() => {
    poll()
    // Race rounds turn over on a deadline, so poll a little faster than the
    // host-paced game needs — the transition should feel immediate.
    const interval = state?.session.pacing === 'race' ? 2000 : 3000
    const id = setInterval(poll, interval)
    return () => clearInterval(id)
  }, [poll, state?.session.pacing])

  async function handleCapture(blob: Blob) {
    if (!code) return
    setStep('analyzing')
    try {
      // One call: the backend identifies and grades. Guests never touch the
      // account-scoped /plants/identify endpoint.
      const result = await gameApi.scan(code, blob, activeLang)
      setScanResult(result)
      setStep('result')
      poll()
    } catch {
      setStep('clue')
    }
  }

  async function handleQuizPick(plantNameNl: string) {
    if (!code || quizSubmitting) return
    setQuizSubmitting(true)
    try {
      const result = await gameApi.answer(code, plantNameNl)
      setScanResult(result)
      setStep('result')
      poll()
    } catch {
      // Answer rejected (round advanced) — the next poll resyncs.
    } finally {
      setQuizSubmitting(false)
    }
  }

  // Account viewers cannot answer quiz rounds; guests (session guest token)
  // are unaffected and play normally.
  if (!canEdit && !isGuest) {
    return <ReadOnlyWritePage onBack={() => navigate('/maps')} />
  }

  if (notInGame) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="text-text-muted/60"><Glyph name="leaf" size={44} /></div>
        <p className="font-semibold text-text">{t.game.sessionLost}</p>
        <button
          onClick={() => navigate(`/game?code=${code ?? ''}`)}
          className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold"
        >
          {t.game.rejoin}
        </button>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center">
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

  // ── Waiting for the host to start ──────────────────────────────────────────
  if (step === 'waiting') {
    return (
      <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 space-y-6 text-center">
        <div className="animate-bounce text-primary"><Glyph name="sprout" size={44} /></div>
        <div className="space-y-1">
          <p className="font-semibold text-text">{t.game.youAreIn}</p>
          <p className="text-text-muted text-sm">{t.game.waitingForHost}</p>
        </div>
        <div className="w-full max-w-xs bg-surface rounded-2xl border border-border p-4 space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
            {t.game.otherPlayers}
          </p>
          {state.players.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1">
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center">
                {p.player_name.charAt(0).toUpperCase()}
              </div>
              <span
                className={`text-sm ${p.id === state.my_player_id ? 'font-semibold text-primary' : 'text-text'}`}
              >
                {p.player_name}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'camera') {
    return (
      <IdentifyCamera
        onCapture={(blob) => handleCapture(blob)}
        onCancel={() => setStep('clue')}
      />
    )
  }

  if (step === 'analyzing') {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <p className="text-white text-sm">{t.game.scanning}</p>
      </div>
    )
  }

  const clue = state.current_clue
  const foundCount = state.players.filter((p) => p.answered_current_round).length

  // ── Logbook quiz ───────────────────────────────────────────────────────────
  if (step === 'clue' && state.session.clue_mode === 'logbook' && !state.my_answer?.is_correct) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col">
        <GameRoundHeader state={state} foundCount={foundCount} />
        <div className="flex-1 p-6 max-w-md mx-auto w-full">
          <GameQuizRound
            key={state.session.current_round}
            state={state}
            locked={Boolean(state.my_answer)}
            submitting={quizSubmitting}
            onPick={handleQuizPick}
          />
        </div>
      </div>
    )
  }

  // ── Locked out of this plant ───────────────────────────────────────────────
  //
  // Read from the STATE, not from the last scan response, so closing the app
  // and reopening it does not put the scan button back in front of someone who
  // has already used their attempts.
  if (state.my_answer?.locked && !state.my_answer.is_correct) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col">
        <GameRoundHeader state={state} foundCount={foundCount} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="text-red-500"><Glyph name="x" size={48} /></div>
          <p className="text-2xl font-black tracking-wide text-red-500 uppercase">
            {t.game.lockedOutTitle}
          </p>
          <p className="text-sm text-text-muted max-w-xs">{t.game.lockedOutBody}</p>
          {state.session.forfeit && (
            <p className="text-sm font-semibold text-amber-600 max-w-xs">
              {t.game.forfeitLine.replace('{forfeit}', state.session.forfeit)}
            </p>
          )}
          <p className="text-text-muted text-sm">{t.game.waitingForNextRound}</p>
        </div>
      </div>
    )
  }

  // ── Clue → scan ────────────────────────────────────────────────────────────
  if (step === 'clue' && !state.my_answer?.is_correct) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col">
        <GameRoundHeader state={state} foundCount={foundCount} />

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          {state.session.clue_mode === 'name' && clue ? (
            <GameNameClue clue={clue} />
          ) : clue?.clue_photo_url ? (
            <div className="w-full max-w-xs aspect-square rounded-2xl overflow-hidden shadow-lg">
              <img src={clue.clue_photo_url} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-40 h-40 rounded-2xl bg-surface flex items-center justify-center text-text-muted border border-border">
              <Glyph name="sprout" size={44} />
            </div>
          )}

          <div className="text-center space-y-1">
            <p className="text-lg font-semibold text-text">{t.game.findThisPlant}</p>
            {/* Which space to look in — essential once a hunt spans rooms. */}
            {state.session.maps.length > 1 && clue?.map_name && (
              <p className="text-sm text-primary font-medium inline-flex items-center gap-1.5">
                <Glyph name={clue.map_type === 'indoor' ? 'home' : 'sprout'} size={14} />
                {clue.map_name}
              </p>
            )}
          </div>
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

  // ── Already found it this round ────────────────────────────────────────────
  if (step === 'answered' || (step === 'clue' && state.my_answer?.is_correct)) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col">
        <GameRoundHeader state={state} foundCount={foundCount} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="text-green-500"><Glyph name="check" size={48} strokeWidth={2.4} /></div>
          <p className="font-semibold text-text">{t.game.correctScan}</p>
          <p className="text-text-muted text-sm">
            {state.session.pacing === 'race'
              ? t.game.waitingForRoundEnd
              : t.game.waitingForNextRound}
          </p>
          <div className="mt-4 bg-surface rounded-2xl border border-border px-6 py-4 w-full max-w-xs">
            {state.players.slice(0, 5).map((p, i) => (
              <div key={p.id} className="flex justify-between items-center py-1 text-sm">
                <span
                  className={p.id === state.my_player_id ? 'text-primary font-semibold' : 'text-text-muted'}
                >
                  {i === 0 ? t.game.place1 : i === 1 ? t.game.place2 : i === 2 ? t.game.place3 : `${i + 1}.`}{' '}
                  {p.player_name}
                </span>
                <span className="text-text font-semibold">{t.game.pointsShort.replace('{points}', String(p.score))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Scan verdict ───────────────────────────────────────────────────────────
  if (step === 'result' && scanResult) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
        {scanResult.is_correct ? (
          <>
            <div className="text-amber-500"><Glyph name="sparkle" size={52} /></div>
            <p className="text-2xl font-bold text-text">{t.game.correct}</p>
            {scanResult.finish_rank === 1 && (
              <p className="text-sm font-semibold text-amber-600">{t.game.firstToFind}</p>
            )}
            <p className="text-primary font-semibold text-lg">
              {t.game.pointsEarned.replace('{points}', String(scanResult.points_awarded))}
            </p>
            <button
              onClick={() => setStep('answered')}
              className="mt-4 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold"
            >
              {t.game.continue}
            </button>
          </>
        ) : (
          scanResult.locked ? (
            /* Out of scans for this plant. Loud on purpose — the round is over
               for this player and "try again" would be a lie. */
            <>
              <div className="text-red-500"><Glyph name="x" size={48} /></div>
              <p className="text-2xl font-black tracking-wide text-red-500 uppercase">
                {t.game.lockedOutTitle}
              </p>
              <p className="text-sm text-text-muted max-w-xs">{t.game.lockedOutBody}</p>
              {state.session.forfeit && (
                <p className="text-sm font-semibold text-amber-600 max-w-xs">
                  {t.game.forfeitLine.replace('{forfeit}', state.session.forfeit)}
                </p>
              )}
              <p className="text-text-muted text-sm">{t.game.waitingForNextRound}</p>
            </>
          ) : (
            <>
              <div className="text-text-muted/60"><Glyph name="leaf" size={44} /></div>
              <p className="text-lg font-semibold text-text">{t.game.wrongScan}</p>
              {/* Naming what the identifier saw turns a dead end into a hint. */}
              {scanResult.candidates && scanResult.candidates.length > 0 && (
                <p className="text-sm text-text-muted italic">
                  {t.game.weSaw.replace('{name}', scanResult.candidates[0])}
                </p>
              )}
              {/* Say how many scans are left BEFORE they are gone — being cut
                  off without warning reads as a bug, not a rule. */}
              {typeof scanResult.attempts_left === 'number' && (
                <p className="text-sm font-semibold text-amber-600">
                  {scanResult.attempts_left === 1
                    ? t.game.oneAttemptLeft
                    : t.game.attemptsLeft.replace('{count}', String(scanResult.attempts_left))}
                </p>
              )}
              {state.session.clue_mode !== 'logbook' ? (
                <button
                  onClick={() => setStep('camera')}
                  className="mt-4 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold"
                >
                  {t.game.tryAgain}
                </button>
              ) : (
                <p className="text-text-muted text-sm">{t.game.waitingForNextRound}</p>
              )}
            </>
          )
        )}
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-bg flex items-center justify-center">
      <p className="text-text-muted">{t.common.loading}</p>
    </div>
  )
}

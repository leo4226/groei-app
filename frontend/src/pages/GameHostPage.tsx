import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { gameApi, type GameState, type AnswerResult } from '../api/game'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import GameLeaderboard from '../components/game/GameLeaderboard'
import GameQuizRound from '../components/game/GameQuizRound'
import GameRoundHeader from '../components/game/GameRoundHeader'
import GameNameClue from '../components/game/GameNameClue'
import Glyph from '../components/ui/Glyph'
import ReadOnlyWritePage from '../components/ui/ReadOnlyWritePage'
import { useCapabilities } from '../hooks/useCapabilities'
import { QRCodeSVG } from 'qrcode.react'

// The host is a player too, so the round view doubles as their play screen:
// clue + scan, with the answer behind a peek toggle so a playing host isn't
// spoiled but a refereeing host can still nudge stuck guests (#244).
type HostStep = 'waiting' | 'round' | 'camera' | 'analyzing' | 'result' | 'done'

export default function GameHostPage() {
  const t = useT()
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { canEdit } = useCapabilities()
  const [state, setState] = useState<GameState | null>(null)
  const [step, setStep] = useState<HostStep>('waiting')
  const [advancing, setAdvancing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [scanResult, setScanResult] = useState<AnswerResult | null>(null)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [quizSubmitting, setQuizSubmitting] = useState(false)
  const [awarding, setAwarding] = useState<number | null>(null)
  const [togglingPlaying, setTogglingPlaying] = useState(false)
  const activeLang = useFloreren((s) => {
    const user = s.users.find((u) => u.id === s.activeUserId)
    return user?.language === 'en' ? 'en' : 'nl'
  })

  const poll = useCallback(async () => {
    if (!code) return
    try {
      const s = await gameApi.getState(code)
      setState(s)
      if (s.session.status === 'active') {
        setStep((prev) => (prev === 'waiting' ? 'round' : prev))
      }
      if (s.session.status === 'finished') setStep('done')
    } catch {
      // ignore transient errors
    }
  }, [code])

  // Poll only while someone is looking. A phone face-down on the terrace kept
  // asking for game state every two seconds; with nine players that is most of
  // the load on the backend coming from screens nobody can see. Coming back
  // polls once immediately, so you never sit a round behind.
  useEffect(() => {
    const interval = state?.session.pacing === 'race' ? 2000 : 3000
    let id: number | undefined
    const start = () => {
      stop()
      poll()
      id = window.setInterval(poll, interval)
    }
    const stop = () => {
      if (id !== undefined) window.clearInterval(id)
      id = undefined
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [poll, state?.session.pacing])

  const joinUrl = `${window.location.origin}/game?code=${code}`

  async function handleStart() {
    if (!code) return
    setState(await gameApi.start(code))
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

  async function handleAward(playerId: number) {
    if (!code || awarding !== null) return
    setAwarding(playerId)
    try {
      await gameApi.award(code, playerId)
      await poll()
    } catch {
      // Already-correct players 400 here; the poll below resyncs regardless.
    } finally {
      setAwarding(null)
    }
  }

  async function togglePlaying() {
    if (!code || togglingPlaying) return
    setTogglingPlaying(true)
    try {
      const playing = state?.my_player_id != null
      setState(playing ? await gameApi.leave(code) : await gameApi.join(code))
    } catch {
      // The server refuses to empty a game; the next poll resyncs either way.
      await poll()
    } finally {
      setTogglingPlaying(false)
    }
  }

  async function handleCancel() {
    if (!code) return
    try { await gameApi.delete(code) } catch { /* best effort */ }
    navigate('/maps')
  }

  function copyLink() {
    navigator.clipboard.writeText(joinUrl)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  async function handleCapture(blob: Blob) {
    if (!code) return
    setStep('analyzing')
    try {
      const result = await gameApi.scan(code, blob, activeLang)
      setScanResult(result)
      setStep('result')
      poll()
    } catch {
      setStep('round')
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
      // rejected — next poll resyncs
    } finally {
      setQuizSubmitting(false)
    }
  }

  // Hosting a game is an editor-only write surface (creating, starting and
  // advancing rounds all 403 a viewer server-side). A viewer reaching this
  // route directly sees the calm read-only notice instead of a broken host UI.
  if (!canEdit) {
    return <ReadOnlyWritePage onBack={() => navigate('/maps')} />
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
        isHost
        onPlayAgain={() => navigate(`/map/${state.session.map_slug}`)}
        onBackToMap={() => navigate(`/map/${state.session.map_slug}`)}
      />
    )
  }

  // ── Waiting room ───────────────────────────────────────────────────────────
  //
  // Pinned actions over a scrolling middle, rather than one centred column.
  // The player list grows as guests arrive, so a plain column pushes "Start
  // spel" further off the bottom with every person who joins — precisely when
  // the host needs to reach it. Everything above it may scroll; the actions
  // may not.
  if (step === 'waiting') {
    return (
      <div className="h-dvh bg-bg flex flex-col p-6">
       <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
        <div className="min-h-full flex flex-col items-center justify-center space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
            {t.game.joinCode}
          </p>
          <div className="text-6xl font-black tracking-[0.15em] text-primary">{code}</div>
          <p className="text-text-muted text-sm">
            {state.session.maps.map((m) => m.name).join(' · ')}
          </p>
        </div>

        {/* QR — guests scan this rather than typing anything (#242) */}
        <div className="flex flex-col items-center gap-2">
          <div className="bg-white rounded-2xl p-3 border border-border">
            <QRCodeSVG value={joinUrl} size={168} marginSize={0} />
          </div>
          <p className="text-xs text-text-muted">{t.game.scanToJoin}</p>
          <p className="text-xs text-text-muted/70">{t.game.noAccountNeeded}</p>
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
            <div key={p.id} className="flex items-center gap-3 py-1">
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-sm flex items-center justify-center">
                {p.player_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text">{p.player_name}</span>
            </div>
          ))}
        </div>

        {/* Running the party is not the same as playing it: a host holding the
            QR phone can see the answer behind the peek toggle, so being on the
            scoreboard is neither fair nor interesting. Only offered once
            someone else has joined — a hunt with nobody in it has nothing to
            grade, and the server refuses it anyway. */}
        {state.players.length > 1 && (
          <button
            onClick={togglePlaying}
            disabled={togglingPlaying}
            className="text-xs text-text-muted underline underline-offset-4 disabled:opacity-50"
          >
            {state.my_player_id != null ? t.game.sitOut : t.game.joinIn}
          </button>
        )}

        {/* Latecomers can join after the start, so this is a nudge, not a gate. */}
        {state.players.length < 2 && (
          <p className="text-xs text-text-muted text-center max-w-xs">
            {t.game.waitingForPlayersHint}
          </p>
        )}
        </div>
       </div>

        <div className="flex flex-col gap-3 w-full max-w-xs mx-auto flex-shrink-0 pt-4">
          <button
            onClick={handleStart}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-base transition-opacity"
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

  if (step === 'camera') {
    return (
      <IdentifyCamera onCapture={(blob) => handleCapture(blob)} onCancel={() => setStep('round')} />
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
  const roundNum = state.session.current_round + 1
  const totalRounds = state.session.total_rounds
  const foundCount = state.players.filter((p) => p.answered_current_round).length
  const hostAnswered = Boolean(state.my_answer?.is_correct)
  // A host who has stepped out has no player row, so every control that would
  // scan or score on their behalf has to disappear with it — otherwise the
  // scan button 403s with "You have not joined this game".
  const hostIsPlaying = state.my_player_id != null
  const photoMode = state.session.clue_mode === 'photo'
  const logbookMode = state.session.clue_mode === 'logbook'
  const isEN = t.locale?.startsWith('en') ?? false
  const clueName = isEN && clue?.plant_name_en ? clue.plant_name_en : clue?.plant_name_nl
  const altName = isEN ? clue?.plant_name_nl : clue?.plant_name_en

  if (step === 'result' && scanResult) {
    return (
      <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
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
            {scanResult.candidates && scanResult.candidates.length > 0 && (
              <p className="text-sm text-text-muted italic">
                {t.game.weSaw.replace('{name}', scanResult.candidates[0])}
              </p>
            )}
          </>
        )}
        <div className="flex flex-col gap-2 w-full max-w-xs mt-4">
          {!scanResult.is_correct && !logbookMode && (
            <button
              onClick={() => setStep('camera')}
              className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold"
            >
              {t.game.tryAgain}
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

  // Same pinned-action shape as the lobby. The player-status card grows with
  // the party, so at eight guests "Ronde overslaan" drops off the bottom even
  // with the viewport height fixed — the round view has to scroll its middle
  // too, not just be sized correctly.
  return (
    <div className="h-dvh bg-bg flex flex-col">
      <GameRoundHeader state={state} foundCount={foundCount} />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-6 max-w-md mx-auto w-full space-y-5">
        {logbookMode && (
          <GameQuizRound
            key={state.session.current_round}
            state={state}
            locked={Boolean(state.my_answer)}
            submitting={quizSubmitting}
            onPick={handleQuizPick}
          />
        )}

        {/* Clue — the same view the players get, so the host can hunt along */}
        {!logbookMode && clue && (
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
            <div className="flex flex-col items-center gap-2">
              <GameNameClue clue={clue} compact />
              {state.session.maps.length > 1 && clue.map_name && (
                <p className="text-xs text-primary inline-flex items-center gap-1">
                  <Glyph name={clue.map_type === 'indoor' ? 'home' : 'sprout'} size={12} />
                  {clue.map_name}
                </p>
              )}
            </div>
          )
        )}

        {/* Host scan — the host plays too (scan modes only) */}
        {logbookMode || !hostIsPlaying ? null : hostAnswered ? (
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

        {/* Answer peek — photo mode only; elsewhere the clue is the answer */}
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
                <p className="font-semibold text-primary">{clueName}</p>
                {altName && altName !== clueName && (
                  <p className="text-xs text-primary/60">{altName}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Player status — tap the ○ to wave a stuck guest through */}
        <div className="bg-surface rounded-2xl border border-border p-4 space-y-1">
          <p className="text-xs text-text-muted mb-1">{t.game.awardHint}</p>
          {state.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-bg border border-border text-xs font-bold flex items-center justify-center text-text-muted flex-shrink-0">
                  {p.player_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-text truncate">{p.player_name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-text-muted">{t.game.pointsShort.replace('{points}', String(p.score))}</span>
                {p.answered_current_round ? (
                  <Glyph name="check" size={16} className="text-green-500" />
                ) : (
                  <button
                    onClick={() => handleAward(p.id)}
                    disabled={awarding !== null}
                    title={t.game.awardPlayer}
                    aria-label={t.game.awardPlayer.replace('{name}', p.player_name)}
                    className="w-6 h-6 rounded-full border border-border text-text-muted/40 hover:border-primary hover:text-primary transition-colors flex items-center justify-center disabled:opacity-40"
                  >
                    <Glyph name="check" size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>

      <div className="p-6 pt-4 max-w-md mx-auto w-full flex-shrink-0">
        <button
          onClick={handleNext}
          disabled={advancing}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-60 transition-opacity"
        >
          {advancing
            ? t.common.loading
            : roundNum === totalRounds
              ? t.game.endGame
              // "Overslaan" means giving up on a plant you have not found.
              // Once you HAVE found it — or are not playing at all — the same
              // button is simply moving everyone on, and calling that skipping
              // reads as if your own correct answer is about to be thrown away.
              : state.session.pacing === 'race' && hostIsPlaying && !hostAnswered
                ? t.game.skipRound
                : t.game.nextRound}
        </button>
      </div>
    </div>
  )
}

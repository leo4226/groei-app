import { useEffect, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import type { GameState } from '../../api/game'
import Glyph from '../ui/Glyph'

interface Props {
  state: GameState
  /** How many players have already found this round's plant. */
  foundCount: number
}

/**
 * Round chrome shared by the player and host screens: which round we're on, how
 * long is left, and how many people have already found it.
 *
 * The found-counter is what makes a big group's race feel like a race — without
 * it a guest hunting at the far end of the garden has no idea whether they're
 * first or last. The countdown ticks locally between polls but resyncs to the
 * server's `seconds_remaining` on every one, so a wrong phone clock can't buy
 * anyone extra time.
 */
export default function GameRoundHeader({ state, foundCount }: Props) {
  const t = useT()
  const { current_round, total_rounds, seconds_remaining, pacing } = state.session
  const [remaining, setRemaining] = useState<number | null>(seconds_remaining)

  useEffect(() => {
    setRemaining(seconds_remaining)
  }, [seconds_remaining, current_round])

  useEffect(() => {
    if (remaining === null) return
    const id = setInterval(() => {
      setRemaining((r) => (r === null ? null : Math.max(0, r - 1)))
    }, 1000)
    return () => clearInterval(id)
  }, [remaining === null])

  const isRace = pacing === 'race'
  const urgent = remaining !== null && remaining <= 15
  const mmss =
    remaining === null
      ? null
      : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`

  return (
    <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 border-b border-border">
      <p className="text-xs font-mono uppercase tracking-widest text-text-muted whitespace-nowrap">
        {t.game.roundTitle} {current_round + 1} / {total_rounds}
      </p>

      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted inline-flex items-center gap-1 whitespace-nowrap">
          <Glyph name="users" size={13} />
          {t.game.foundCount
            .replace('{found}', String(foundCount))
            .replace('{total}', String(state.players.length))}
        </span>

        {isRace && mmss && (
          <span
            className={`text-sm font-bold font-mono tabular-nums px-2 py-0.5 rounded-md ${
              urgent ? 'bg-red-500/15 text-red-600 animate-pulse' : 'bg-surface text-text-muted'
            }`}
          >
            {mmss}
          </span>
        )}
      </div>
    </div>
  )
}

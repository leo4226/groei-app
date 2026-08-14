import { useMemo, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import type { GameState, GameClue } from '../../api/game'
import Glyph from '../ui/Glyph'

/**
 * Logbook-quiz round (clue_mode 'logbook'). Alternates direction per round:
 * even rounds show a logbook photo → pick the plant name; odd rounds show the
 * name → pick the photo. Options are sampled with a PRNG seeded on the round,
 * so every player sees the same choices. One guess per round (no
 * trial-and-error through the options) — the answer submits the chosen plant's
 * name through the normal answer endpoint.
 */
interface Props {
  state: GameState
  /** Already answered this round (correct or wrong) — options are locked. */
  locked: boolean
  submitting: boolean
  onPick: (plantNameNl: string) => void
}

// Small deterministic PRNG (mulberry32) — the seed is shared by all clients.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededSample<T>(items: T[], count: number, rand: () => number): T[] {
  const pool = [...items]
  const out: T[] = []
  while (pool.length > 0 && out.length < count) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  }
  return out
}

export default function GameQuizRound({ state, locked, submitting, onPick }: Props) {
  const t = useT()
  const isEN = t.locale?.startsWith('en') ?? false
  const clue = state.current_clue
  const roundIdx = state.session.current_round
  const [picked, setPicked] = useState<number | null>(null)

  const displayName = (c: GameClue) => (isEN && c.plant_name_en ? c.plant_name_en : c.plant_name_nl)

  // photo → pick name on even rounds; name → pick photo on odd rounds.
  const direction: 'pick-name' | 'pick-photo' = roundIdx % 2 === 0 ? 'pick-name' : 'pick-photo'

  const options = useMemo(() => {
    if (!clue) return []
    const rand = mulberry32(roundIdx * 2654435761 + state.rounds.length)
    let pool = state.rounds.filter((r) => r.round_index !== clue.round_index)
    if (direction === 'pick-photo') pool = pool.filter((r) => r.clue_photo_url)
    // Answers are graded by plant *name*, so a distractor sharing the target's
    // name would score as correct when tapped. Two hostas both called
    // "Hartlelie" is not a hypothetical in a real garden — drop the collisions.
    const takenNames = new Set([clue.plant_name_nl.toLowerCase()])
    pool = pool.filter((r) => {
      const key = r.plant_name_nl.toLowerCase()
      if (takenNames.has(key)) return false
      takenNames.add(key)
      return true
    })
    const distractors = seededSample(pool, 3, rand)
    return seededSample([clue, ...distractors], distractors.length + 1, rand)
  }, [clue, roundIdx, state.rounds, direction])

  if (!clue) return null

  function handlePick(option: GameClue, index: number) {
    if (locked || submitting || picked !== null) return
    setPicked(index)
    onPick(option.plant_name_nl)
  }

  const disabled = locked || submitting || picked !== null

  return (
    <div className="space-y-4">
      {direction === 'pick-name' ? (
        <>
          {clue.clue_photo_url ? (
            <div className="w-full aspect-square max-h-64 rounded-2xl overflow-hidden shadow-lg mx-auto">
              <img src={clue.clue_photo_url} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-40 h-40 rounded-2xl bg-surface flex items-center justify-center text-text-muted border border-border mx-auto">
              <Glyph name="sprout" size={44} />
            </div>
          )}
          <p className="text-base font-semibold text-text text-center">{t.game.quizWhichPlant}</p>
          <div className="grid grid-cols-1 gap-2">
            {options.map((o, i) => (
              <button
                key={o.round_index}
                onClick={() => handlePick(o, i)}
                disabled={disabled}
                className={`w-full py-3 px-4 rounded-xl border text-sm font-medium text-left transition-colors ${
                  picked === i
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-text hover:bg-bg'
                } disabled:opacity-60`}
              >
                {displayName(o)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-text text-center">
            {t.game.quizWhichPhoto.replace('{name}', displayName(clue))}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {options.map((o, i) => (
              <button
                key={o.round_index}
                onClick={() => handlePick(o, i)}
                disabled={disabled}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                  picked === i ? 'border-primary' : 'border-transparent'
                } disabled:opacity-60`}
              >
                {o.clue_photo_url ? (
                  <img src={o.clue_photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-surface flex items-center justify-center text-text-muted">
                    <Glyph name="sprout" size={32} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {locked && (
        <p className="text-xs text-text-muted text-center flex items-center justify-center gap-1.5">
          <Glyph name="check" size={13} /> {t.game.quizAnswered}
        </p>
      )}
    </div>
  )
}

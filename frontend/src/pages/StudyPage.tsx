import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { studyApi, type StudyNext, type StudyResult } from '../api/study'
import Glyph from '../components/ui/Glyph'

/**
 * Learn the plants in your field guide and your own collection.
 *
 * One card at a time, photo first. New plants are multiple choice; once a card
 * has been practised it asks you to type the name, which is harder and sticks
 * better. Either way the name is revealed after answering — being told "wrong"
 * and nothing else teaches nobody anything.
 *
 * The screen shape is the game's: `h-dvh` with a pinned action, because the
 * same iPhone that hid "Ronde overslaan" under the nav would hide this too.
 */
export default function StudyPage() {
  const t = useT()
  const navigate = useNavigate()
  const [state, setState] = useState<StudyNext | null>(null)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<StudyResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setState(await studyApi.next())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function submit(answer: string) {
    const card = state?.card
    if (!card || submitting) return
    setSubmitting(true)
    try {
      setResult(await studyApi.answer(card.card_id, answer))
    } catch {
      setFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function nextCard() {
    setResult(null)
    setTyped('')
    await load()
    // Typing mode is useless without focus, and a card at a time means the
    // keyboard should never need a second tap.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  if (failed) {
    return (
      <Shell>
        <div className="text-text-muted/60"><Glyph name="leaf" size={44} /></div>
        <p className="font-semibold text-text">{t.common.error}</p>
        <button onClick={load} className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold">
          {t.common.retry}
        </button>
      </Shell>
    )
  }

  if (!state) {
    return <Shell><p className="text-text-muted">{t.common.loading}</p></Shell>
  }

  // Nothing to study is two different situations, and conflating them would
  // send someone off to photograph plants they have already photographed.
  if (!state.card) {
    const caughtUp = state.reason === 'all_caught_up'
    return (
      <Shell>
        <div className={caughtUp ? 'text-amber-500' : 'text-text-muted/60'}>
          <Glyph name={caughtUp ? 'sparkle' : 'camera'} size={48} />
        </div>
        <p className="text-xl font-bold text-text">
          {caughtUp ? t.study.caughtUpTitle : t.study.noMaterialTitle}
        </p>
        <p className="text-sm text-text-muted max-w-xs">
          {caughtUp ? t.study.caughtUpBody : t.study.noMaterialBody}
        </p>
        {caughtUp && (
          <p className="text-xs text-text-muted/80">
            {t.study.learnedCount
              .replace('{learned}', String(state.stats.learned))
              .replace('{total}', String(state.stats.total))}
          </p>
        )}
        <button
          onClick={() => navigate('/plants')}
          className="mt-2 px-6 py-2.5 rounded-full border border-border text-sm text-text-muted"
        >
          {t.study.back}
        </button>
      </Shell>
    )
  }

  const card = state.card

  return (
    <div className="h-dvh bg-bg flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-text-muted p-1 -ml-1">
          <Glyph name="arrow-left" size={18} />
        </button>
        <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
          {t.study.dueCount.replace('{due}', String(state.stats.due))
            .replace('{new}', String(state.stats.new))}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col items-center gap-5">
        {card.photo_url ? (
          <img
            src={card.photo_url}
            alt=""
            className="w-full max-w-xs aspect-square object-cover rounded-2xl shadow-lg"
          />
        ) : (
          <div className="w-40 h-40 rounded-2xl bg-surface border border-border flex items-center justify-center text-text-muted">
            <Glyph name="sprout" size={44} />
          </div>
        )}

        {result ? (
          <div className="w-full max-w-xs text-center space-y-2">
            <p className={`text-lg font-bold ${result.correct ? 'text-primary' : 'text-red-500'}`}>
              {result.correct ? t.study.correct : t.study.wrong}
            </p>
            <p className="text-2xl font-bold text-text">{result.answer.name_nl}</p>
            {result.answer.name_en && (
              <p className="text-sm text-text-muted">{result.answer.name_en}</p>
            )}
            {result.answer.latin && (
              <p className="text-xs text-text-muted/80 italic">{result.answer.latin}</p>
            )}
          </div>
        ) : card.mode === 'choose' ? (
          <div className="w-full max-w-xs space-y-2">
            {(card.options ?? []).map((option) => (
              <button
                key={option}
                onClick={() => submit(option)}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl border border-border bg-surface text-text text-sm font-medium disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="w-full max-w-xs space-y-2"
            onSubmit={(e) => { e.preventDefault(); submit(typed) }}
          >
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t.study.typePlaceholder}
              autoComplete="off"
              autoCapitalize="off"
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text text-sm"
            />
            <p className="text-xs text-text-muted text-center">{t.study.typeHint}</p>
          </form>
        )}
      </div>

      <div className="p-6 pt-3 flex-shrink-0">
        {result ? (
          <button
            onClick={nextCard}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold text-base"
          >
            {t.study.next}
          </button>
        ) : card.mode === 'type' ? (
          <div className="space-y-2">
            <button
              onClick={() => submit(typed)}
              disabled={submitting || !typed.trim()}
              className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold text-base disabled:opacity-40"
            >
              {t.study.check}
            </button>
            {/* "I don't know" is a real answer and a faster route to the name
                than typing something wrong on purpose. */}
            <button
              onClick={() => submit('')}
              disabled={submitting}
              className="w-full py-2 text-sm text-text-muted"
            >
              {t.study.dontKnow}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center space-y-4">
      {children}
    </div>
  )
}

import { useT } from '../../context/LanguageContext'
import type { GameState } from '../../api/game'
import Glyph from '../ui/Glyph'

interface Props {
  state: GameState
  isHost: boolean
  onPlayAgain: () => void
  onBackToMap: () => void
}

function ordinalSuffixEN(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
}

export default function GameLeaderboard({ state, isHost, onPlayAgain, onBackToMap }: Props) {
  const t = useT()
  const isEN = t.locale?.startsWith('en') ?? false

  const sorted = [...state.players].sort((a, b) => b.score - a.score)
  const myRank = state.my_player_id != null
    ? sorted.findIndex((p) => p.id === state.my_player_id) + 1
    : 0

  /**
   * "2 foto · 1 naam" — how the grader accepted each correct answer.
   *
   * Worth reading after a hunt: a round carried by name matches is a round
   * where the target's own photos never decided anything, which is how a
   * red climber once passed as a Scindapsus. Unknown kinds are shown raw
   * rather than dropped, so a new one added server-side is visible here.
   */
  function matchSummary(kinds: Record<string, number>): string {
    const label: Record<string, string> = {
      photo: t.game.matchPhoto,
      exact: t.game.matchName,
      exact_below_threshold: t.game.matchNameNear,
      common: t.game.matchCommon,
      genus: t.game.matchGenus,
      unknown: t.game.matchUnknown,
    }
    return Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => `${n} ${label[kind] ?? kind}`)
      .join(' · ')
  }

  function medal(i: number) {
    if (i === 0) return t.game.place1
    if (i === 1) return t.game.place2
    if (i === 2) return t.game.place3
    return `${i + 1}.`
  }

  function shareText() {
    // Everything here used to be hardcoded Dutch, so an English player copied a
    // Dutch scoreboard with a Dutch date. All of it goes through the catalog now.
    const lines = [
      `🌿 ${t.game.gameName} — ${new Date().toLocaleDateString(isEN ? 'en-GB' : 'nl-NL')}`,
      `${state.session.maps.map((m) => m.name).join(' · ') || state.session.map_name}`
        + ` · ${t.game.roundsCount.replace('{count}', String(state.session.total_rounds))}`,
      '',
      ...sorted.slice(0, 5).map(
        (p, i) => `${medal(i)} ${p.player_name}   ${t.game.pointsShort.replace('{points}', String(p.score))}`,
      ),
      '',
      t.game.hostedBy.replace('{name}', state.session.host_name),
    ]
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 max-w-sm mx-auto space-y-6">
      <div className="text-center space-y-1">
        <div className="flex justify-center mb-2 text-amber-500"><Glyph name="trophy" size={44} /></div>
        <h1 className="text-2xl font-bold text-text">{t.game.gameOver}</h1>
        <p className="text-text-muted text-sm">{state.session.map_name}</p>
      </div>

      <div className="w-full bg-surface rounded-2xl border border-border overflow-hidden">
        {sorted.map((p, i) => {
          const isMe = state.my_player_id != null && p.id === state.my_player_id
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between px-4 py-3 podium-drop ${
                i < sorted.length - 1 ? 'border-b border-border' : ''
              } ${isMe ? 'bg-primary/10' : ''}`}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg w-8 text-center">{medal(i)}</span>
                <span className={`text-sm ${isMe ? 'font-semibold text-primary' : 'text-text'}`}>{p.player_name}</span>
              </div>
              <span className={`font-semibold text-sm ${isMe ? 'text-primary' : 'text-text-muted'}`}>{t.game.pointsShort.replace('{points}', String(p.score))}</span>
            </div>
          )
        })}
      </div>

      {myRank > 0 && (
        <p className="text-sm text-text-muted -mt-2">
          {isEN
            ? t.game.yourPosition.replace('{rank}', String(myRank)).replace('{suffix}', ordinalSuffixEN(myRank))
            : t.game.yourPosition.replace('{rank}', String(myRank))}
        </p>
      )}

      {/* Host-only per-round breakdown: which plants were found fast vs. stumped */}
      {isHost && state.round_stats && state.round_stats.length > 0 && (
        <div className="w-full bg-surface rounded-2xl border border-border p-4 space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-text-muted">{t.game.roundBreakdown}</p>
          {state.round_stats.map((r) => (
            <div key={r.round_index} className="py-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text truncate mr-3">
                  {r.round_index + 1}. {isEN && r.plant_name_en ? r.plant_name_en : r.plant_name_nl}
                </span>
                <span className="text-text-muted whitespace-nowrap">
                  {r.answered_count}/{state.players.length}
                  {r.avg_seconds != null && ` · Ø ${r.avg_seconds}s`}
                </span>
              </div>
              {r.match_kinds && Object.keys(r.match_kinds).length > 0 && (
                <p className="text-xs text-text-muted/80">
                  {t.game.matchHow}: {matchSummary(r.match_kinds)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="w-full space-y-3">
        <button
          onClick={shareText}
          className="w-full py-2.5 rounded-xl border border-border text-sm text-text-muted hover:bg-surface transition-colors flex items-center justify-center gap-2"
        >
          <Glyph name="clipboard" size={15} /> {t.game.shareResults}
        </button>
        {isHost ? (
          <>
            <button
              onClick={onPlayAgain}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm"
            >
              {t.game.newGame2}
            </button>
            <button onClick={onBackToMap} className="w-full py-2 text-sm text-text-muted hover:text-text transition-colors">
              {t.game.backToMap}
            </button>
          </>
        ) : (
          <button onClick={onBackToMap} className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm">
            {t.game.backToMap}
          </button>
        )}
      </div>
    </div>
  )
}

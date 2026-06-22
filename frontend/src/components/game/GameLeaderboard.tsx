import { useT } from '../../context/LanguageContext'
import type { GameState } from '../../api/game'

interface Props {
  state: GameState
  isHost: boolean
  onPlayAgain: () => void
  onBackToMap: () => void
}

export default function GameLeaderboard({ state, isHost, onPlayAgain, onBackToMap }: Props) {
  const t = useT()

  const sorted = [...state.players].sort((a, b) => b.score - a.score)

  function medal(i: number) {
    if (i === 0) return t.game.place1
    if (i === 1) return t.game.place2
    if (i === 2) return t.game.place3
    return `${i + 1}.`
  }

  function shareText() {
    const lines = [
      `🌿 Floreren tuinspel — ${new Date().toLocaleDateString('nl-NL')}`,
      `${state.session.map_name} · ${state.session.total_rounds} rondes`,
      '',
      ...sorted.slice(0, 5).map((p, i) => `${medal(i)} ${p.player_name}   ${p.score} ptn`),
      '',
      t.game.hostedBy.replace('{name}', state.session.host_name),
    ]
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 max-w-sm mx-auto space-y-6">
      <div className="text-center space-y-1">
        <div className="text-5xl mb-2">🏆</div>
        <h1 className="text-2xl font-bold text-text">{t.game.gameOver}</h1>
        <p className="text-text-muted text-sm">{state.session.map_name}</p>
      </div>

      <div className="w-full bg-surface rounded-2xl border border-border overflow-hidden">
        {sorted.map((p, i) => (
          <div
            key={p.account_id}
            className={`flex items-center justify-between px-4 py-3 ${
              i < sorted.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg w-8 text-center">{medal(i)}</span>
              <span className="text-sm text-text">{p.player_name}</span>
            </div>
            <span className="font-semibold text-sm text-text-muted">{p.score} pt</span>
          </div>
        ))}
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={shareText}
          className="w-full py-2.5 rounded-xl border border-border text-sm text-text-muted hover:bg-surface transition-colors flex items-center justify-center gap-2"
        >
          <span>📋</span> {t.game.shareResults}
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

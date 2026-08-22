import { useT } from '../../context/LanguageContext'
import type { GameClue } from '../../api/game'
import Glyph from '../ui/Glyph'

interface Props {
  clue: GameClue
  /** Host screens sit in a denser column than the player's full-screen card. */
  compact?: boolean
}

/**
 * The name clue: all three names of the plant to find.
 *
 * Three, not one, because a garden party is not monolingual and nobody agrees
 * on what a plant is called. The reader's own language leads; the other common
 * name and the Latin follow, so a guest who only knows "Swiss cheese plant",
 * only knows "Gatenplant", or only knows "Monstera deliciosa" can all play the
 * same round.
 *
 * The Latin name reaches the client only in name mode — in photo mode it is
 * the answer, and the server withholds it there rather than trusting this
 * component to hide it.
 */
export default function GameNameClue({ clue, compact = false }: Props) {
  const t = useT()
  const isEN = t.locale?.startsWith('en') ?? false

  const primary = (isEN ? clue.plant_name_en : clue.plant_name_nl) || clue.plant_name_nl
  const secondary = isEN ? clue.plant_name_nl : clue.plant_name_en
  const latin = clue.target_species

  return (
    <div
      className={`w-full bg-surface rounded-2xl border border-border flex flex-col items-center gap-2 ${
        compact ? 'p-5' : 'max-w-xs p-6 shadow-lg'
      }`}
    >
      <Glyph name="leaf" size={compact ? 32 : 44} className="text-primary" />
      <p className={`font-bold text-text text-center ${compact ? 'text-xl' : 'text-2xl'}`}>
        {primary}
      </p>
      {secondary && secondary !== primary && (
        <p className="text-sm text-text-muted text-center">{secondary}</p>
      )}
      {latin && (
        // Italic and muted: it is the same plant said a third way, not a
        // separate fact, and it should not compete with the name people know.
        <p className="text-xs text-text-muted/80 text-center italic">{latin}</p>
      )}
    </div>
  )
}

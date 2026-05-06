import type { WallElement } from '../../types'
import { EIGENSCHAPPEN_NL } from '../../utils/editorStrings.nl'

interface Props {
  element: WallElement
  onUpdate: (updates: Partial<WallElement>) => void
  onDelete: () => void
}

export default function WallElementPropertiesPanel({ element, onUpdate, onDelete }: Props) {
  const isDoor = element.type === 'door'

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          {isDoor ? EIGENSCHAPPEN_NL.deur : EIGENSCHAPPEN_NL.raam}
        </p>
        <button
          onClick={onDelete}
          className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
        >
          {EIGENSCHAPPEN_NL.verwijderen}
        </button>
      </div>
      {/* Width */}
      <div className="mb-2">
        <label className="text-xs text-text-muted block mb-1">Breedte (cm)</label>
        <input
          type="number" min="40" max="300" step="10"
          value={element.widthCm}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (v > 0) onUpdate({ widthCm: v })
          }}
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
        />
      </div>

      {/* Door-specific: swing side + direction */}
      {isDoor && (
        <>
          <div className="mb-2">
            <label className="text-xs text-text-muted block mb-1">Scharnier</label>
            <div className="flex gap-1">
              <button
                onClick={() => onUpdate({ swingSide: 'left' })}
                className={`flex-1 text-xs py-1.5 rounded-lg border ${
                  element.swingSide === 'left'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-bg text-text-muted border-border'
                }`}
              >
                Links
              </button>
              <button
                onClick={() => onUpdate({ swingSide: 'right' })}
                className={`flex-1 text-xs py-1.5 rounded-lg border ${
                  element.swingSide === 'right'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-bg text-text-muted border-border'
                }`}
              >
                Rechts
              </button>
            </div>
          </div>
          <div className="mb-1">
            <label className="text-xs text-text-muted block mb-1">Draairichting</label>
            <div className="flex gap-1">
              <button
                onClick={() => onUpdate({ swingDirection: 'inward' })}
                className={`flex-1 text-xs py-1.5 rounded-lg border ${
                  element.swingDirection === 'inward'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-bg text-text-muted border-border'
                }`}
              >
                Naar binnen
              </button>
              <button
                onClick={() => onUpdate({ swingDirection: 'outward' })}
                className={`flex-1 text-xs py-1.5 rounded-lg border ${
                  element.swingDirection === 'outward'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-bg text-text-muted border-border'
                }`}
              >
                Naar buiten
              </button>
            </div>
          </div>
        </>
      )}

      <p className="text-[10px] text-text-muted mt-2">
        {element.edge} · positie {Math.round(element.position * 100)}%
      </p>
    </div>
  )
}

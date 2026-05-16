import type { MapObject } from '../../types'

interface Props {
  object: MapObject
  onRotate: (rotation: number) => void
  onDelete: () => void
}

export default function ObjectPropertiesPanel({ object, onRotate, onDelete }: Props) {
  const rotation = object.rotation ?? 0

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide truncate">
          {object.name}
        </p>
        <button
          onClick={onDelete}
          className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5 shrink-0"
        >
          Verwijderen
        </button>
      </div>

      <div>
        <label className="text-xs text-text-muted block mb-1">
          Rotatie&ensp;<span className="font-semibold text-text">{Math.round(rotation)}°</span>
        </label>
        <input
          type="range"
          min="0"
          max="355"
          step="5"
          value={Math.round(rotation)}
          onChange={(e) => onRotate(parseInt(e.target.value))}
          className="w-full accent-primary mb-2"
        />
        <div className="flex gap-1">
          <button
            onClick={() => onRotate(((rotation - 45) % 360 + 360) % 360)}
            className="flex-1 text-xs py-1 rounded-lg border border-border bg-bg text-text-muted hover:bg-border"
          >
            −45°
          </button>
          <button
            onClick={() => onRotate(0)}
            className="flex-1 text-xs py-1 rounded-lg border border-border bg-bg text-text-muted hover:bg-border"
          >
            Reset
          </button>
          <button
            onClick={() => onRotate((rotation + 45) % 360)}
            className="flex-1 text-xs py-1 rounded-lg border border-border bg-bg text-text-muted hover:bg-border"
          >
            +45°
          </button>
        </div>
      </div>
    </div>
  )
}

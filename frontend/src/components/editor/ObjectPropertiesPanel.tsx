import type { MapObject } from '../../types'
import { useT } from '../../context/LanguageContext'
import { parseCm } from './objectDimensions'

interface Props {
  object: MapObject
  onRotate: (rotation: number) => void
  onResize: (dims: { width_cm?: number; depth_cm?: number; diameter_cm?: number }) => void
  onDelete: () => void
}

export default function ObjectPropertiesPanel({ object, onRotate, onResize, onDelete }: Props) {
  const t = useT()
  const rotation = object.rotation ?? 0
  const isRound = object.shape === 'circle'

  // A table, shed or pot placed from the palette was stuck at its preset
  // dimensions forever: this panel offered rotate and delete only, while
  // width_cm/depth_cm/diameter_cm were sent once at create time and never
  // again. The backend has always accepted them on PUT /objects/{id}.
  const sizeField = (
    key: 'width_cm' | 'depth_cm' | 'diameter_cm',
    label: string,
  ) => (
    <div className="flex-1">
      <label className="text-xs text-text-muted block mb-1">{label}</label>
      <input
        type="number" inputMode="numeric" min="1" step="1"
        value={object[key] ?? ''}
        onChange={(e) => {
          const cm = parseCm(e.target.value)
          if (cm !== undefined) onResize({ [key]: cm ?? undefined })
        }}
        className="w-full border border-border rounded-lg px-2.5 py-2.5 text-base bg-bg text-text"
      />
    </div>
  )

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
          {t.common.delete}
        </button>
      </div>

      {/* Size */}
      <div className="flex gap-2 mb-3">
        {isRound
          ? sizeField('diameter_cm', t.editor.props.diameterCm)
          : (
            <>
              {sizeField('width_cm', t.editor.props.widthCm)}
              {sizeField('depth_cm', t.editor.props.depthCm)}
            </>
          )}
      </div>

      <div>
        <label className="text-xs text-text-muted block mb-1">
          {t.editor.props.rotation}&ensp;<span className="font-semibold text-text">{`${Math.round(rotation)}°`}</span>
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
            {'−45°'}
          </button>
          <button
            onClick={() => onRotate(0)}
            className="flex-1 text-xs py-1 rounded-lg border border-border bg-bg text-text-muted hover:bg-border"
          >
            {t.editor.props.reset}
          </button>
          <button
            onClick={() => onRotate((rotation + 45) % 360)}
            className="flex-1 text-xs py-1 rounded-lg border border-border bg-bg text-text-muted hover:bg-border"
          >
            {'+45°'}
          </button>
        </div>
      </div>
    </div>
  )
}

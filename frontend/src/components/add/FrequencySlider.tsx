import { useRef, useCallback, useState, useEffect } from 'react'

interface FrequencySliderProps {
  label: string
  value: number // days between watering (e.g. 7)
  min?: number // default 1
  max?: number // default 30
  presets?: { label: string; value: number }[] // quick-selects
  onChange: (value: number) => void
  className?: string
}

const defaultPresets = [
  { label: 'Soms', value: 14 },
  { label: 'Wekelijks', value: 7 },
  { label: '2× p/w', value: 3 },
  { label: 'Dagelijks', value: 1 },
]

export default function FrequencySlider({
  label,
  value,
  min = 1,
  max = 30,
  presets = defaultPresets,
  onChange,
  className = '',
}: FrequencySliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const fraction = (value - min) / (max - min)
  const percent = Math.round(fraction * 100)

  const valueToLabel = (v: number) =>
    v === 1 ? 'Om de dag' : `Elke ${v} dagen`

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return value
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return Math.round(min + ratio * (max - min))
    },
    [value, min, max]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only start drag if not on a preset chip
      const target = e.target as HTMLElement
      if (target.closest('[data-preset]')) return
      e.preventDefault()
      setDragging(true)
      const newVal = valueFromClientX(e.clientX)
      onChange(newVal)
    },
    [onChange, valueFromClientX]
  )

  useEffect(() => {
    if (!dragging) return

    const onPointerMove = (e: PointerEvent) => {
      const newVal = valueFromClientX(e.clientX)
      onChange(newVal)
    }
    const onPointerUp = () => setDragging(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragging, onChange, valueFromClientX])

  return (
    <div className={`${className}`}>
      {/* Label row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-heading text-sm font-medium text-text">
          {label}
        </span>
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 font-mono text-[11px] text-primary">
          {valueToLabel(value)}
        </span>
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        className="relative h-10 flex items-center cursor-pointer touch-none select-none"
      >
        {/* Background track */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-border" />

        {/* Filled track */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-primary transition-[width] duration-75"
          style={{ width: `${percent}%` }}
        />

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-md transition-[left] duration-75"
          style={{ left: `calc(${percent}% - 6px)` }}
        />

        {/* Preset markers */}
        {presets.map((p) => {
          const pct = ((p.value - min) / (max - min)) * 100
          // Only show markers for presets not at the edges to avoid visual clutter
          if (pct <= 0 || pct >= 100) return null
          return (
            <div
              key={p.value}
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-border pointer-events-none"
              style={{ left: `${pct}%` }}
            />
          )
        })}
      </div>

      {/* Preset chips */}
      <div className="flex items-center gap-2 mt-1.5">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            data-preset="true"
            onClick={() => onChange(p.value)}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition-all ${
              value === p.value
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-paper border-border text-text-muted hover:border-text-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

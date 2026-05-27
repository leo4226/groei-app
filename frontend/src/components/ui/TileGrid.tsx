import type { ReactNode } from 'react'

interface TileOption {
  id: string
  glyph?: ReactNode
  title: string
  subtitle?: string
}

interface TileGridProps {
  options: TileOption[]
  value: string | null
  onChange: (id: string) => void
  /** Allow multiple selections (checkbox behavior) */
  multi?: boolean
  selected?: string[]
  className?: string
}

export default function TileGrid({
  options,
  value,
  onChange,
  multi,
  selected = [],
  className = '',
}: TileGridProps) {
  const isSelected = (id: string) =>
    multi ? selected.includes(id) : value === id

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 ${className}`}>
      {options.map((opt) => {
        const on = isSelected(opt.id)
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`
              flex items-center gap-3 rounded-xl border p-3 text-left
              transition-all duration-150
              ${on
                ? 'bg-primary/5 border-primary shadow-[0_0_0_1px_var(--color-primary)]'
                : 'bg-paper border-border hover:border-text-muted'
              }
            `}
          >
            {opt.glyph && (
              <span className="shrink-0 text-xl leading-none">{opt.glyph}</span>
            )}
            <div className="min-w-0">
              <div className="font-heading text-sm font-medium text-text">
                {opt.title}
              </div>
              {opt.subtitle && (
                <div className="text-[11px] text-text-muted mt-0.5 leading-tight">
                  {opt.subtitle}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

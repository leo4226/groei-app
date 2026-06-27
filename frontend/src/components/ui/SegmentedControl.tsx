interface SegmentOption {
  id: string
  label: string
}

interface SegmentedControlProps {
  options: SegmentOption[]
  value: string | null
  onChange: (id: string) => void
  className?: string
}

export default function SegmentedControl({
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps) {
  return (
    <div className={`flex w-full rounded-lg border border-border bg-bg p-0.5 ${className}`}>
      {options.map((opt, i) => {
        const on = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`
              font-heading text-[11px] sm:text-sm px-2 sm:px-3.5 py-1.5 rounded-md flex-1 min-w-0 truncate
              transition-all duration-150
              ${on
                ? 'bg-paper text-text shadow-sm font-medium'
                : 'text-text-soft hover:text-text'
              }
              ${i > 0 ? '-ml-px' : ''}
            `}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

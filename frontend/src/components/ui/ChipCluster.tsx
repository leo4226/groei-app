interface ChipClusterProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
}

export default function ChipCluster({
  options,
  selected,
  onChange,
  className = '',
}: ChipClusterProps) {
  const toggle = (chip: string) => {
    if (selected.includes(chip)) {
      onChange(selected.filter((s) => s !== chip))
    } else {
      onChange([...selected, chip])
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((chip) => {
        const on = selected.includes(chip)
        return (
          <button
            key={chip}
            type="button"
            onClick={() => toggle(chip)}
            className={`
              font-heading text-sm rounded-full border px-3 py-1.5
              transition-all duration-150
              ${on
                ? 'bg-primary/10 border-primary text-primary font-medium'
                : 'bg-paper border-border text-text-soft hover:border-text-muted'
              }
            `}
          >
            {on && <span className="mr-1">✓</span>}
            {chip}
          </button>
        )
      })}
    </div>
  )
}

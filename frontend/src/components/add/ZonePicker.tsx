import Glyph from '../ui/Glyph'

interface Zone {
  id: string
  name: string
  description?: string
  plantCount?: number
  isIndoor: boolean
}

interface ZonePickerTranslations {
  plantsLabel: (n: number) => string
}

interface ZonePickerProps {
  zones?: Zone[]
  value: string | null
  onChange: (id: string) => void
  advice?: string
  className?: string
  translations?: ZonePickerTranslations
}

export const DEFAULT_ZONES: Zone[] = [
  { id: 'binnen-woonkamer', name: 'Woonkamer', description: 'Binnen · raam west · 19-22°C', plantCount: 5, isIndoor: true },
  { id: 'binnen-slaapkamer', name: 'Slaapkamer', description: 'Binnen · raam oost · 17-20°C', plantCount: 3, isIndoor: true },
  { id: 'buiten-a', name: 'Tuin zone A', description: 'Buiten · volle zon · ochtend', plantCount: 7, isIndoor: false },
  { id: 'buiten-b', name: 'Tuin zone B', description: 'Buiten · halfschaduw · middag', plantCount: 4, isIndoor: false },
]

export default function ZonePicker({
  zones = DEFAULT_ZONES,
  value,
  onChange,
  advice,
  className = '',
}: ZonePickerProps) {
  const selectedZone = zones.find(z => z.id === value)

  // Sort: indoor first if a zone is selected and it's indoor, or no selection → indoor first
  const indoorFirst = !selectedZone || selectedZone.isIndoor
  const sortedZones = [...zones].sort((a, b) => {
    if (a.isIndoor !== b.isIndoor) {
      return indoorFirst ? (a.isIndoor ? -1 : 1) : (b.isIndoor ? -1 : 1)
    }
    return 0
  })

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        {sortedZones.map((zone) => {
          const isActive = value === zone.id
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onChange(zone.id)}
              className={`
                grid grid-cols-[44px_1fr_auto] gap-3 items-center
                rounded-lg border p-3 text-left
                transition-all duration-150
                ${isActive
                  ? 'bg-primary/5 border-primary shadow-[0_0_0_1px_var(--color-primary)]'
                  : 'bg-paper border-border hover:border-text-muted cursor-pointer'
                }
              `}
            >
              {/* Colored square */}
              <div
                className="w-[44px] h-[36px] rounded-md border border-border-soft relative overflow-hidden shrink-0"
                style={{
                  background: zone.isIndoor
                    ? 'linear-gradient(135deg, #F5EFE0, #E5DCC3)'
                    : 'radial-gradient(ellipse at 30% 40%, rgba(143,168,130,0.45) 0%, rgba(143,168,130,0) 60%), linear-gradient(135deg, #F0E8D2 0%, #E5DCC3 100%)',
                }}
              >
                {/* Grid pattern */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: zone.isIndoor
                      ? 'linear-gradient(0deg, transparent 50%, rgba(74,90,71,0.08) 50%), linear-gradient(90deg, transparent 50%, rgba(74,90,71,0.08) 50%)'
                      : 'linear-gradient(0deg, rgba(74,90,71,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(74,90,71,0.06) 1px, transparent 1px)',
                    backgroundSize: zone.isIndoor ? '14px 14px' : '8px 8px',
                  }}
                />
                {/* Dot */}
                <div
                  className="absolute w-2 h-2 rounded-full bg-primary-highlight border-1.5 border-paper shadow-sm"
                  style={{
                    left: zone.isIndoor ? '50%' : '20%',
                    top: zone.isIndoor ? '50%' : '30%',
                    transform: zone.isIndoor ? 'translate(-50%, -50%)' : undefined,
                  }}
                />
              </div>

              <div className="min-w-0">
                <div className="font-heading text-sm text-text leading-tight">
                  {zone.name}
                </div>
                {zone.description && (
                  <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted mt-0.5">
                    {zone.description}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {advice && (
        <div className="mt-3 bg-bg rounded-lg p-3 text-xs text-text-soft italic flex gap-2 items-start">
          <Glyph name="sparkle" size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--color-due)' }} />
          <span>{advice}</span>
        </div>
      )}
    </div>
  )
}

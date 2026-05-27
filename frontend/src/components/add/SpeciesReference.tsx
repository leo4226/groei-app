interface SpeciesReferenceProps {
  /** Display name (e.g. Dutch name or genus) */
  species: string
  /** Full scientific name (e.g. "Phalaenopsis amabilis") */
  scientificName?: string
  /** Care notes or description from database */
  description?: string
  /** Optional image URL */
  imageUrl?: string
  /** Water interval from schedules */
  waterDays?: number
  /** Light level ID */
  lightLevel?: string
  /** Feeding schedule */
  nutriment?: string
  className?: string
}

const lightLevelLabels: Record<string, string> = {
  dark: 'Donker',
  shade: 'Schaduw',
  indirect: 'Indirect',
  bright: 'Helder',
  'full-sun': 'Vol zon',
  full_sun: 'Vol zon',
  partial_sun: 'Halfzon',
}

const feedingLabels: Record<string, string> = {
  weekly: 'Wekelijks',
  monthly: 'Maandelijks',
  seasonal: 'Seizoens',
  optional: 'Optioneel',
}

export default function SpeciesReference({
  species,
  scientificName,
  description,
  imageUrl: _imageUrl,
  waterDays,
  lightLevel,
  nutriment,
  className = '',
}: SpeciesReferenceProps) {
  const hasQuickFacts = waterDays || lightLevel || nutriment

  return (
    <section className={`bg-paper border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-border-soft">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary-highlight mb-1">
          § Naslag
        </div>
        <h2 className="font-heading text-xl font-medium text-text leading-snug">
          Soortprofiel.
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Uit de Floreren-database — bron voor de standaardinstellingen hierboven.
        </p>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Species header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl shrink-0">
            🌸
          </div>
          <div className="min-w-0">
            <div className="font-heading text-sm text-text truncate">{species}</div>
            <div className="font-heading italic text-xs text-text-soft truncate">
              {scientificName || '—'}
            </div>
          </div>
        </div>

        {/* Description (truncated) */}
        {description && (
          <p className="text-xs text-text-muted leading-relaxed line-clamp-3">
            {description}
          </p>
        )}

        {/* Quick facts */}
        {hasQuickFacts && (
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            {waterDays ? (
              <div className="flex items-center gap-1.5">
                <span className="text-primary text-xs">💧</span>
                <span className="text-text-soft">Elke {waterDays} dagen</span>
              </div>
            ) : null}
            {lightLevel && lightLevelLabels[lightLevel] ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs">☀️</span>
                <span className="text-text-soft">{lightLevelLabels[lightLevel]}</span>
              </div>
            ) : null}
            {nutriment && feedingLabels[nutriment] ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💪</span>
                <span className="text-text-soft">{feedingLabels[nutriment]}</span>
              </div>
            ) : null}
          </div>
        )}

        {/* Link to full species page */}
        <a
          href={`/database/${encodeURIComponent(species)}`}
          className="inline-block font-heading text-xs text-primary hover:underline pt-1"
        >
          Volledig profiel →
        </a>
      </div>
    </section>
  )
}

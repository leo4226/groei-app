import type { PlantIdCandidate } from '../../types'
import Glyph, { type GlyphName } from '../ui/Glyph'
import { useT } from '../../context/LanguageContext'

export interface EntryBannerProps {
  activeRoute: 'database' | 'photo'
  onRouteChange: (route: 'database' | 'photo') => void
  // Database route data
  speciesCount?: number
  selectedSpeciesName?: string
  selectedSpeciesScientific?: string
  selectedSpeciesIcon?: string
  /** Open the species picker. Without it the database panel has nothing to offer. */
  onBrowseSpecies?: () => void
  /** Start the photo-ID flow. Without it the photo panel has nothing to offer. */
  onIdentifyWithPhoto?: () => void
  // Photo route data (from identify)
  photoPreview?: string | null
  identifyResult?: {
    topMatch: PlantIdCandidate
    alternatives?: PlantIdCandidate[]
    stats?: { databaseSize: number; imageRefs: number }
  }
}

export default function EntryBanner({
  activeRoute,
  onRouteChange,
  speciesCount,
  selectedSpeciesName,
  selectedSpeciesScientific,
  selectedSpeciesIcon,
  onBrowseSpecies,
  onIdentifyWithPhoto,
  photoPreview,
  identifyResult,
}: EntryBannerProps) {
  const t = useT()

  const fmtNum = (n: number): string =>
    n.toLocaleString(t.locale).replace(/,/g, ' ')

  const isDb = activeRoute === 'database'
  const isPhoto = activeRoute === 'photo'

  // Shared tab icon + content block
  const TabButton = ({
    route,
    icon,
    label,
    subtitle,
  }: {
    route: 'database' | 'photo'
    icon: GlyphName
    label: string
    subtitle: string
  }) => {
    const active = activeRoute === route
    return (
      <button
        type="button"
        onClick={() => onRouteChange(route)}
        className={[
          'border rounded-xl p-4',
          'flex items-start gap-3.5 text-left',
          'transition-colors',
          active
            ? 'bg-primary/5 border-primary shadow-[0_0_0_1px_var(--color-primary)]'
            : 'bg-paper border-border hover:border-text-muted cursor-pointer',
        ].join(' ')}
      >
        {/* Icon */}
        <div
          className={[
            'w-[38px] h-[38px] rounded-lg flex items-center justify-center flex-shrink-0 border',
            active
              ? 'bg-gradient-to-br from-primary/20 to-primary-dark/20 border-primary/30 text-primary'
              : 'bg-gradient-to-br from-[#FDFAF1] to-[#EDE5D1] border-border-soft text-text-soft',
          ].join(' ')}
        >
          <Glyph name={icon} size={18} />
        </div>
        {/* Text block */}
        <div className="min-w-0">
          <div
            className={[
              'font-mono text-[10px] uppercase tracking-[0.22em] mb-0.5',
              active ? 'text-primary' : 'text-text-muted',
            ].join(' ')}
          >
            {label}
          </div>
          <div className="font-heading text-[15px] leading-tight text-text">
            {subtitle}
          </div>
        </div>
      </button>
    )
  }

  // Build database subtitle
  const dbSubtitle = speciesCount
    ? t.addPlant.banner.dbSubtitleCount(fmtNum(speciesCount))
    : t.addPlant.banner.dbSubtitle

  // Build photo subtitle
  const photoSubtitle = t.addPlant.banner.photoSubtitle

  // ── Body: Database route ──
  const DatabaseBody = () => {
    if (selectedSpeciesName) {
      return (
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start p-4 sm:p-6">
          {/* Large species icon */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary/15 to-primary-dark/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-4xl sm:text-5xl leading-none text-primary/70">
              {selectedSpeciesIcon || <Glyph name="leaf" size={44} />}
            </span>
          </div>

          {/* ID card */}
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary mb-1">
              {t.addPlant.banner.selected}
            </div>
            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-medium leading-[1.05] tracking-[-0.015em] text-text m-0 mb-1">
              {selectedSpeciesName}
            </h2>
            {selectedSpeciesScientific && (
              <div className="font-heading italic text-base sm:text-lg text-text-soft">
                {selectedSpeciesScientific}
              </div>
            )}

            {onBrowseSpecies && (
              <button
                type="button"
                onClick={onBrowseSpecies}
                className="mt-3 inline-flex items-center gap-1.5 font-heading text-sm text-primary hover:underline"
              >
                <Glyph name="search" size={15} />
                {t.addPlant.banner.changeSpecies}
              </button>
            )}
          </div>
        </div>
      )
    }

    // No species selected yet — prompt to browse. The prompt is the button:
    // it used to be inert text inviting an action it could not perform.
    const Wrapper = onBrowseSpecies ? 'button' : 'div'
    return (
      <Wrapper
        {...(onBrowseSpecies
          ? { type: 'button' as const, onClick: onBrowseSpecies }
          : {})}
        className={`w-full p-4 sm:p-6 flex items-center gap-4 text-left ${
          onBrowseSpecies ? 'hover:bg-primary/5 transition-colors cursor-pointer' : ''
        }`}
      >
        <div className="w-12 h-12 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
          <Glyph name="search" size={22} />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted mb-0.5">
            {t.addPlant.banner.pickSpecies}
          </div>
          <div className="font-heading text-base text-text">
            {speciesCount
              ? t.addPlant.banner.browseCount(fmtNum(speciesCount))
              : t.addPlant.banner.browsePrompt}
          </div>
        </div>
      </Wrapper>
    )
  }

  // ── Body: Photo route ──
  const PhotoBody = () => {
    if (photoPreview && identifyResult) {
      const { topMatch, alternatives, stats } = identifyResult
      const confidencePct = Math.round(topMatch.confidence * 1000) / 10

      return (
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start p-4 sm:p-6">
          {/* Photo preview with focus corners */}
          <div className="relative w-full max-w-[220px] aspect-square rounded-md border border-border overflow-hidden bg-[repeating-linear-gradient(45deg,transparent_0_8px,rgba(74,90,71,.06)_8px_9px),linear-gradient(135deg,#E8E0CC_0%,#D6CDB6_100%)] flex-shrink-0">
            <img
              src={photoPreview}
              alt={t.addPlant.banner.photoAlt}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Focus corners */}
            <div className="absolute top-[22px] left-[22px] w-[22px] h-[22px] border-t-2 border-l-2 border-secondary pointer-events-none rounded-tl-sm" />
            <div className="absolute top-[22px] right-[22px] w-[22px] h-[22px] border-t-2 border-r-2 border-secondary pointer-events-none rounded-tr-sm" />
            <div className="absolute bottom-[22px] left-[22px] w-[22px] h-[22px] border-b-2 border-l-2 border-secondary pointer-events-none rounded-bl-sm" />
            <div className="absolute bottom-[22px] right-[22px] w-[22px] h-[22px] border-b-2 border-r-2 border-secondary pointer-events-none rounded-br-sm" />
            {/* Label */}
            <div className="absolute bottom-3 left-3 font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted bg-paper/90 px-2 py-1 rounded border border-border">
              {t.addPlant.banner.photoLabel}
            </div>
          </div>

          {/* ID card */}
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary mb-1">
              {t.addPlant.banner.match}
            </div>
            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-medium leading-[1.05] tracking-[-0.015em] text-text m-0 mb-1">
              {(t.locale.startsWith('en')
                ? topMatch.common_names_en?.[0] || topMatch.common_names_nl?.[0]
                : topMatch.common_names_nl?.[0] || topMatch.common_names_en?.[0]
              ) || topMatch.scientific_name}
            </h2>
            <div className="font-heading italic text-base sm:text-lg text-text-soft mb-3">
              {topMatch.scientific_name}
            </div>

            {/* Meta stats */}
            <div className="flex gap-5 sm:gap-6 flex-wrap">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted block">
                  {t.addPlant.banner.confidence}
                </span>
                <span className="font-heading text-base text-text">
                  <em className="text-secondary not-italic font-medium">{confidencePct}%</em>
                </span>
              </div>
              {stats && (
                <>
                  <div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted block">
                      {t.addPlant.banner.database}
                    </span>
                    <span className="font-heading text-base text-text">
                      {t.addPlant.banner.speciesCount(fmtNum(stats.databaseSize))}
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted block">
                      {t.addPlant.banner.imageRefs}
                    </span>
                    <span className="font-heading text-base text-text">
                      {fmtNum(stats.imageRefs)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Alternatives */}
            {alternatives && alternatives.length > 0 && (
              <div className="mt-4">
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted mb-2">
                  {t.addPlant.banner.alternatives}
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                  {alternatives.map((alt, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 border border-border rounded px-3 py-2 bg-paper text-center min-w-[80px]"
                    >
                      <div className="font-heading text-xs text-text leading-tight truncate max-w-[72px]">
                        {(t.locale.startsWith('en')
                          ? alt.common_names_en?.[0] || alt.common_names_nl?.[0]
                          : alt.common_names_nl?.[0] || alt.common_names_en?.[0]
                        ) || alt.scientific_name.split(' ')[0]}
                      </div>
                      <div className="font-mono text-[10px] text-text-muted mt-0.5">
                        {Math.round(alt.confidence * 1000) / 10}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    // No photo yet — the prompt starts the identify flow rather than merely
    // describing it.
    const Wrapper = onIdentifyWithPhoto ? 'button' : 'div'
    return (
      <Wrapper
        {...(onIdentifyWithPhoto
          ? { type: 'button' as const, onClick: onIdentifyWithPhoto }
          : {})}
        className={`w-full p-4 sm:p-6 flex items-center gap-4 text-left ${
          onIdentifyWithPhoto ? 'hover:bg-primary/5 transition-colors cursor-pointer' : ''
        }`}
      >
        <div className="w-12 h-12 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
          <Glyph name="camera" size={22} />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted mb-0.5">
            {t.addPlant.banner.uploadPhoto}
          </div>
          <div className="font-heading text-base text-text">
            {t.addPlant.banner.uploadPhotoPrompt}
          </div>
        </div>
      </Wrapper>
    )
  }

  return (
    <div className="space-y-5 mb-6">
      {/* Tab header */}
      <div className="bg-paper border border-border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(31,42,30,0.04)]">
        {/* Tab grid */}
        <div className="grid grid-cols-2 border-b border-border">
          <TabButton
            route="database"
            icon="book"
            label={t.addPlant.banner.tabDatabase}
            subtitle={dbSubtitle}
          />
          <TabButton
            route="photo"
            icon="camera"
            label={t.addPlant.banner.tabPhoto}
            subtitle={photoSubtitle}
          />
        </div>

        {/* Body panel */}
        {isDb && <DatabaseBody />}
        {isPhoto && <PhotoBody />}
      </div>
    </div>
  )
}

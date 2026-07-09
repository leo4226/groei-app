import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { maps as mapsApi } from '../api/client'
import { useT } from '../context/LanguageContext'
import type { GardenBiodiversityOut, GardenSuggestionsOut } from '../types'

/**
 * Small line glyphs for biodiversity stats, in the app's icon language
 * (thin stroke, rounded caps, currentColor) — replacing the old emoji
 * (🐝/🇳🇱/🌿/⚠️). Tint via the parent's text colour.
 */
type BioGlyph = 'pollinator' | 'native' | 'diversity' | 'invasive'

function BioIcon({ name, size = 13 }: { name: BioGlyph; size?: number }) {
  const glyph = {
    // flower / bloom
    pollinator: (
      <>
        <circle cx="12" cy="6.6" r="2.2" />
        <circle cx="12" cy="17.4" r="2.2" />
        <circle cx="6.6" cy="12" r="2.2" />
        <circle cx="17.4" cy="12" r="2.2" />
        <circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" />
      </>
    ),
    // leaf
    native: (
      <>
        <path d="M5 19C5 11 9.5 6 19 5c0 9.5-4.5 14-14 14z" />
        <path d="M5.5 18.5C8.5 13 12 9.5 16 8" />
      </>
    ),
    // three seeds — variety of species
    diversity: (
      <>
        <circle cx="8" cy="8.5" r="1.7" />
        <circle cx="16" cy="8.5" r="1.7" />
        <circle cx="12" cy="15.5" r="1.7" />
      </>
    ),
    // warning triangle
    invasive: (
      <>
        <path d="M12 4 21 19H3z" />
        <path d="M12 10v4" />
        <circle cx="12" cy="16.8" r="0.7" fill="currentColor" stroke="none" />
      </>
    ),
  }[name]

  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="inline-block shrink-0"
    >
      {glyph}
    </svg>
  )
}

interface Props {
  slug: string
  mode?: 'pill' | 'card'  // default: 'card'
  onModalOpenChange?: (open: boolean) => void
}

const RING_BG = 'var(--color-border-soft)'
const SCORE_COLORS = {
  high:   'var(--color-good)',     // ≥ 60
  medium: 'var(--color-due)',      // 30..59
  low:    'var(--color-overdue)',  // < 30
}

function scoreColor(score: number): string {
  if (score >= 60) return SCORE_COLORS.high
  if (score >= 30) return SCORE_COLORS.medium
  return SCORE_COLORS.low
}

function BigScoreRing({ score }: { score: number }) {
  const r = 36
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c
  const color = scoreColor(score)
  return (
    <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke={RING_BG} strokeWidth="7" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-heading text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">/ 100</span>
      </div>
    </div>
  )
}

function MonthCoverage({ months, locale }: { months: boolean[]; locale: string }) {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'narrow' })
  return (
    <div className="flex gap-1 mt-1">
      {months.map((covered, i) => {
        const label = fmt.format(new Date(2026, i, 1))
        return (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className="w-full h-3 rounded-sm"
              style={{
                background: covered ? 'var(--color-good)' : 'var(--color-border)',
                opacity: covered ? 1 : 0.5,
              }}
              title={label}
            />
            <span className="text-[9px] text-text-muted mt-0.5">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

const MONTH_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

function GardenBiodiversityCardFull({ data, slug, embedded }: { data: GardenBiodiversityOut; slug: string; embedded?: boolean }) {
  const t = useT()
  const [suggestions, setSuggestions] = useState<GardenSuggestionsOut | null>(null)

  useEffect(() => {
    if (!slug) return
    mapsApi.plantSuggestions(slug).then(setSuggestions).catch(() => {})
  }, [slug])

  const Wrapper = embedded ? 'div' : 'section'

  return (
    <Wrapper className={embedded ? '' : 'card p-4'}>
      {!embedded && (
        <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">
          {t.garden.biodiversity.title}
        </h3>
      )}

      {/* Top row: big score ring + counts column */}
      <div className="flex items-start gap-4 mb-4">
        <BigScoreRing score={data.score} />
        <div className="flex-1 space-y-1 text-sm min-w-0 pt-1">
          <p className="text-text">{t.garden.biodiversity.speciesCount(data.species_count)}</p>
          {data.native_count > 0 && (
            <p className="flex items-center gap-1.5" style={{ color: 'var(--color-good)', fontWeight: 600 }}>
              <BioIcon name="native" size={14} /> {t.garden.biodiversity.nativeCount(data.native_count)}
            </p>
          )}
          {data.invasive_count > 0 && (
            <p className="flex items-center gap-1.5" style={{ color: 'var(--color-overdue)', fontWeight: 600 }}>
              <BioIcon name="invasive" size={14} /> {t.garden.biodiversity.invasiveCount(data.invasive_count)}
            </p>
          )}
        </div>
      </div>

      {/* Pollinator month coverage */}
      <div className="mb-3">
        <p className="text-xs text-text-muted mb-1">{t.garden.biodiversity.pollinatorMonths}</p>
        <MonthCoverage months={data.pollinator_coverage_months} locale={t.locale} />
      </div>

      {/* Components breakdown */}
      <div className="flex justify-between gap-4 text-[11px] text-text-muted pt-3 border-t border-border/40">
        <span className="flex items-center gap-1"><BioIcon name="pollinator" size={12} /> {t.garden.biodiversity.componentPollinator}: <span className="text-text font-mono">{data.components.pollinator}/60</span></span>
        <span className="flex items-center gap-1"><BioIcon name="native" size={12} /> {t.garden.biodiversity.componentNative}: <span className="text-text font-mono">{data.components.native}/30</span></span>
        <span className="flex items-center gap-1"><BioIcon name="diversity" size={12} /> {t.garden.biodiversity.componentDiversity}: <span className="text-text font-mono">{data.components.diversity}/10</span></span>
      </div>

      {/* Plant suggestions section */}
      {suggestions && (
        <section className="pt-4 mt-4 border-t border-border/40">
          <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">
            {t.garden.suggestions.title}
          </h3>

          {suggestions.gap_months.length > 0 && (
            <p className="text-xs text-text-muted mb-3">
              {t.garden.suggestions.gapLabel.replace(
                '{months}',
                suggestions.gap_months.map(m => MONTH_SHORT[m - 1]).join(', ')
              )}
            </p>
          )}

          {suggestions.suggestions.length === 0 ? (
            <p className="text-xs text-text-muted">{t.garden.suggestions.noData}</p>
          ) : (
            <div className="space-y-3">
              {suggestions.suggestions.map((s) => {
                const sunLabel = s.sun_preference === 'full_sun'
                  ? t.garden.suggestions.sunFull
                  : s.sun_preference === 'partial_sun'
                  ? t.garden.suggestions.sunPartial
                  : s.sun_preference === 'shade'
                  ? t.garden.suggestions.sunShade
                  : null

                return (
                  <div key={s.species_id} className="card p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-sm text-text">{t.locale.startsWith('en') ? (s.english_name || s.dutch_name) : s.dutch_name}</span>
                          {sunLabel && (
                            <span className="text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded-full border border-border/50">
                              {sunLabel}
                            </span>
                          )}
                          {s.is_native && (
                            <span className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                              {t.garden.suggestions.nativeBadge}
                            </span>
                          )}
                          {(s.pollinator_value ?? 0) >= 2 && (
                            <span className="text-amber-700 inline-flex items-center px-1 py-0.5 bg-amber-400/10 rounded-full" title={t.garden.biodiversity.componentPollinator}>
                              <BioIcon name="pollinator" size={11} />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-muted italic">{s.latin_name}</p>
                      </div>
                    </div>
                    {s.reason && (
                      <p className="text-xs text-text-muted leading-relaxed">
                        {t.locale.startsWith('en') ? ((s as any).reason_en || s.reason) : s.reason}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </Wrapper>
  )
}

export default function GardenBiodiversityCard({ slug, mode = 'card', onModalOpenChange }: Props) {
  const t = useT()
  const [data, setData] = useState<GardenBiodiversityOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    mapsApi.biodiversity(slug)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalOpen])

  useEffect(() => {
    onModalOpenChange?.(modalOpen)
  }, [modalOpen, onModalOpenChange])

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!modalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [modalOpen])

  if (mode === 'pill') {
    if (loading || error || !data || data.species_count === 0) return null

    const r = 9
    const c = 2 * Math.PI * r
    const dash = (data.score / 100) * c

    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1 bg-surface/85 rounded-full border border-border/60 shadow-lg hover:bg-surface transition-colors"
          style={{ backdropFilter: 'blur(10px)' }}
          aria-label={t.garden.biodiversity.title}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90">
            <circle cx="11" cy="11" r={r} fill="none" stroke="var(--color-border-soft)" strokeWidth="3" />
            <circle cx="11" cy="11" r={r} fill="none" stroke={scoreColor(data.score)} strokeWidth="3"
                    strokeDasharray={`${dash} ${c - dash}`}
                    strokeLinecap="round" />
          </svg>
          <span className="text-xs font-semibold text-text">{data.score}</span>
          <span className="text-xs text-text-muted">{t.garden.biodiversity.title}</span>
        </button>
        {modalOpen && createPortal(
          <div
            onClick={() => setModalOpen(false)}
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pt-4 pb-[calc(1rem+5rem)]"
            role="dialog"
            aria-modal="true"
            aria-label={t.garden.biodiversity.title}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[calc(100dvh-8rem)] bg-surface rounded-2xl shadow-xl flex flex-col overflow-hidden"
            >
              {/* Header bar — title + close, anchored (no floating ✕) */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
                <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted">
                  {t.garden.biodiversity.title}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-8 h-8 -mr-1.5 rounded-full flex items-center justify-center text-text-muted hover:text-text hover:bg-bg/60 transition-colors shrink-0"
                  aria-label={t.mapPage.gardenActionClose}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto px-4 py-4">
                <GardenBiodiversityCardFull data={data} slug={slug} embedded />
              </div>
            </div>
          </div>,
          document.body,
        )}
      </>
    )
  }

  // mode === 'card' (default)
  if (loading) {
    return (
      <div className="card p-4">
        <p className="text-sm text-text-muted">{t.garden.biodiversity.loading}</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card p-4">
        <p className="text-sm text-text-muted">{t.garden.biodiversity.failed}</p>
      </div>
    )
  }

  if (data.species_count === 0) {
    return (
      <div className="card p-4">
        <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-2">
          {t.garden.biodiversity.title}
        </h3>
        <p className="text-sm text-text-muted">{t.garden.biodiversity.emptyGarden}</p>
      </div>
    )
  }

  return <GardenBiodiversityCardFull data={data} slug={slug} />
}

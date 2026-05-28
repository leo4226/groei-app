import { useEffect, useState } from 'react'
import { maps as mapsApi } from '../api/client'
import { useT } from '../context/LanguageContext'
import type { GardenBiodiversityOut } from '../types'

interface Props {
  slug: string
  mode?: 'pill' | 'card'  // default: 'card'
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

function GardenBiodiversityCardFull({ data }: { data: GardenBiodiversityOut }) {
  const t = useT()
  return (
    <section className="card p-4">
      <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">
        {t.garden.biodiversity.title}
      </h3>

      {/* Top row: big score ring + counts column */}
      <div className="flex items-start gap-4 mb-4">
        <BigScoreRing score={data.score} />
        <div className="flex-1 space-y-1 text-sm min-w-0 pt-1">
          <p className="text-text">{t.garden.biodiversity.speciesCount(data.species_count)}</p>
          {data.native_count > 0 && (
            <p style={{ color: 'var(--color-good)', fontWeight: 600 }}>
              🇳🇱 {t.garden.biodiversity.nativeCount(data.native_count)}
            </p>
          )}
          {data.invasive_count > 0 && (
            <p style={{ color: 'var(--color-overdue)', fontWeight: 600 }}>
              ⚠️ {t.garden.biodiversity.invasiveCount(data.invasive_count)}
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
        <span>🐝 {t.garden.biodiversity.componentPollinator}: <span className="text-text font-mono">{data.components.pollinator}/60</span></span>
        <span>🇳🇱 {t.garden.biodiversity.componentNative}: <span className="text-text font-mono">{data.components.native}/30</span></span>
        <span>🌿 {t.garden.biodiversity.componentDiversity}: <span className="text-text font-mono">{data.components.diversity}/10</span></span>
      </div>
    </section>
  )
}

export default function GardenBiodiversityCard({ slug, mode = 'card' }: Props) {
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

  if (mode === 'pill') {
    if (loading || error || !data || data.species_count === 0) return null

    const r = 9
    const c = 2 * Math.PI * r
    const dash = (data.score / 100) * c

    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1 bg-surface/92 rounded-full border border-border/60 shadow-sm hover:bg-surface transition-colors"
          style={{ backdropFilter: 'blur(6px)' }}
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
        {modalOpen && (
          <div
            onClick={() => setModalOpen(false)}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
              <GardenBiodiversityCardFull data={data} />
            </div>
          </div>
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

  return <GardenBiodiversityCardFull data={data} />
}

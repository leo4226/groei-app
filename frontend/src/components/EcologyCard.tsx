import { useEffect, useState } from 'react'
import { species as speciesApi } from '../api/client'
import { useT } from '../context/LanguageContext'
import type { EcologyOut, EcologyDataSource } from '../types'

interface Props {
  speciesId: number
}

// Floreren tokens — see index.css :root. Picked to harmonise with the
// existing care-status palette (good/due/overdue).
const RING_BG = 'var(--color-border-soft)'
const SCORE_COLORS = {
  high:   'var(--color-good)',     // ≥ 60
  medium: 'var(--color-due)',      // 30..59
  low:    'var(--color-overdue)',  // < 30
}
const CHIP_BG = 'rgba(217, 129, 153, 0.18)'   // --color-type-flower at 18%
const CHIP_FG = '#7a2c44'

function scoreColor(score: number): string {
  if (score >= 60) return SCORE_COLORS.high
  if (score >= 30) return SCORE_COLORS.medium
  return SCORE_COLORS.low
}

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="w-16 h-16 flex items-center justify-center shrink-0 text-text-muted">
        —
      </div>
    )
  }
  const r = 26
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c
  const color = scoreColor(score)
  return (
    <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke={RING_BG} strokeWidth="5" />
        <circle
          cx="32" cy="32" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute font-heading text-base font-semibold" style={{ color }}>
        {score}
      </span>
    </div>
  )
}

function MonthChips({ months, locale }: { months: number[]; locale: string }) {
  // Use Intl for proper localised abbreviations (mei/jul vs. May/Jul).
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short' })
  const label = (m: number) => fmt.format(new Date(2026, m - 1, 1)).replace('.', '')
  return (
    <div className="flex gap-1 flex-wrap">
      {months.map((m) => (
        <span
          key={m}
          className="px-1.5 py-0.5 rounded text-[11px] font-medium leading-tight"
          style={{ background: CHIP_BG, color: CHIP_FG }}
        >
          {label(m)}
        </span>
      ))}
    </div>
  )
}

function SourceBadge({ source, t }: { source: EcologyDataSource; t: ReturnType<typeof useT> }) {
  if (source === 'gbif' || source === 'mixed') {
    return (
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
        {t.ecology.sourceLabel}: {source}
      </span>
    )
  }
  return null
}

function pollinatorLine(v: number, t: ReturnType<typeof useT>): string {
  if (v === 3) return t.ecology.pollinatorTopTier
  if (v === 2) return t.ecology.pollinatorGood
  if (v === 1) return t.ecology.pollinatorMinor
  return t.ecology.pollinatorNone
}

export default function EcologyCard({ speciesId }: Props) {
  const t = useT()
  const [ecology, setEcology] = useState<EcologyOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    speciesApi.ecology(speciesId)
      .then((d) => { if (!cancelled) setEcology(d) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [speciesId])

  if (loading) {
    return (
      <div className="card p-4 mb-5">
        <p className="text-sm text-text-muted">{t.ecology.loading}</p>
      </div>
    )
  }

  if (error || !ecology || ecology.data_source === 'failed') {
    return (
      <div className="card p-4 mb-5">
        <p className="text-sm text-text-muted">{t.ecology.failed}</p>
      </div>
    )
  }

  const facts: { text: string; tone?: 'native' | 'invasive' | 'muted' }[] = []
  if (ecology.invasive_nl === true) {
    facts.push({ text: t.ecology.invasive, tone: 'invasive' })
  }
  if (ecology.native_to_nl === true) {
    facts.push({ text: t.ecology.native, tone: 'native' })
  } else if (ecology.native_to_nl === false && ecology.invasive_nl !== true) {
    facts.push({ text: t.ecology.nonNative, tone: 'muted' })
  }
  if (ecology.pollinator_value !== null) {
    facts.push({ text: pollinatorLine(ecology.pollinator_value, t) })
  }
  if (ecology.host_plant_for && ecology.host_plant_for.length > 0) {
    facts.push({ text: `${t.ecology.hostPrefix} ${ecology.host_plant_for.join(', ')}` })
  }

  const enrichedDate = new Date(ecology.enriched_at).toLocaleDateString(t.locale, {
    day: 'numeric', month: 'short',
  })

  // Suppress entirely-empty cards (no facts and no flowering data).
  if (facts.length === 0 && (!ecology.flowering_months || ecology.flowering_months.length === 0)) {
    return null
  }

  return (
    <section className="card p-4 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted">
          {t.ecology.title}
        </h3>
        <SourceBadge source={ecology.data_source} t={t} />
      </div>

      {/* Score + facts */}
      <div className="flex items-start gap-4 mb-3">
        <ScoreRing score={ecology.score} />
        <div className="flex-1 space-y-1 min-w-0 pt-0.5">
          {facts.map((f, i) => (
            <p
              key={i}
              className="text-sm leading-snug"
              style={{
                color:
                  f.tone === 'invasive' ? 'var(--color-overdue)' :
                  f.tone === 'native'   ? 'var(--color-good)' :
                  f.tone === 'muted'    ? 'var(--color-text-muted)' :
                  'var(--color-text)',
                fontWeight: f.tone === 'invasive' || f.tone === 'native' ? 600 : 400,
              }}
            >
              {f.text}
            </p>
          ))}
        </div>
      </div>

      {/* Flowering months */}
      {ecology.flowering_months && ecology.flowering_months.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-text-muted shrink-0">{t.ecology.floweringPrefix}:</span>
          <MonthChips months={ecology.flowering_months} locale={t.locale} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
          {t.ecology.scoreLabel}
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {t.ecology.enrichedAt} {enrichedDate}
        </span>
      </div>
    </section>
  )
}

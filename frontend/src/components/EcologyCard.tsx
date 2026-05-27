import { useEffect, useState } from 'react'
import { species as speciesApi } from '../api/client'
import { useT } from '../context/LanguageContext'
import type { EcologyOut } from '../types'

interface Props {
  speciesId: number
}

const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function formatMonths(months: number[]): string {
  // Show as contiguous ranges where possible, otherwise comma-separated.
  if (months.length === 0) return ''
  const sorted = [...months].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i]
      continue
    }
    ranges.push(start === prev ? MONTHS_NL[start - 1] : `${MONTHS_NL[start - 1]}–${MONTHS_NL[prev - 1]}`)
    start = sorted[i]
    prev = sorted[i]
  }
  ranges.push(start === prev ? MONTHS_NL[start - 1] : `${MONTHS_NL[start - 1]}–${MONTHS_NL[prev - 1]}`)
  return ranges.join(', ')
}

function pollinatorLine(value: number, t: ReturnType<typeof useT>): string | null {
  if (value === 3) return t.ecology.pollinatorTopTier
  if (value === 2) return t.ecology.pollinatorGood
  if (value === 1) return t.ecology.pollinatorMinor
  if (value === 0) return t.ecology.pollinatorNone
  return null
}

export default function EcologyCard({ speciesId }: Props) {
  const t = useT()
  const [ecology, setEcology] = useState<EcologyOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    speciesApi.ecology(speciesId)
      .then(setEcology)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [speciesId])

  if (loading) {
    return (
      <div className="bg-surface rounded-xl p-4 mb-5 border border-border text-sm text-text-muted">
        {t.ecology.loading}
      </div>
    )
  }

  if (error || !ecology || ecology.data_source === 'failed') {
    return (
      <div className="bg-surface rounded-xl p-4 mb-5 border border-border text-sm text-text-muted">
        {t.ecology.failed}
      </div>
    )
  }

  const lines: string[] = []
  if (ecology.invasive_nl === true) {
    lines.push(t.ecology.invasive)
  } else if (ecology.native_to_nl === true) {
    lines.push(t.ecology.native)
  } else if (ecology.native_to_nl === false) {
    lines.push(t.ecology.nonNative)
  }

  if (ecology.pollinator_value !== null) {
    const pl = pollinatorLine(ecology.pollinator_value, t)
    if (pl) lines.push(pl)
  }

  if (ecology.flowering_months && ecology.flowering_months.length > 0) {
    lines.push(`${t.ecology.floweringPrefix} ${formatMonths(ecology.flowering_months)}`)
  }

  if (ecology.host_plant_for && ecology.host_plant_for.length > 0) {
    lines.push(`${t.ecology.hostPrefix} ${ecology.host_plant_for.join(', ')}`)
  }

  // Empty profile — nothing to render, suppress the card entirely.
  if (lines.length === 0) return null

  const showLlmWarning = ecology.data_source === 'llm' || ecology.data_source === 'mixed'
  const enrichedDate = new Date(ecology.enriched_at).toLocaleDateString(t.locale, {
    day: 'numeric', month: 'short',
  })

  // Score colour bands: low (orange) / medium (amber) / high (green).
  // Tuned so duizendblad (65) is clearly "good" but not yet "top".
  const score = ecology.score
  const scoreColor =
    score == null ? 'transparent'
    : score >= 60 ? '#3f8a3f'   // green
    : score >= 30 ? '#c79c2a'   // amber
    : '#b56330'                 // orange-brown

  return (
    <section className="bg-surface rounded-xl p-4 mb-5 border border-border">
      <h3 className="font-heading text-sm font-medium text-text mb-2">{t.ecology.title}</h3>
      <ul className="space-y-1.5 text-sm text-text">
        {lines.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
      {score != null && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs text-text-muted mb-1">
            <span>{t.ecology.scoreLabel}</span>
            <span className="font-mono text-text">{score}/100</span>
          </div>
          <div className="h-1.5 bg-border rounded overflow-hidden">
            <div
              className="h-full"
              style={{ width: `${score}%`, background: scoreColor }}
            />
          </div>
        </div>
      )}
      <p className="font-mono text-[10px] text-text-muted mt-3">
        {t.ecology.sourceLabel}: {ecology.data_source}
        {showLlmWarning && (
          <span title={t.ecology.sourceLlmWarning} className="ml-1 cursor-help">❓</span>
        )}
        {' · '}{t.ecology.enrichedAt} {enrichedDate}
      </p>
    </section>
  )
}

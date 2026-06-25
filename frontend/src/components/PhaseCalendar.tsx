import type { Phenology } from '../types'
import { computeSuitability, PHASE_COLORS } from '../utils/suitability'
import { useT } from '../context/LanguageContext'

const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D']

interface Props {
  phenology: Phenology
  sunHours: number | null
  isActiveMonth?: (month: number) => boolean
  monthStripHeight?: string
  monthStripClass?: string
}

export default function PhaseCalendar({
  phenology,
  sunHours,
  isActiveMonth,
  monthStripHeight = 'h-5',
  monthStripClass,
}: Props) {
  const t = useT()
  const currentMonth = new Date().getMonth() + 1

  // Locale-aware month formatting
  const locale = t.locale || 'nl-NL'
  const suitability = computeSuitability(phenology, sunHours ?? 0, currentMonth, locale)
  const fmtMonth = (m: number) => {
    return new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(new Date(2026, m - 1, 1))
      .replace('.', '')
  }
  const fmtMonths = (months: number[]) => months.map(fmtMonth).join(', ')

  // Select locale-aware field
  const isEN = locale.startsWith('en')
  const phaseLabel = (data: { phase_label_nl: string; phase_label_en?: string } | undefined) => {
    if (!data) return ''
    return isEN && data.phase_label_en ? data.phase_label_en : data.phase_label_nl
  }
  const fact = phenology.interesting_facts_en && isEN
    ? phenology.interesting_facts_en
    : phenology.interesting_facts_nl

  return (
    <div>
      {/* Phase strips */}
      <div className="flex gap-0.5 mb-1">
        {MONTH_LABELS.map((lbl, i) => {
          const month = i + 1
          const data = phenology.months?.find(m => m.month === month)
          const phase = data?.phase ?? 'unknown'
          const active = isActiveMonth?.(month)
          return (
            <div key={month} className="flex-1 flex flex-col items-center" title={phaseLabel(data)}>
              <div
                className={`w-full rounded-sm ${monthStripClass ?? ''} ${active ? 'ring-2 ring-offset-1 ring-primary' : ''} ${monthStripHeight}`}
                style={{ backgroundColor: PHASE_COLORS[phase] ?? PHASE_COLORS.unknown }}
              />
              <span className="text-[8px] text-text-muted mt-0.5">{lbl}</span>
            </div>
          )
        })}
      </div>

      {/* Current month callout */}
      <div className="mt-2 p-3 bg-surface rounded-xl border border-border">
        <p className="text-sm font-semibold text-text">
          {isEN ? `Now (${fmtMonth(currentMonth)}): ` : `Nu (${fmtMonth(currentMonth)}): `}{suitability.phaseLabel || '—'}
        </p>
        {suitability.detailLabel && (
          <p className="text-xs text-text-muted mt-0.5">{suitability.detailLabel}</p>
        )}
        {suitability.actions.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {suitability.actions.map((action, i) => (
              <li key={i} className="text-xs text-text-muted">→ {action}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Planting windows */}
      {(phenology.sow_window?.length > 0 || phenology.transplant_window?.length > 0 || phenology.harvest_window?.length > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {phenology.sow_window?.length > 0 && (
            <div className="bg-emerald-green/10 rounded-[10px] p-2">
              <p className="text-xs font-semibold text-emerald-green">
                {isEN ? 'Sow' : 'Zaaien'}
              </p>
              <p className="text-xs text-emerald-green/80 mt-0.5">{fmtMonths(phenology.sow_window)}</p>
            </div>
          )}
          {phenology.transplant_window?.length > 0 && (
            <div className="bg-aqua-glow/10 rounded-[10px] p-2">
              <p className="text-xs font-semibold text-midnight-ink">
                {isEN ? 'Transplant' : 'Uitplanten'}
              </p>
              <p className="text-xs text-midnight-ink/70 mt-0.5">{fmtMonths(phenology.transplant_window)}</p>
            </div>
          )}
          {phenology.harvest_window?.length > 0 && (
            <div className="bg-pumpkin-swirl/10 rounded-[10px] p-2">
              <p className="text-xs font-semibold text-pumpkin-swirl">
                {isEN ? 'Harvest' : 'Oogst'}
              </p>
              <p className="text-xs text-pumpkin-swirl/80 mt-0.5">{fmtMonths(phenology.harvest_window)}</p>
            </div>
          )}
        </div>
      )}

      {/* Interesting fact — locale-aware */}
      {fact && (
        <p className="text-xs text-text-muted italic mt-3 border-t border-border pt-3">
          💡 {fact}
        </p>
      )}
    </div>
  )
}

import type { Phenology } from '../types'
import { computeSuitability, PHASE_COLORS } from '../utils/suitability'

const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MONTH_NAMES_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

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
  const currentMonth = new Date().getMonth() + 1
  const suitability = computeSuitability(phenology, sunHours ?? 0, currentMonth)
  const fmtMonths = (months: number[]) => months.map(m => MONTH_NAMES_NL[m - 1]).join(', ')

  return (
    <div>
      {/* Phase strips */}
      <div className="flex gap-0.5 mb-1">
        {MONTH_LABELS.map((lbl, i) => {
          const month = i + 1
          const data = phenology.months.find(m => m.month === month)
          const phase = data?.phase ?? 'unknown'
          const active = isActiveMonth?.(month)
          return (
            <div key={month} className="flex-1 flex flex-col items-center" title={data?.phase_label_nl ?? ''}>
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
          Nu ({MONTH_NAMES_NL[currentMonth - 1]}): {suitability.phaseLabel || '—'}
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
              <p className="text-xs font-semibold text-emerald-green">Zaaien</p>
              <p className="text-xs text-emerald-green/80 mt-0.5">{fmtMonths(phenology.sow_window)}</p>
            </div>
          )}
          {phenology.transplant_window?.length > 0 && (
            <div className="bg-aqua-glow/10 rounded-[10px] p-2">
              <p className="text-xs font-semibold text-midnight-ink">Uitplanten</p>
              <p className="text-xs text-midnight-ink/70 mt-0.5">{fmtMonths(phenology.transplant_window)}</p>
            </div>
          )}
          {phenology.harvest_window?.length > 0 && (
            <div className="bg-pumpkin-swirl/10 rounded-[10px] p-2">
              <p className="text-xs font-semibold text-pumpkin-swirl">Oogst</p>
              <p className="text-xs text-pumpkin-swirl/80 mt-0.5">{fmtMonths(phenology.harvest_window)}</p>
            </div>
          )}
        </div>
      )}

      {/* Interesting fact */}
      {phenology.interesting_facts_nl && (
        <p className="text-xs text-text-muted italic mt-3 border-t border-border pt-3">
          💡 {phenology.interesting_facts_nl}
        </p>
      )}
    </div>
  )
}

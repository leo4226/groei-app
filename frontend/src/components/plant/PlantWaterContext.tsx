import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'
import { useRainContext } from '../../hooks/useRainContext'
import { buildWaterContext, waterTone } from './plantWaterModel'

interface Props {
  /** This plant's active water schedule, or undefined when it has none. */
  schedule?: { last_done: string | null; interval_days: number }
}

const TONE_CLASS = {
  ok:  'text-text-muted',
  due: 'text-due',
  dry: 'text-overdue',
} as const

/**
 * One line: when this plant last had water, how much rain it has had since,
 * and how that compares to its own interval.
 *
 * This replaced the "Tuinweer" card, which rendered `useRainContext()` — a
 * module-level singleton with no plant argument — so every plant in the garden
 * showed the same two numbers, already visible on the map's weather pill.
 * Rain is only worth repeating here measured against this plant: 14 dry days
 * matters at a 5-day interval and does not at a 30-day one.
 */
export default function PlantWaterContext({ schedule }: Props) {
  const t = useT()
  const rain = useRainContext()

  // No water schedule means nothing to measure against, and a bare garden
  // rainfall figure is exactly what this replaced.
  if (!schedule) return null

  const ctx = buildWaterContext(schedule, rain.data?.days ?? null)
  const tone = waterTone(ctx)
  const ci = t.careInfo

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Glyph name="droplet" size={15} className="shrink-0 text-sky-500" />
      <span className={TONE_CLASS[tone]}>
        {ctx.daysSinceWatered == null
          ? ci.waterNeverGiven
          : ci.waterLastGiven(ctx.daysSinceWatered)}
      </span>
      {ctx.mmSinceWatered != null && (
        <span className="text-text-muted">· {ci.waterRainSince(Math.round(ctx.mmSinceWatered))}</span>
      )}
      <span className="text-text-muted">· {ci.waterNormalInterval(ctx.intervalDays)}</span>
      {ctx.overdueDays > 0 && (
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            tone === 'dry' ? 'bg-overdue-soft text-overdue' : 'bg-due-soft text-due'
          }`}
        >
          {ci.waterOverdue(ctx.overdueDays)}{tone === 'dry' ? ` · ${ci.waterDry}` : ''}
        </span>
      )}
    </div>
  )
}

import { useT } from '../../context/LanguageContext'
import { useRainContext } from '../../hooks/useRainContext'
import { buildWaterContext } from './plantWaterModel'

interface Props {
  /** This plant's active water schedule, or undefined when it has none. */
  schedule?: { last_done: string | null; interval_days: number }
}

/**
 * The plant-specific evidence under a water warning.
 *
 * This began as a standalone card replacing "Tuinweer", and that was the wrong
 * shape twice over. It sat on the page background with no card around it, so it
 * read as stray text; and it repeated the interval and last-watered date, which
 * the Verzorging section already shows per schedule, complete with an overdue
 * badge.
 *
 * What is genuinely new is the rain *since this plant was last watered* —
 * neither the map's garden pill (a fixed 14-day window for the whole garden)
 * nor the care row (which knows nothing about weather) can say it. So it is one
 * line, and it belongs where the warning already claims "very little rain":
 * as the specific reading behind a general statement.
 */
export default function PlantWaterEvidence({ schedule }: Props) {
  const t = useT()
  const rain = useRainContext()

  if (!schedule) return null
  const ctx = buildWaterContext(schedule, rain.data?.days ?? null)
  // Nothing to say until there is a watering to measure from.
  if (ctx.daysSinceWatered == null || ctx.mmSinceWatered == null) return null

  const ci = t.careInfo
  const parts = [
    ci.waterLastGiven(ctx.daysSinceWatered),
    ci.waterRainSince(Math.round(ctx.mmSinceWatered)),
  ]
  if (ctx.overdueDays > 0) parts.push(ci.waterOverdue(ctx.overdueDays))

  return <>{parts.join(' · ')}</>
}

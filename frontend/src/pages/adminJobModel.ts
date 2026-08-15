/**
 * Presentation logic for admin background jobs, kept out of the component so it
 * can be tested directly.
 *
 * The tools run one LLM call per item and routinely take minutes, so what the
 * panel says while a job is in flight — and what it says about the parts that
 * did not work — is most of the usable surface.
 */
import type { AdminSkippedDetail } from '../api/client'

/** "1m 20s" / "45s" — compact enough to sit under a progress bar. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

/**
 * Seconds left, extrapolated straight-line from the items finished so far.
 *
 * Null until two items are done: the first item carries cold-start cost (pool
 * warm-up, first LLM connection) and extrapolating from it alone produces an
 * estimate wrong enough to be worse than showing none.
 */
export function etaSeconds(done: number, total: number, elapsedSeconds: number): number | null {
  if (done < 2 || total <= done || elapsedSeconds <= 0) return null
  return (elapsedSeconds / done) * (total - done)
}

/** What an admin can do about a skip, keyed by the runner's machine-readable reason. */
export const SKIP_REASON_LABEL: Record<string, string> = {
  ai_failed_used_generic_art: 'AI drawing failed — generic art used, so it will come back next run',
  r2_upload_failed: 'Could not upload the SVG to R2 storage',
  threshold_generation_failed: 'Could not generate care thresholds',
  schedule_seed_failed: 'Could not seed the care schedule',
  fact_generation_failed: 'Could not generate the fact',
  name_generation_failed: 'Could not generate the name',
  no_localized_name_generated: 'The model returned no usable Dutch/English name',
  icon_key_not_in_catalog: 'Its icon key is not in the icon catalog',
  // Generation works per species and keys the icon on the latin name, so these
  // two are structural: the tool can never serve the plant, however often it
  // runs. They are why Settings' plant count exceeds the panel's species count.
  no_species_link: 'Not linked to a species — run "Link plants to a species" first',
  species_lookup_failed: 'Could not work out which species this plant is',
  species_has_no_latin_name: 'Its species has no latin name, which the icon is keyed on',
}

export function describeSkip(detail: AdminSkippedDetail): string {
  if (detail.reason) return SKIP_REASON_LABEL[detail.reason] ?? detail.reason
  return detail.error ?? detail.message ?? 'skipped'
}

export function skipSubject(detail: AdminSkippedDetail): string {
  return String(detail.name ?? detail.icon_key ?? detail.species_id ?? detail.id ?? 'unknown')
}

/**
 * Summary line for a finished generate-icons run.
 *
 * Generic procedural fallbacks are counted separately from AI icons on purpose.
 * They look like successes — the plant renders — but they deliberately do not
 * count as covered, so they are exactly the species that reappear as "still
 * missing" on the next run. Folding them into one "generated" number is what
 * made icon generation look like it silently skipped plants.
 */
export function iconJobSummary(result: Record<string, unknown> | null): string {
  const r = result ?? {}
  const count = Number(r.count ?? 0)
  const ai = Number(r.ai_count ?? count)
  const fallback = Number(r.fallback_count ?? 0)
  const skipped = Number(r.skipped_count ?? 0)
  const matched = Number((r.sync_result as { matched?: number } | null)?.matched ?? 0)
  const remaining = Number(r.remaining ?? 0)
  return `✓ ${ai} AI icons`
    + (fallback ? ` · ${fallback} generic fallback${fallback === 1 ? '' : 's'}` : '')
    + ` · ${skipped} failed · ${matched} plants matched · ${remaining} left`
}

/**
 * Render an audit row's `detail` JSON as one readable line.
 *
 * `start_job` — now the most common audit action, since every tool in the panel
 * goes through it — stores its params as a nested object, and `String({})` is
 * "[object Object]". So the busiest rows in the log said nothing. One level is
 * flattened inline; anything deeper is JSON-encoded rather than stringified.
 */
export function formatAuditValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== null && inner !== undefined)
      .map(([k, inner]) => {
        const rendered = Array.isArray(inner) || typeof inner !== 'object'
          ? String(inner)
          : JSON.stringify(inner)
        return `${k}=${rendered}`
      })
      .join(', ')
  }
  return String(value)
}

export function formatAuditDetail(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${formatAuditValue(v)}`)
    .join(' · ')
}

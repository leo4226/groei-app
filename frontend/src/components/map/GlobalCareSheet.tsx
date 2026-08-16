import { useRef, useState } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import type { BucketPlantOut, WeatherWarningGroupOut } from '../../types'
import {
  getCareTypeDisplay,
  isWeatherWarning,
  localizedWarningCopy,
  localizedWeatherWarningCopy,
  type LocalizedWarningCopy,
} from './careNeedsListModel'
import { partitionWeatherWarnings } from './weatherWarningModel'
import CareIcon, { type CareIconType } from '../ui/CareIcon'

interface Props {
  /** Server-derived write capability (me.capabilities.can_edit). When false,
   * every Done/Skip/acknowledge/restore control is disabled and the handlers
   * no-op — a viewer can read the list but not act on it. */
  canEdit?: boolean
  /** Current map's name, so we can flag plants that live in another garden. */
  currentMapName?: string | null
  /** Tap a plant — pan to it (same map) or navigate to its garden (other map). */
  onPlantTap?: (plantId: number, mapName: string | null) => void
  highlightedWeatherWarningId?: string | null
  onHighlightWeatherWarning?: (warning: WeatherWarningGroupOut | null) => void
}

/** One care action aggregated across every garden (e.g. "Water · 32 plants"). */
interface CareGroup {
  care_type: string
  plants: BucketPlantOut[]
  /** Any plant overdue or flagged urgent → render in the overdue colour. */
  urgent: boolean
  maxDaysOverdue: number
  /** Distinct garden names this action spans. */
  gardens: string[]
}

const keyOf = (p: BucketPlantOut) => `${p.plant_id}_${p.care_type ?? ''}`

/**
 * Collapse a flat list of bucketed plants into care-type-first groups, across
 * gardens. Plants without a care type (rare) are returned separately so they
 * can render as plain tappable rows.
 */
function groupByCareType(plants: BucketPlantOut[], doneIds: Set<string>): {
  groups: CareGroup[]
  loose: BucketPlantOut[]
  count: number
} {
  const visible = plants.filter((p) => !doneIds.has(keyOf(p)))
  const loose = visible.filter((p) => !p.care_type)

  const byType = new Map<string, BucketPlantOut[]>()
  for (const p of visible) {
    if (!p.care_type) continue
    const arr = byType.get(p.care_type) ?? []
    arr.push(p)
    byType.set(p.care_type, arr)
  }

  const groups: CareGroup[] = [...byType.entries()]
    .map(([care_type, ps]) => {
      const sorted = [...ps].sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0))
      return {
        care_type,
        plants: sorted,
        urgent: ps.some((p) => p.top_warning?.severity === 'urgent' || (p.days_overdue ?? 0) > 0),
        maxDaysOverdue: Math.max(0, ...ps.map((p) => p.days_overdue ?? 0)),
        gardens: [...new Set(ps.map((p) => p.map_name).filter((m): m is string => !!m))],
      }
    })
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
      return b.plants.length - a.plants.length
    })

  return { groups, loose, count: visible.length }
}

/**
 * Care list for the map bottom sheet. Care-type-first: each action a user can
 * take ("Water 32 plants") is one card with a single bulk Done, expandable to
 * the individual plants. Only what needs doing *now* (overdue + today) shows by
 * default; the rest of the week sits behind a quiet expander. Driven by the
 * global `warningSummary` so a user sees every garden without leaving the map.
 */
export default function GlobalCareSheet({
  canEdit = true,
  currentMapName,
  onPlantTap,
  highlightedWeatherWarningId,
  onHighlightWeatherWarning,
}: Props) {
  const t = useT()
  const readOnly = !canEdit
  const summary = useFloreren((s) => s.warningSummary)
  const markCareDone = useFloreren((s) => s.markCareDone)
  const skipCare = useFloreren((s) => s.skipCare)
  const acknowledgeWeatherWarning = useFloreren((s) => s.acknowledgeWeatherWarning)
  const restoreWeatherWarning = useFloreren((s) => s.restoreWeatherWarning)

  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [laterOpen, setLaterOpen] = useState(false)
  const [seenWeatherOpen, setSeenWeatherOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  function toggleCard(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDone(plant: BucketPlantOut) {
    if (readOnly || !plant.care_type) return
    const key = keyOf(plant)
    setSaving(key)
    try {
      await markCareDone(plant.plant_id, plant.care_type)
      setDoneIds((prev) => new Set([...prev, key]))
    } finally {
      setSaving(null)
    }
  }

  async function handleSkip(plant: BucketPlantOut) {
    if (readOnly || !plant.care_type) return
    const key = keyOf(plant)
    setSaving(key)
    try {
      await skipCare(plant.plant_id, plant.care_type)
      setDoneIds((prev) => new Set([...prev, key]))
    } finally {
      setSaving(null)
    }
  }

  async function handleDoneGroup(cardId: string, group: CareGroup) {
    if (readOnly) return
    setSaving(`group_${cardId}`)
    try {
      await Promise.all(group.plants.map((p) => markCareDone(p.plant_id, group.care_type)))
      setDoneIds((prev) => {
        const next = new Set([...prev])
        group.plants.forEach((p) => next.add(keyOf(p)))
        return next
      })
      const { label } = getCareTypeDisplay(group.care_type, t)
      showToast(`${group.plants.length}× ${label} · ${t.mapPage.careDone}`)
    } finally {
      setSaving(null)
    }
  }

  async function handleAcknowledgeWeather(warning: WeatherWarningGroupOut) {
    if (readOnly) return
    setSaving(`weather_${warning.warning_id}`)
    try {
      await acknowledgeWeatherWarning(warning)
      if (highlightedWeatherWarningId === warning.warning_id) {
        onHighlightWeatherWarning?.(null)
      }
    } finally {
      setSaving(null)
    }
  }

  async function handleRestoreWeather(warning: WeatherWarningGroupOut) {
    if (readOnly) return
    setSaving(`weather_${warning.warning_id}`)
    try {
      await restoreWeatherWarning(warning.warning_id)
    } finally {
      setSaving(null)
    }
  }

  if (!summary) {
    return <div className="py-6 text-center text-xs text-text-muted">{t.maps.loading}</div>
  }

  const now = groupByCareType([...summary.buckets.nu, ...summary.buckets.vandaag], doneIds)
  const later = groupByCareType(summary.buckets.komende_week, doneIds)
  const weather = partitionWeatherWarnings(summary.weather_warnings ?? [])
  const hasActiveNow = now.count > 0 || weather.active.length > 0

  return (
    <div className="space-y-3 pt-1">
      {/* ── Needs you now (overdue + today) ── */}
      {!hasActiveNow ? (
        <div className="py-5 flex flex-col items-center gap-2 text-text-muted">
          <CareIcon type="sprout" size={26} strokeWidth={1.6} />
          <span className="text-sm italic">{t.mapPage.sheetAllGoodGlobal}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-0.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
              {t.mapPage.sheetNeedsAttention}
            </span>
            <div className="flex-1 h-px bg-border/40" />
          </div>
          {weather.active.map((warning) => (
            <WeatherAdvisoryCard
              key={warning.warning_id}
              warning={warning}
              t={t}
              readOnly={readOnly}
              saving={saving === `weather_${warning.warning_id}`}
              highlighted={highlightedWeatherWarningId === warning.warning_id}
              onHighlight={() => onHighlightWeatherWarning?.(
                highlightedWeatherWarningId === warning.warning_id ? null : warning,
              )}
              onAcknowledge={() => handleAcknowledgeWeather(warning)}
            />
          ))}
          {now.groups.map((g) => {
            const id = `now_${g.care_type}`
            return (
              <CareCard
                key={id}
                cardId={id}
                group={g}
                t={t}
                readOnly={readOnly}
                currentMapName={currentMapName}
                expanded={expanded.has(id)}
                saving={saving}
                onToggle={() => toggleCard(id)}
                onDoneGroup={() => handleDoneGroup(id, g)}
                onPlantTap={onPlantTap}
                onDone={handleDone}
                onSkip={handleSkip}
              />
            )
          })}
          {now.loose.map((p) => (
            <LooseRow key={keyOf(p)} plant={p} onTap={onPlantTap} />
          ))}
        </div>
      )}

      {/* ── Later this week (collapsed by default) ── */}
      {later.count > 0 && (
        <div>
          <button
            onClick={() => setLaterOpen((v) => !v)}
            className="w-full flex items-center gap-2 py-1.5 group"
            aria-expanded={laterOpen}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
              {t.mapPage.sheetLaterThisWeek(later.count)}
            </span>
            <div className="flex-1 h-px bg-border/40" />
            <Chevron open={laterOpen} />
          </button>

          {laterOpen && (
            <div className="space-y-2 mt-1.5">
              {later.groups.map((g) => {
                const id = `later_${g.care_type}`
                return (
                  <CareCard
                    key={id}
                    cardId={id}
                    group={g}
                    t={t}
                    readOnly={readOnly}
                    muted
                    currentMapName={currentMapName}
                    expanded={expanded.has(id)}
                    saving={saving}
                    onToggle={() => toggleCard(id)}
                    onDoneGroup={() => handleDoneGroup(id, g)}
                    onPlantTap={onPlantTap}
                    onDone={handleDone}
                    onSkip={handleSkip}
                  />
                )
              })}
              {later.loose.map((p) => (
                <LooseRow key={keyOf(p)} plant={p} onTap={onPlantTap} />
              ))}
            </div>
          )}
        </div>
      )}

      {weather.seen.length > 0 && (
        <div>
          <button
            onClick={() => setSeenWeatherOpen((open) => !open)}
            className="w-full flex items-center gap-2 py-1.5 group"
            aria-expanded={seenWeatherOpen}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
              {t.mapPage.weatherSeenGuidance} · {weather.seen.length}
            </span>
            <div className="flex-1 h-px bg-border/40" />
            <Chevron open={seenWeatherOpen} />
          </button>
          {seenWeatherOpen && (
            <div className="space-y-2 mt-1.5">
              {weather.seen.map((warning) => (
                <SeenWeatherAdvisory
                  key={warning.warning_id}
                  warning={warning}
                  t={t}
                  readOnly={readOnly}
                  saving={saving === `weather_${warning.warning_id}`}
                  onRestore={() => handleRestoreWeather(warning)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[90px] z-[1000] bg-text text-surface px-5 py-2.5 rounded-full text-[13px] shadow-lg pointer-events-none whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

function WeatherAdvisoryCard({ warning, t, readOnly, saving, highlighted, onHighlight, onAcknowledge }: {
  warning: WeatherWarningGroupOut
  t: ReturnType<typeof useT>
  readOnly: boolean
  saving: boolean
  highlighted: boolean
  onHighlight: () => void
  onAcknowledge: () => void
}) {
  const copy = localizedWarningCopy(warning, t)
  const subtitle = warning.map_names.length > 1
    ? `${t.mapPage.sheetPlantCount(warning.affected_plant_ids.length)} · ${t.mapPage.sheetGardenCount(warning.map_names.length)}`
    : warning.map_names[0]
      ? `${t.mapPage.sheetPlantCount(warning.affected_plant_ids.length)} · ${warning.map_names[0]}`
      : t.mapPage.sheetPlantCount(warning.affected_plant_ids.length)
  const accent = warning.severity === 'urgent' ? 'var(--color-overdue)' : 'var(--color-due)'

  return (
    <div className={`rounded-xl border bg-surface overflow-hidden transition-opacity ${saving ? 'opacity-50' : ''}`} style={{ borderColor: `color-mix(in srgb, ${accent} 35%, var(--color-border))` }}>
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <span className="shrink-0 mt-0.5" style={{ color: accent }}>
          <CareIcon type={warning.care_type as CareIconType} size={20} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-text">{copy.headline}</span>
            <span className="px-2 py-0.5 rounded-full bg-aqua-glow/10 text-aqua-glow text-[9px] font-semibold uppercase tracking-wide shrink-0">
              {t.mapPage.weatherWarningBadge}
            </span>
          </div>
          <span className="block text-[11px] text-text-muted mt-0.5">{subtitle}</span>
          <WeatherWarningInline copy={copy} t={t} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-3 py-2.5 mt-1 border-t border-border/40">
        <button
          disabled={saving}
          onClick={onHighlight}
          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50 ${highlighted ? 'bg-primary text-white' : 'bg-aqua-glow/10 text-aqua-glow'}`}
        >
          {highlighted ? t.mapPage.weatherHidePlantMarkers : t.mapPage.weatherHighlightPlants}
        </button>
        <button
          disabled={readOnly || saving}
          onClick={onAcknowledge}
          title={readOnly ? t.settings.onlyEditorsCanChange : undefined}
          className={`px-3 py-1.5 rounded-full bg-primary text-white text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${readOnly ? 'opacity-40' : ''}`}
        >
          {t.mapPage.weatherGotIt}
        </button>
      </div>
    </div>
  )
}

function SeenWeatherAdvisory({ warning, t, readOnly, saving, onRestore }: {
  warning: WeatherWarningGroupOut
  t: ReturnType<typeof useT>
  readOnly: boolean
  saving: boolean
  onRestore: () => void
}) {
  const copy = localizedWarningCopy(warning, t)
  return (
    <div className={`flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2.5 ${saving ? 'opacity-50' : 'opacity-80'}`}>
      <CareIcon type={warning.care_type as CareIconType} size={17} strokeWidth={1.8} className="text-text-muted shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-text truncate">{copy.headline}</span>
        <span className="block text-[10px] text-text-muted truncate">
          {t.mapPage.sheetPlantCount(warning.affected_plant_ids.length)}
        </span>
      </div>
      <button
        disabled={readOnly || saving}
        onClick={onRestore}
        title={readOnly ? t.settings.onlyEditorsCanChange : undefined}
        className={`px-2.5 py-1 rounded-full bg-bg text-text text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${readOnly ? 'opacity-40' : ''}`}
      >
        {t.mapPage.weatherRestore}
      </button>
    </div>
  )
}

interface CareCardProps {
  cardId: string
  group: CareGroup
  t: ReturnType<typeof useT>
  readOnly?: boolean
  muted?: boolean
  currentMapName?: string | null
  expanded: boolean
  saving: string | null
  onToggle: () => void
  onDoneGroup: () => void
  onPlantTap?: (plantId: number, mapName: string | null) => void
  onDone: (p: BucketPlantOut) => void
  onSkip: (p: BucketPlantOut) => void
}

function CareCard({
  cardId, group, t, readOnly = false, muted, currentMapName, expanded, saving,
  onToggle, onDoneGroup, onPlantTap, onDone, onSkip,
}: CareCardProps) {
  const { label } = getCareTypeDisplay(group.care_type, t)
  const accent = muted
    ? 'var(--color-text-muted)'
    : group.urgent ? 'var(--color-overdue)' : 'var(--color-due)'
  const isSaving = saving === `group_${cardId}`
  const weatherCopy = localizedWeatherWarningCopy(group.plants, t)

  const subtitle = group.gardens.length > 1
    ? `${t.mapPage.sheetPlantCount(group.plants.length)} · ${t.mapPage.sheetGardenCount(group.gardens.length)}`
    : group.gardens[0]
      ? `${t.mapPage.sheetPlantCount(group.plants.length)} · ${group.gardens[0]}`
      : t.mapPage.sheetPlantCount(group.plants.length)

  return (
    <div className={`rounded-xl border border-border/60 bg-surface overflow-hidden ${muted ? 'opacity-80' : ''} ${isSaving ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={onToggle} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
          <span className="shrink-0" style={{ color: accent }}>
            <CareIcon type={group.care_type as CareIconType} size={20} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text truncate">
              {label}
              {!muted && group.maxDaysOverdue > 0 && (
                <span className="ml-1.5 text-[10px] font-medium" style={{ color: accent }}>
                  {`+${group.maxDaysOverdue}d`}
                </span>
              )}
            </span>
            <span className="block text-[11px] text-text-muted truncate">{subtitle}</span>
          </span>
          <Chevron open={expanded} />
        </button>
        {weatherCopy ? (
          <span className="px-2 py-1 rounded-full bg-aqua-glow/10 text-aqua-glow text-[10px] font-semibold uppercase tracking-wide shrink-0">
            {t.mapPage.weatherWarningBadge}
          </span>
        ) : (
          <button
            disabled={readOnly || isSaving}
            onClick={onDoneGroup}
            title={readOnly ? t.settings.onlyEditorsCanChange : undefined}
            className={`px-3 py-1.5 rounded-full bg-primary text-white text-[11px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${readOnly ? 'opacity-40' : ''}`}
          >
            {t.mapPage.careDoneAll}
          </button>
        )}
      </div>

      {weatherCopy && <WeatherWarningPanel copy={weatherCopy} t={t} />}

      {expanded && (
        <div className="divide-y divide-border/40 border-t border-border/40">
          {group.plants.map((p) => (
            <PlantRow
              key={keyOf(p)}
              plant={p}
              t={t}
              readOnly={readOnly}
              currentMapName={currentMapName}
              saving={saving}
              onTap={onPlantTap}
              onDone={onDone}
              onSkip={onSkip}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlantRow({ plant, t, readOnly, currentMapName, saving, onTap, onDone, onSkip }: {
  plant: BucketPlantOut
  t: ReturnType<typeof useT>
  readOnly?: boolean
  currentMapName?: string | null
  saving: string | null
  onTap?: (plantId: number, mapName: string | null) => void
  onDone: (p: BucketPlantOut) => void
  onSkip: (p: BucketPlantOut) => void
}) {
  const isSaving = saving === keyOf(plant)
  const overdue = (plant.days_overdue ?? 0) > 0
  const otherGarden = !!plant.map_name && plant.map_name !== currentMapName
  const weatherCopy = plant.top_warning && isWeatherWarning(plant.top_warning)
    ? localizedWarningCopy(plant.top_warning, t)
    : null
  const meta = [
    overdue ? `+${plant.days_overdue}d` : null,
    otherGarden ? `${plant.map_name} · ${t.mapPage.sheetOtherGardenHint}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className={`flex items-center gap-2 px-3 py-2 transition-opacity ${isSaving ? 'opacity-50' : ''}`}>
      <button className="flex-1 min-w-0 text-left" onClick={() => onTap?.(plant.plant_id, plant.map_name)}>
        <span className="block text-xs font-medium text-text truncate">{plant.plant_name}</span>
        {meta && <span className="block text-[10px] text-text-muted truncate mt-0.5">{meta}</span>}
        {weatherCopy && <WeatherWarningInline copy={weatherCopy} t={t} />}
      </button>
      {weatherCopy ? (
        <span className="text-[10px] font-semibold text-aqua-glow uppercase tracking-wide shrink-0">
          {t.mapPage.weatherWarningBadge}
        </span>
      ) : (
        <CareActions
          disabled={isSaving}
          readOnly={readOnly}
          onDone={() => onDone(plant)}
          onSkip={() => onSkip(plant)}
          doneLabel={t.mapPage.careDone}
          skipLabel={t.mapPage.careSkip}
        />
      )}
    </div>
  )
}

/** Plant flagged for attention but with no specific care action — just tappable. */
function LooseRow({ plant, onTap }: {
  plant: BucketPlantOut
  onTap?: (plantId: number, mapName: string | null) => void
}) {
  return (
    <button
      onClick={() => onTap?.(plant.plant_id, plant.map_name)}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/60 bg-surface text-left"
    >
      <span className="flex-1 min-w-0 text-xs font-medium text-text truncate">{plant.plant_name}</span>
      <span className="text-text-muted text-xs shrink-0">→</span>
    </button>
  )
}

function WeatherWarningPanel({ copy, t }: { copy: LocalizedWarningCopy; t: ReturnType<typeof useT> }) {
  return (
    <div className="mx-3 mb-2 rounded-lg border border-aqua-glow/20 bg-aqua-glow/8 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-aqua-glow/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-aqua-glow">
          {t.mapPage.weatherWarningBadge}
        </span>
        <span className="text-xs font-semibold text-text">{copy.headline}</span>
      </div>
      <WeatherWarningInline copy={copy} t={t} />
    </div>
  )
}

function WeatherWarningInline({ copy, t }: { copy: LocalizedWarningCopy; t: ReturnType<typeof useT> }) {
  return (
    <span className="mt-1 block space-y-0.5 text-[10px] leading-snug text-text-muted">
      {copy.reason && <span className="block">{copy.reason}</span>}
      {copy.action && (
        <span className="block">
          <span className="font-semibold text-text">{t.mapPage.weatherWarningAction}: </span>
          {copy.action}
        </span>
      )}
    </span>
  )
}

function CareActions({ disabled, readOnly = false, onDone, onSkip, doneLabel, skipLabel }: {
  disabled: boolean
  readOnly: boolean
  onDone: () => void
  onSkip: () => void
  doneLabel: string
  skipLabel: string
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        disabled={disabled || readOnly}
        onClick={onDone}
        title={readOnly ? undefined : doneLabel}
        className={`px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${readOnly ? 'opacity-40' : ''}`}
      >
        {doneLabel}
      </button>
      <button
        disabled={disabled || readOnly}
        onClick={onSkip}
        title={readOnly ? t.settings.onlyEditorsCanChange : skipLabel}
        className={`w-6 h-6 rounded-full text-text-muted text-sm flex items-center justify-center opacity-60 disabled:opacity-30 ${readOnly ? 'opacity-30 cursor-not-allowed' : ''}`}
      >
        ×
      </button>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

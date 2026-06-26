import { useRef, useState } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import type { BucketPlantOut } from '../../types'
import {
  buildMapGroups,
  buildBucketItems,
  itemsPlantCount,
  type GroupedWarning,
} from '../../utils/careGrouping'
import { getCareTypeDisplay } from './careNeedsListModel'

interface Props {
  /** Current map's name, so we can flag plants that live in another garden. */
  currentMapName?: string | null
  /** Tap a plant — pan to it (same map) or navigate to its garden (other map). */
  onPlantTap?: (plantId: number, mapName: string | null) => void
}

function bucketKey(p: BucketPlantOut) {
  return `${p.plant_id}_${p.care_type ?? ''}`
}

/**
 * Cross-map care list for the map bottom sheet. Mirrors the dashboard's
 * CareWarningsSection (same grouping model) but compact and Tailwind-styled
 * to match the map surface. Driven by the global `warningSummary` so a user
 * sees every garden's needs without leaving the map they're on.
 */
export default function GlobalCareSheet({ currentMapName, onPlantTap }: Props) {
  const t = useT()
  const summary = useFloreren((s) => s.warningSummary)
  const markCareDone = useFloreren((s) => s.markCareDone)
  const skipCare = useFloreren((s) => s.skipCare)

  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  if (!summary) {
    return (
      <div className="py-6 text-center text-xs text-text-muted">{t.maps.loading}</div>
    )
  }

  const allBucketPlants = [...summary.buckets.nu, ...summary.buckets.vandaag, ...summary.buckets.komende_week]
  const totalVisible = allBucketPlants.filter((p) => !doneIds.has(bucketKey(p))).length

  async function handleDone(plant: BucketPlantOut) {
    if (!plant.care_type) return
    const key = bucketKey(plant)
    setSaving(key)
    try {
      await markCareDone(plant.plant_id, plant.care_type)
      setDoneIds((prev) => new Set([...prev, key]))
    } finally {
      setSaving(null)
    }
  }

  async function handleSkip(plant: BucketPlantOut) {
    if (!plant.care_type) return
    const key = bucketKey(plant)
    setSaving(key)
    try {
      await skipCare(plant.plant_id, plant.care_type)
      setDoneIds((prev) => new Set([...prev, key]))
    } finally {
      setSaving(null)
    }
  }

  async function handleDoneGroup(group: GroupedWarning) {
    setSaving(`group_${group.care_type}`)
    try {
      await Promise.all(group.plants.map((p) => markCareDone(p.plant_id, p.care_type!)))
      setDoneIds((prev) => {
        const next = new Set([...prev])
        group.plants.forEach((p) => next.add(bucketKey(p)))
        return next
      })
      const { label } = getCareTypeDisplay(group.care_type, t)
      showToast(`${group.plants.length}× ${label} · ${t.mapPage.careDone}`)
    } finally {
      setSaving(null)
    }
  }

  async function handleSkipGroup(group: GroupedWarning) {
    setSaving(`group_${group.care_type}`)
    try {
      await Promise.all(group.plants.map((p) => skipCare(p.plant_id, p.care_type!)))
      setDoneIds((prev) => {
        const next = new Set([...prev])
        group.plants.forEach((p) => next.add(bucketKey(p)))
        return next
      })
    } finally {
      setSaving(null)
    }
  }

  if (totalVisible === 0) {
    return (
      <div className="py-6 text-center text-sm text-text-muted italic">
        {t.mapPage.sheetAllGoodGlobal}
      </div>
    )
  }

  const mapGroups = buildMapGroups(summary)

  return (
    <div className="space-y-4 pt-1">
      {mapGroups.map((mg) => {
        const grouped = !mg.isIndoor
        const nuItems = buildBucketItems(mg.nu, doneIds, grouped, t.locale)
        const vandaagItems = buildBucketItems(mg.vandaag, doneIds, grouped, t.locale)
        const weekItems = buildBucketItems(mg.week, doneIds, grouped, t.locale)
        const mapTotal = itemsPlantCount(nuItems) + itemsPlantCount(vandaagItems) + itemsPlantCount(weekItems)
        if (mapTotal === 0) return null

        const isCurrent = !!currentMapName && mg.mapName === currentMapName
        // Only flag "in another garden" for real, non-current maps — not for
        // the unplaced-plants fallback group (which lives in no garden).
        const showOtherGardenHint = !isCurrent && !mg.isUnplaced

        return (
          <div key={mg.mapName}>
            {/* Garden header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted font-semibold truncate">
                {mg.isIndoor ? '🏠' : '🌿'} {mg.mapName}
                {showOtherGardenHint && <span className="ml-1.5 font-normal normal-case tracking-normal opacity-70">· {t.mapPage.sheetOtherGardenHint}</span>}
              </span>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            <Bucket label={t.dashboard.warnings.bucketNow} dotColor="var(--color-overdue)" items={nuItems} t={t} saving={saving} onPlantTap={onPlantTap} onDone={handleDone} onSkip={handleSkip} onDoneGroup={handleDoneGroup} onSkipGroup={handleSkipGroup} />
            <Bucket label={t.dashboard.warnings.bucketToday} dotColor="var(--color-due)" items={vandaagItems} t={t} saving={saving} onPlantTap={onPlantTap} onDone={handleDone} onSkip={handleSkip} onDoneGroup={handleDoneGroup} onSkipGroup={handleSkipGroup} />
            <Bucket label={t.dashboard.warnings.bucketThisWeek} dotColor="var(--color-primary)" items={weekItems} t={t} saving={saving} onPlantTap={onPlantTap} onDone={handleDone} onSkip={handleSkip} onDoneGroup={handleDoneGroup} onSkipGroup={handleSkipGroup} />
          </div>
        )
      })}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[90px] z-[1000] bg-text text-surface px-5 py-2.5 rounded-full text-[13px] shadow-lg pointer-events-none whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

type BucketItemT = ReturnType<typeof buildBucketItems>[number]

interface BucketProps {
  label: string
  dotColor: string
  items: BucketItemT[]
  t: ReturnType<typeof useT>
  saving: string | null
  onPlantTap?: (plantId: number, mapName: string | null) => void
  onDone: (p: BucketPlantOut) => void
  onSkip: (p: BucketPlantOut) => void
  onDoneGroup: (g: GroupedWarning) => void
  onSkipGroup: (g: GroupedWarning) => void
}

function Bucket({ label, dotColor, items, t, saving, onPlantTap, onDone, onSkip, onDoneGroup, onSkipGroup }: BucketProps) {
  if (items.length === 0) return null
  const count = itemsPlantCount(items)
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-text-muted mb-1">
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        {label} · {count}
      </div>
      <div className="border border-border/50 rounded-lg overflow-hidden divide-y divide-border/40">
        {items.map((item) =>
          item.kind === 'group' ? (
            <GroupRow key={`g_${item.group.care_type}`} group={item.group} t={t} saving={saving} onDone={onDoneGroup} onSkip={onSkipGroup} />
          ) : (
            <PlantRow key={bucketKey(item.plant)} plant={item.plant} t={t} saving={saving} onTap={onPlantTap} onDone={onDone} onSkip={onSkip} />
          ),
        )}
      </div>
    </div>
  )
}

function GroupRow({ group, t, saving, onDone, onSkip }: {
  group: GroupedWarning
  t: ReturnType<typeof useT>
  saving: string | null
  onDone: (g: GroupedWarning) => void
  onSkip: (g: GroupedWarning) => void
}) {
  const { icon, label } = getCareTypeDisplay(group.care_type, t)
  const isSaving = saving === `group_${group.care_type}`
  const isUrgent = group.severity === 'urgent'
  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 transition-opacity ${isSaving ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text truncate">
          {icon} {label}
          <span className="text-text-muted font-normal"> · {group.plants.length}</span>
          {group.maxDaysOverdue > 0 && (
            <span className={`ml-1 text-[10px] ${isUrgent ? 'text-overdue' : 'text-due'}`}>+{group.maxDaysOverdue}d</span>
          )}
        </div>
        {group.hint && <div className="text-[10px] text-text-muted italic truncate mt-0.5">{group.hint}</div>}
      </div>
      <CareActions disabled={isSaving} onDone={() => onDone(group)} onSkip={() => onSkip(group)} doneLabel={t.mapPage.careDone} skipLabel={t.mapPage.careSkip} />
    </div>
  )
}

function PlantRow({ plant, t, saving, onTap, onDone, onSkip }: {
  plant: BucketPlantOut
  t: ReturnType<typeof useT>
  saving: string | null
  onTap?: (plantId: number, mapName: string | null) => void
  onDone: (p: BucketPlantOut) => void
  onSkip: (p: BucketPlantOut) => void
}) {
  const isSaving = saving === bucketKey(plant)
  const careInfo = plant.care_type ? getCareTypeDisplay(plant.care_type, t) : null
  const overdue = plant.days_overdue != null && plant.days_overdue > 0
  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 transition-opacity ${isSaving ? 'opacity-50' : ''}`}>
      <button
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
        onClick={() => onTap?.(plant.plant_id, plant.map_name)}
      >
        <div className="min-w-0">
          <div className="text-xs font-medium text-text truncate">{plant.plant_name}</div>
          {careInfo && (
            <div className="text-[10px] text-text-muted truncate mt-0.5">
              {careInfo.icon} {careInfo.label}{overdue ? ` +${plant.days_overdue}d` : ''}
            </div>
          )}
        </div>
      </button>
      {plant.care_type ? (
        <CareActions disabled={isSaving} onDone={() => onDone(plant)} onSkip={() => onSkip(plant)} doneLabel={t.mapPage.careDone} skipLabel={t.mapPage.careSkip} />
      ) : (
        <span className="text-text-muted text-xs shrink-0">→</span>
      )}
    </div>
  )
}

function CareActions({ disabled, onDone, onSkip, doneLabel, skipLabel }: {
  disabled: boolean
  onDone: () => void
  onSkip: () => void
  doneLabel: string
  skipLabel: string
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        disabled={disabled}
        onClick={onDone}
        className="px-2.5 py-1 rounded-full bg-primary text-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
      >
        {doneLabel}
      </button>
      <button
        disabled={disabled}
        onClick={onSkip}
        title={skipLabel}
        className="w-6 h-6 rounded-full text-text-muted text-sm flex items-center justify-center opacity-60 disabled:opacity-30"
      >
        ×
      </button>
    </div>
  )
}

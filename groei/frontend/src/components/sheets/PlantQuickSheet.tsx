import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapPlant, MapObject, GroundZone, Phenology } from '../../types'
import { useGroeiStore } from '../../store/useGroeiStore'
import { updatePlantContainer, updatePlantGroundZone, updatePlantLock } from '../../api/client'
import { CARE_TYPE_INFO } from '../../types'
import PlantCareInfo from '../PlantCareInfo'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getSunHoursAtPosition } from '../../utils/heatmapCalc'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
import { computeSuitability } from '../../utils/suitability'

interface Props {
  plant: MapPlant
  objects: MapObject[]
  groundZones?: GroundZone[]
  heatmapCells?: HeatmapCell[]
  onClose: () => void
  onCareAction: () => void
  onAction: () => void
  onDuplicate?: (plantId: number) => void
  onRemove?: (plantId: number) => void
}

const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MONTH_NAMES_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

const PHASE_COLORS: Record<string, string> = {
  dormant:      '#94a3b8',
  dying_back:   '#cbd5e1',
  establishing: '#86efac',
  growing:      '#22c55e',
  flowering:    '#f472b6',
  fruiting:     '#fb923c',
  harvest:      '#eab308',
  evergreen:    '#16a34a',
  unknown:      '#e2e8f0',
}

function PlantingWindows({ phenology }: { phenology: Phenology }) {
  const fmt = (months: number[]) => months.map(m => MONTH_NAMES_NL[m - 1]).join(', ')
  if (!phenology.sow_window?.length && !phenology.transplant_window?.length && !phenology.harvest_window?.length) return null
  return (
    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
      {phenology.sow_window?.length > 0 && (
        <div className="bg-green-50 rounded p-1">
          <p className="text-[9px] font-medium text-green-700">Zaaien</p>
          <p className="text-[9px] text-green-600">{fmt(phenology.sow_window)}</p>
        </div>
      )}
      {phenology.transplant_window?.length > 0 && (
        <div className="bg-blue-50 rounded p-1">
          <p className="text-[9px] font-medium text-blue-700">Uitplanten</p>
          <p className="text-[9px] text-blue-600">{fmt(phenology.transplant_window)}</p>
        </div>
      )}
      {phenology.harvest_window?.length > 0 && (
        <div className="bg-yellow-50 rounded p-1">
          <p className="text-[9px] font-medium text-yellow-700">Oogst</p>
          <p className="text-[9px] text-yellow-600">{fmt(phenology.harvest_window)}</p>
        </div>
      )}
    </div>
  )
}

function LifecycleBar({ phenology, sunHoursAtPos }: { phenology: Phenology; sunHoursAtPos: number | null }) {
  const currentMonth = new Date().getMonth() + 1
  const suitability = computeSuitability(phenology, sunHoursAtPos ?? 0, currentMonth)

  return (
    <div className="mt-4 bg-bg rounded-xl px-4 py-3">
      <h3 className="text-xs font-semibold text-text-muted mb-2">Jaarkalender</h3>

      {/* Month phase strips */}
      <div className="flex gap-0.5 mb-1">
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1
          const monthData = phenology.months.find(m => m.month === month)
          const phase = monthData?.phase ?? 'unknown'
          const isCurrentMonth = month === currentMonth
          return (
            <div key={month} className="flex-1 flex flex-col items-center" title={monthData?.phase_label_nl ?? ''}>
              <div
                className={`w-full h-5 rounded-sm ${isCurrentMonth ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                style={{ backgroundColor: PHASE_COLORS[phase] ?? PHASE_COLORS.unknown }}
              />
              <span className="text-[8px] text-text-muted mt-0.5">{label}</span>
            </div>
          )
        })}
      </div>

      {/* Current month callout */}
      <div className="mt-2 p-2 bg-surface rounded-lg border border-border">
        <p className="text-xs font-medium text-text">
          Nu ({MONTH_NAMES_NL[currentMonth - 1]}): {suitability.phaseLabel || '—'}
        </p>
        <p className="text-xs text-text-muted mt-0.5">{suitability.detailLabel}</p>
        {suitability.actions.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {suitability.actions.map((action, i) => (
              <li key={i} className="text-xs text-text-muted">→ {action}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Planting windows */}
      <PlantingWindows phenology={phenology} />

      {/* Interesting fact */}
      {phenology.interesting_facts_nl && (
        <p className="text-[10px] text-text-muted italic mt-2 border-t border-border pt-2">
          💡 {phenology.interesting_facts_nl}
        </p>
      )}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  overdue: 'Needs attention',
  due_today: 'Due today',
  good: 'All good',
}

const STATUS_COLORS: Record<string, string> = {
  overdue: 'text-overdue',
  due_today: 'text-due',
  good: 'text-good',
}

export default function PlantQuickSheet({ plant, objects, groundZones = [], heatmapCells, onClose, onCareAction, onAction, onDuplicate, onRemove }: Props) {
  const navigate = useNavigate()
  const markCareDone = useGroeiStore((s) => s.markCareDone)
  const [locked, setLocked] = useState(plant.is_locked)

  // Fallback sun hours: compute from position when heatmap isn't active
  const [computedSunHours, setComputedSunHours] = useState<number | null>(null)
  useEffect(() => {
    if (heatmapCells) return // will use heatmapCells directly
    const container = plant.container_id ? objects.find(o => o.id === plant.container_id) : null
    const px = container ? (container.map_x ?? plant.map_x) : plant.map_x
    const py = container ? (container.map_y ?? plant.map_y) : plant.map_y
    if (px == null || py == null) return
    const month = new Date().getMonth() + 1
    // Defer so the sheet renders immediately, then fills in the value
    const handle = setTimeout(() => setComputedSunHours(getSunHoursAtPosition(px, py, month)), 0)
    return () => clearTimeout(handle)
  }, [plant.id, heatmapCells, objects, plant.container_id, plant.map_x, plant.map_y])

  const handleToggleLock = async () => {
    const next = !locked
    setLocked(next)
    try {
      await updatePlantLock(plant.id, next)
      onAction()
    } catch {
      setLocked(!next)
    }
  }

  const handleWater = async () => {
    try {
      await markCareDone(plant.id, 'water')
      onCareAction()
    } catch (e) {
      console.error('Failed to mark care done:', e)
    }
  }

  const container = plant.container_id
    ? objects.find(o => o.id === plant.container_id)
    : null

  const groundZone = plant.ground_zone_id
    ? groundZones.find(z => z.id === plant.ground_zone_id)
    : null

  const sunFitInfo = (() => {
    if (!plant.sun_requirement) return null
    const pos = container
      ? { x: container.map_x ?? plant.map_x, y: container.map_y ?? plant.map_y }
      : { x: plant.map_x, y: plant.map_y }
    if (pos.x == null || pos.y == null) return null

    let sunHours: number | null = null
    if (heatmapCells) {
      const cell = heatmapCells.find(c =>
        (pos.x as number) >= c.x && (pos.x as number) < c.x + c.w &&
        (pos.y as number) >= c.y && (pos.y as number) < c.y + c.h
      )
      sunHours = cell?.sunHours ?? null
    } else {
      sunHours = computedSunHours
    }

    if (sunHours === null) return null // still computing
    const fit = getSunFit(plant.sun_requirement, sunHours)
    const profile = PLANT_SUN_PROFILES.find(p => p.id === plant.sun_requirement)
    return fit && profile ? { fit, sunHours, profile } : null
  })()

  const handleRemoveFromContainer = async () => {
    await updatePlantContainer(plant.id, null)
    onAction()
  }

  const handleLiftFromZone = async () => {
    await updatePlantGroundZone(plant.id, null, plant.map_x, plant.map_y)
    onAction()
  }

  const urgentInfo = plant.most_urgent
  const careTypeInfo = urgentInfo ? CARE_TYPE_INFO[urgentInfo.care_type as keyof typeof CARE_TYPE_INFO] : null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[env(safe-area-inset-bottom)] animate-slide-up">
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        <div className="px-5 pb-5">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            {plant.photo_path ? (
              <img src={plant.photo_path} alt={plant.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-bg flex items-center justify-center text-2xl shrink-0">
                🌱
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h3 className="text-lg font-semibold text-text truncate">{plant.name}</h3>
                <button
                  onClick={() => { onClose(); navigate(`/plants/${plant.id}`) }}
                  className="text-xs text-primary font-medium shrink-0 hover:underline"
                >
                  Meer info →
                </button>
              </div>
              {plant.species && (
                <p className="text-sm text-text-muted italic">{plant.species}</p>
              )}
              <p className={`text-sm font-medium mt-0.5 ${STATUS_COLORS[plant.care_status]}`}>
                {STATUS_LABELS[plant.care_status]}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {onDuplicate && (
                <button
                  onClick={() => { onDuplicate(plant.id); onClose() }}
                  className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center text-text-muted hover:text-text hover:bg-border transition-colors"
                  title="Kopieer plant"
                >
                  ⎘
                </button>
              )}
              <button
                onClick={() => { onClose(); navigate(`/plants/${plant.id}/edit`) }}
                className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                title="Bewerk plant"
              >
                ✏️
              </button>
              <button
                onClick={handleToggleLock}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  locked
                    ? 'bg-amber-500/20 text-amber-600'
                    : 'bg-bg text-text-muted hover:text-amber-500 hover:bg-amber-500/10'
                }`}
                title={locked ? 'Ontgrendel plant' : 'Vergrendel plant'}
              >
                {locked ? '🔒' : '🔓'}
              </button>
              {onRemove && (
                <button
                  onClick={() => { onRemove(plant.id); onClose() }}
                  className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center text-text-muted hover:text-overdue hover:bg-overdue/10 transition-colors"
                  title="Verwijder plant"
                >
                  🗑
                </button>
              )}
            </div>
          </div>

          {/* Care info */}
          {urgentInfo && (
            <div className="bg-bg rounded-xl px-4 py-3 mb-4 text-sm text-text-muted">
              {careTypeInfo?.icon} Needs {careTypeInfo?.label.toLowerCase() ?? urgentInfo.care_type}
              {urgentInfo.days_overdue > 0 && (
                <span className="text-overdue font-medium"> — {urgentInfo.days_overdue} day{urgentInfo.days_overdue !== 1 ? 's' : ''} overdue</span>
              )}
              {urgentInfo.last_done_by && (
                <span className="block mt-1">Last by {urgentInfo.last_done_by}</span>
              )}
            </div>
          )}

          {/* Container info */}
          {container && (
            <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4">
              <span className="text-sm text-text-muted flex-1">
                In: <span className="text-text font-medium">{container.name}</span>
              </span>
              <button
                onClick={handleRemoveFromContainer}
                className="text-xs text-text-muted hover:text-overdue transition-colors"
              >
                Remove
              </button>
            </div>
          )}

          {/* Ground zone info */}
          {groundZone && (
            <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-text-muted">
                  Geplant in: <span className="text-text font-medium">{groundZone.name}</span>
                </span>
                {groundZone.soil_note && (
                  <p className="text-xs text-text-muted mt-0.5 italic">{groundZone.soil_note}</p>
                )}
              </div>
              <button
                onClick={handleLiftFromZone}
                className="text-xs text-text-muted hover:text-overdue transition-colors shrink-0"
              >
                Verplaatsen
              </button>
            </div>
          )}

          {/* Sun-fit row */}
          {sunFitInfo && (
            <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4">
              <span className="text-base">☀️</span>
              <span className="text-sm text-text-muted flex-1">
                Dit punt:{' '}
                <span className="text-text font-medium">~{sunFitInfo.sunHours.toFixed(1)}u</span>
                {' · '}{sunFitInfo.profile.labelNl}
              </span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: SUN_FIT_COLORS[sunFitInfo.fit] + '22',
                  color: SUN_FIT_COLORS[sunFitInfo.fit],
                }}
              >
                {sunFitInfo.fit === 'good' ? '✓ Geschikt' : sunFitInfo.fit === 'partial' ? '~ Deels' : '⚠ Te weinig'}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleWater}
              className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
            >
              💧 Water
            </button>
            <button
              onClick={() => { onClose(); navigate(`/plants/${plant.id}/edit`) }}
              className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
            >
              ✏️ Bewerken
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

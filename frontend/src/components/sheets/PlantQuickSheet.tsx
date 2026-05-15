import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapPlant, MapObject, GroundZone, Plant } from '../../types'
import { CARE_TYPE_INFO } from '../../types'
import { useGroeiStore } from '../../store/useGroeiStore'
import { updatePlantContainer, updatePlantGroundZone, updatePlantLock, fetchPlant } from '../../api/client'

import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'


interface Props {
  plant: MapPlant
  objects: MapObject[]
  soilGroundZones?: GroundZone[]
  heatmapCells?: HeatmapCell[]
  onClose: () => void
  onCareAction: () => void
  onAction: () => void
  onDuplicate?: (plantId: number) => void
  onRemove?: (plantId: number) => void
}


export default function PlantQuickSheet({ plant, objects, soilGroundZones = [], heatmapCells, onClose, onCareAction, onAction, onDuplicate, onRemove }: Props) {
  const navigate = useNavigate()
  const markCareDone = useGroeiStore((s) => s.markCareDone)
  const [locked, setLocked] = useState(plant.is_locked)
  const [detail, setDetail] = useState<Plant | null>(null)

  useEffect(() => {
    setDetail(null)
    fetchPlant(plant.id).then(setDetail).catch(() => {})
  }, [plant.id])

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

  const handleFertilize = async () => {
    try {
      await markCareDone(plant.id, 'fertilize')
      onCareAction()
    } catch (e) {
      console.error('Failed to mark fertilize done:', e)
    }
  }

  const container = plant.container_id
    ? objects.find(o => o.id === plant.container_id)
    : null

  const groundZone = plant.ground_zone_id
    ? soilGroundZones.find(z => z.id === plant.ground_zone_id)
    : null

  const sunFitInfo = (() => {
    if (!plant.sun_requirement) return null
    const pos = container
      ? { x: container.map_x ?? plant.map_x, y: container.map_y ?? plant.map_y }
      : { x: plant.map_x, y: plant.map_y }
    if (pos.x == null || pos.y == null) return null

    if (!heatmapCells) return null
    const cell = heatmapCells.find(c =>
      (pos.x as number) >= c.x && (pos.x as number) < c.x + c.w &&
      (pos.y as number) >= c.y && (pos.y as number) < c.y + c.h
    )
    const sunHours = cell?.sunHours ?? null

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

          {/* Care schedules */}
          {detail?.care_schedules && detail.care_schedules.length > 0 ? (
            <div className="flex flex-col gap-2 mb-4">
              {detail.care_schedules.map(sched => {
                const nextDue = new Date(sched.next_due)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const diffMs = nextDue.getTime() - today.getTime()
                const daysUntil = Math.round(diffMs / 86400000)
                const isOverdue = daysUntil < 0
                const isDueToday = daysUntil === 0

                const info = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
                const labelMap: Record<string, string> = {
                  water: 'Gieten', fertilize: 'Bemesten', prune: 'Snoeien', repot_check: 'Verpotten',
                  mist: 'Sproeien', rotate: 'Draaien', protect_cold: 'Beschermen tegen kou', protect_heat: 'Beschermen tegen hitte',
                }
                const icon = info?.icon ?? '📋'
                const label = labelMap[sched.care_type] ?? info?.label ?? sched.care_type

                let statusText: string
                let statusColor: string
                if (isOverdue) {
                  statusText = `${Math.abs(daysUntil)} dag${Math.abs(daysUntil) === 1 ? '' : 'en'} te laat`
                  statusColor = 'var(--color-overdue)'
                } else if (isDueToday) {
                  statusText = 'vandaag'
                  statusColor = 'var(--color-due)'
                } else {
                  statusText = `over ${daysUntil} dag${daysUntil === 1 ? '' : 'en'}`
                  statusColor = 'var(--color-text-muted)'
                }

                return (
                  <div
                    key={sched.id}
                    className="flex items-center gap-2.5 px-3 py-2 bg-bg rounded-xl border border-border-soft"
                    style={{
                      borderColor: isOverdue ? 'var(--color-overdue)' : undefined,
                    }}
                  >
                    <span className="text-lg">{icon}</span>
                    <span className="flex-1 text-text text-sm">
                      {label}
                    </span>
                    <span className="font-mono text-xs" style={{ color: statusColor }}>
                      {statusText}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            // Fallback: show most_urgent if detail not yet loaded
            plant.most_urgent && (
              <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4 text-sm text-text-muted">
                <span>💧</span>
                <span>{plant.most_urgent.care_type} · {plant.most_urgent.days_overdue > 0 ? `${plant.most_urgent.days_overdue}d te laat` : 'vandaag'}</span>
              </div>
            )
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
              onClick={handleFertilize}
              className="flex-1 bg-emerald-green/15 text-emerald-green rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
            >
              🌿 Bemesten
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

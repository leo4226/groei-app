import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapPlant, MapObject, GroundZone, Plant, MapInfo } from '../../types'
import { CARE_TYPE_INFO } from '../../types'
import { useFloreren } from '../../store/useFloreren'
import { plants as plantsApi } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
import MovePlantSheet from './MovePlantSheet'

interface Props {
  plant: MapPlant
  objects: MapObject[]
  soilGroundZones?: GroundZone[]
  heatmapCells?: HeatmapCell[]
  mapId: number
  mapName: string
  onClose: () => void
  onCareAction: () => void
  onAction: () => void
  onMoveOnMap?: (plant: MapPlant) => void | Promise<void>
  onDuplicate?: (plantId: number) => void
  onRemove?: (plantId: number) => void
}

export default function PlantQuickSheet({
  plant, objects, soilGroundZones = [], heatmapCells,
  mapId, mapName,
  onClose, onCareAction, onAction, onMoveOnMap, onDuplicate, onRemove,
}: Props) {
  const t = useT()
  const navigate = useNavigate()
  const markCareDone = useFloreren((s) => s.markCareDone)
  const [locked, setLocked] = useState(plant.is_locked)
  const [detail, setDetail] = useState<Plant | null>(null)
  const [doneTypes, setDoneTypes] = useState<Set<string>>(new Set())
  const [savingType, setSavingType] = useState<string | null>(null)
  const [startingMapMove, setStartingMapMove] = useState(false)
  const [showMoveSheet, setShowMoveSheet] = useState(false)
  const [moveError, setMoveError] = useState(false)

  const handleMovePlant = async (targetMap: MapInfo) => {
    setMoveError(false)
    // The plant's old map_x/map_y are meaningless on a different map (different
    // viewbox), so drop it at a fresh spot inside the target map — mirrors how
    // EditPlant/AddPlant place a plant when assigning it to a map.
    const [x0, y0, w, h] = targetMap.viewbox.split(' ').map(Number)
    const pad = Math.min(w, h) * 0.12
    const map_x = Math.round((x0 + pad + Math.random() * (w - pad * 2)) * 10) / 10
    const map_y = Math.round((y0 + pad + Math.random() * (h - pad * 2)) * 10) / 10
    try {
      await plantsApi.update(plant.id, { map_id: targetMap.id, map_x, map_y })
      setShowMoveSheet(false)
      onAction()
    } catch {
      // Move failed — keep the sheet open and surface an error so the user knows
      setMoveError(true)
    }
  }

  useEffect(() => {
    setDetail(null)
    setDoneTypes(new Set())
    plantsApi.get(plant.id).then(setDetail).catch(() => {})
  }, [plant.id])

  // ── Icon resolution: icon_key → photo → emoji ──
  const iconUrl = plant.icon_key ? resolveIconUrl(plant.icon_key) : null

  // ── Care schedules: only overdue/today, minus already-done ──
  const urgentSchedules = (detail?.care_schedules ?? []).filter(sched => {
    if (doneTypes.has(sched.care_type)) return false
    const days = Math.round((new Date(sched.next_due).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
    return days <= 0
  })

  const careLabelMap: Record<string, string> = {
    water: t.plantQuickSheet.careWater,
    fertilize: t.plantQuickSheet.careFertilize,
    prune: t.plantQuickSheet.carePrune,
    repot_check: t.plantQuickSheet.careRepot,
    mist: t.plantQuickSheet.careMist,
    rotate: t.plantQuickSheet.careRotate,
    protect_cold: t.plantQuickSheet.careProtectCold,
    protect_heat: t.plantQuickSheet.careProtectHeat,
  }

  const handleCare = async (careType: string) => {
    setSavingType(careType)
    try {
      await markCareDone(plant.id, careType)
      setDoneTypes(prev => new Set([...prev, careType]))
      onCareAction()
    } finally {
      setSavingType(null)
    }
  }

  const handleToggleLock = async () => {
    const next = !locked
    setLocked(next)
    try {
      await plantsApi.setLock(plant.id, next)
      onAction()
    } catch {
      setLocked(!next)
    }
  }

  const handleMoveOnMap = async () => {
    if (!onMoveOnMap) return
    setStartingMapMove(true)
    try {
      await onMoveOnMap(plant)
      onClose()
    } finally {
      setStartingMapMove(false)
    }
  }

  const handleRemoveFromContainer = async () => {
    await plantsApi.setContainer(plant.id, null)
    onAction()
  }

  const handleLiftFromZone = async () => {
    await plantsApi.setGroundZone(plant.id, null, plant.map_x, plant.map_y)
    onAction()
  }

  const container = plant.container_id ? objects.find(o => o.id === plant.container_id) : null
  const groundZone = plant.ground_zone_id ? soilGroundZones.find(z => z.id === plant.ground_zone_id) : null

  const sunFitInfo = (() => {
    if (!plant.sun_requirement || !heatmapCells) return null
    const pos = container
      ? { x: container.map_x ?? plant.map_x, y: container.map_y ?? plant.map_y }
      : { x: plant.map_x, y: plant.map_y }
    if (pos.x == null || pos.y == null) return null
    const cell = heatmapCells.find(c =>
      (pos.x as number) >= c.x && (pos.x as number) < c.x + c.w &&
      (pos.y as number) >= c.y && (pos.y as number) < c.y + c.h
    )
    const sunHours = cell?.sunHours ?? null
    if (sunHours === null) return null
    const fit = getSunFit(plant.sun_requirement, sunHours)
    const profile = PLANT_SUN_PROFILES.find(p => p.id === plant.sun_requirement)
    return fit && profile ? { fit, sunHours, profile } : null
  })()

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl animate-slide-up flex flex-col"
        style={{ maxHeight: '85dvh' }}
      >
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="shrink-0 pt-3 pb-1 flex justify-center w-full group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        {/* Scrollable body */}
        <div
          className="overflow-y-auto flex-1 px-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
        >

          {/* ── Header ── */}
          <div className="flex items-center gap-3 py-4">
            {/* Plant icon */}
            <div className="w-14 h-14 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                 style={{ background: 'linear-gradient(145deg,#FDFAF1,#F4EEDB)', border: '1px solid var(--color-border-soft)' }}>
              {iconUrl ? (
                <img src={iconUrl} alt="" style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
              ) : plant.photo_path ? (
                <img src={plant.photo_path} alt={plant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 26 }}>🌱</span>
              )}
            </div>

            {/* Name + species + meer info */}
            <div className="flex-1 min-w-0">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 18, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {plant.name}
              </h3>
              {plant.species && (
                <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {plant.species}
                </p>
              )}
              <button
                onClick={() => { onClose(); navigate(`/plants/${plant.id}`) }}
                style={{ marginTop: 4, padding: 0, background: 'none', border: 'none', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 500, color: 'var(--color-primary)', cursor: 'pointer', display: 'block' }}
              >
                {t.plantQuickSheet.moreInfo}
              </button>
            </div>

            {/* Action icons + close — always visible at the top */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <button
                onClick={() => { setMoveError(false); setShowMoveSheet(true) }}
                title={t.plantQuickSheet.moveToMap}
                style={headerIconBtnStyle}
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                  <path d="M4 2L2 4l2 2M11 2l2 2-2 2M2 7.5h11M4 11l-2 2 2 2M11 11l2 2-2 2M7.5 2v11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {onDuplicate && (
                <button
                  onClick={() => { onDuplicate(plant.id); onClose() }}
                  title={t.plantQuickSheet.duplicate}
                  style={headerIconBtnStyle}
                >
                  <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                    <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M2 11V2h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
              <button
                onClick={() => { onClose(); navigate(`/plants/${plant.id}/edit`) }}
                title={t.plantQuickSheet.edit}
                style={headerIconBtnStyle}
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                  <path d="M10.5 2.5l2 2L5 12H3v-2l7.5-7.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                onClick={handleToggleLock}
                title={locked ? t.plantQuickSheet.unlock : t.plantQuickSheet.lock}
                style={{ ...headerIconBtnStyle, color: locked ? 'var(--color-due)' : undefined, background: locked ? 'rgba(212,148,58,0.12)' : headerIconBtnStyle.background }}
              >
                {locked ? (
                  <svg width="13" height="14" viewBox="0 0 14 15" fill="none">
                    <rect x="2" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M4.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="13" height="14" viewBox="0 0 14 15" fill="none">
                    <rect x="2" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M4.5 7V5a2.5 2.5 0 015 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
              {onRemove && (
                <button
                  onClick={() => { onRemove(plant.id); onClose() }}
                  title={t.plantQuickSheet.remove}
                  style={{ ...headerIconBtnStyle, color: 'var(--color-overdue)', background: 'rgba(200,60,60,0.08)' }}
                >
                  <svg width="13" height="14" viewBox="0 0 14 15" fill="none">
                    <path d="M2 4h10M5 4V2.5h4V4M6 7v4M8 7v4M3 4l.75 8.5h6.5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              {/* Close */}
              <button
                onClick={onClose}
                aria-label={t.plantQuickSheet.close}
                style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', flexShrink: 0, cursor: 'pointer' }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M10 2L2 10M2 2l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Care signals (overdue + due today only) ── */}
          <div style={{ marginBottom: 14 }}>
            {detail === null && plant.most_urgent && !doneTypes.has(plant.most_urgent.care_type) ? (
              // Loading skeleton — show most_urgent as placeholder
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg)', borderLeft: '3px solid var(--color-overdue)' }}>
                <span style={{ fontSize: 16 }}>
                  {CARE_TYPE_INFO[plant.most_urgent.care_type as keyof typeof CARE_TYPE_INFO]?.icon ?? '📋'}
                </span>
                <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontSize: 14, color: 'var(--color-text)' }}>
                  {careLabelMap[plant.most_urgent.care_type] ?? plant.most_urgent.care_type}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-overdue)' }}>
                  {plant.most_urgent.days_overdue > 0 ? t.plantQuickSheet.overdue(plant.most_urgent.days_overdue) : t.plantQuickSheet.today}
                </span>
              </div>
            ) : urgentSchedules.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {urgentSchedules.map(sched => {
                  const days = Math.round((new Date(sched.next_due).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                  const isOverdue = days < 0
                  const info = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
                  const isSaving = savingType === sched.care_type
                  return (
                    <div key={sched.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg)', borderLeft: `3px solid ${isOverdue ? 'var(--color-overdue)' : 'var(--color-due)'}`, opacity: isSaving ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{info?.icon ?? '📋'}</span>
                      <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontSize: 14, color: 'var(--color-text)' }}>
                        {careLabelMap[sched.care_type] ?? info?.label ?? sched.care_type}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isOverdue ? 'var(--color-overdue)' : 'var(--color-due)', marginRight: 8, flexShrink: 0 }}>
                        {isOverdue ? t.plantQuickSheet.overdue(Math.abs(days)) : t.plantQuickSheet.today}
                      </span>
                      <button
                        disabled={isSaving}
                        onClick={() => handleCare(sched.care_type)}
                        style={{ padding: '4px 10px', borderRadius: 99, background: 'var(--color-primary)', color: '#fff', border: 'none', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                      >
                        Gedaan
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : detail !== null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--color-bg)' }}>
                <span style={{ color: 'var(--color-primary)', fontSize: 14 }}>✓</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)' }}>Alles op schema</span>
              </div>
            ) : null}
          </div>

          {/* ── Sun fit ── */}
          {sunFitInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--color-bg)', marginBottom: 14 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>☀</span>
              <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-text-muted)' }}>
                ~{sunFitInfo.sunHours.toFixed(1)}u{' · '}{sunFitInfo.profile.labelNl}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: SUN_FIT_COLORS[sunFitInfo.fit] + '22', color: SUN_FIT_COLORS[sunFitInfo.fit], flexShrink: 0 }}>
                {sunFitInfo.fit === 'good' ? t.plantQuickSheet.goodFit : sunFitInfo.fit === 'partial' ? t.plantQuickSheet.partialFit : t.plantQuickSheet.insufficientFit}
              </span>
            </div>
          )}

          {/* ── Container / ground zone ── */}
          {container && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--color-bg)', marginBottom: 10 }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-text-muted)' }}>
                {t.plantQuickSheet.plantedIn} <strong style={{ color: 'var(--color-text)', fontWeight: 500 }}>{container.name}</strong>
              </span>
              <button onClick={handleRemoveFromContainer} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {t.plantQuickSheet.removeFrom}
              </button>
            </div>
          )}
          {groundZone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--color-bg)', marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {t.plantQuickSheet.plantedIn} <strong style={{ color: 'var(--color-text)', fontWeight: 500 }}>{groundZone.name}</strong>
                </span>
                {groundZone.soil_note && <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-muted)' }}>{groundZone.soil_note}</p>}
              </div>
              <button onClick={handleLiftFromZone} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                {t.plantQuickSheet.move}
              </button>
            </div>
          )}

          {/* ── Primary care actions ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, marginTop: 6 }}>
            <button
              onClick={() => handleCare('water')}
              disabled={savingType === 'water'}
              style={{ flex: 1, padding: '14px 0', borderRadius: 12, background: 'var(--color-primary)', color: '#fff', border: 'none', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: savingType === 'water' ? 0.6 : 1, transition: 'opacity 0.15s' }}
            >
              {t.plantQuickSheet.water}
            </button>
            <button
              onClick={() => handleCare('fertilize')}
              disabled={savingType === 'fertilize'}
              style={{ flex: 1, padding: '14px 0', borderRadius: 12, background: 'rgba(47,93,58,0.12)', color: 'var(--color-primary)', border: 'none', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: savingType === 'fertilize' ? 0.6 : 1, transition: 'opacity 0.15s' }}
            >
              {t.plantQuickSheet.fertilize}
            </button>
          </div>

          {onMoveOnMap && (
            <button
              onClick={handleMoveOnMap}
              disabled={startingMapMove}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10, padding: '12px 0', borderRadius: 12, background: 'var(--color-bg)', color: 'var(--color-primary)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: startingMapMove ? 0.65 : 1 }}
            >
              <span aria-hidden="true">↔</span>
              {t.plantQuickSheet.moveOnMap}
            </button>
          )}

        </div>
      </div>

      {showMoveSheet && (
        <MovePlantSheet
          currentMapId={mapId}
          currentMapName={mapName}
          error={moveError}
          onSelect={handleMovePlant}
          onClose={() => setShowMoveSheet(false)}
        />
      )}
    </>
  )
}

const headerIconBtnStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border-soft)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--color-text-muted)',
  cursor: 'pointer', flexShrink: 0,
}

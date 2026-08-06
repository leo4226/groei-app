import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MapPlant, MapObject, GroundZone, Plant, MapInfo, SecondaryMarker } from '../../types'
import { CARE_TYPE_INFO } from '../../types'
import { useFloreren } from '../../store/useFloreren'
import { plants as plantsApi } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'
import { plantDisplayName } from '../../utils/plantDisplayName'
import { compressImage } from '../../utils/compressImage'
import CareIcon, { type CareIconType } from '../ui/CareIcon'
import Glyph from '../ui/Glyph'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
import MovePlantSheet from './MovePlantSheet'
import './plantQuickSheet.css'
import {
  PLANT_QUICK_SHEET_BODY_CLASS,
  PLANT_QUICK_SHEET_CLASS,
  PLANT_QUICK_SHEET_HEADER_CLASS,
  clampedPlantNameStyle,
  clampedPlantSpeciesStyle,
  plantQuickSheetBodyStyle,
  plantQuickSheetStyle,
} from './plantQuickSheetLayout'

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
  placements?: SecondaryMarker[]
  onAddPlacement?: () => void
  onDeletePlacement?: (placementId: number) => void
  onUpdatePlacementPhase?: (placementId: number, phase: string) => void
}

export default function PlantQuickSheet({
  plant, objects, soilGroundZones = [], heatmapCells,
  mapId, mapName,
  onClose, onCareAction, onAction, onMoveOnMap, onDuplicate, onRemove,
  placements = [], onAddPlacement, onDeletePlacement, onUpdatePlacementPhase,
}: Props) {
  const t = useT()
  const navigate = useNavigate()
  const markCareDone = useFloreren((s) => s.markCareDone)
  const undoCare = useFloreren((s) => s.undoCare)
  const [locked, setLocked] = useState(plant.is_locked)
  const [detail, setDetail] = useState<Plant | null>(null)
  const [doneTypes, setDoneTypes] = useState<Set<string>>(new Set())
  // Previous schedule state captured when a chip logged care, so tapping the
  // chip again can undo (restore next_due/last_done, or just delete the log
  // when the plant has no schedule for that care type).
  const [doneState, setDoneState] = useState<Record<string, { care_log_id: number; previous_next_due: string | null; previous_last_done: string | null; previous_last_done_by: number | null }>>({})
  const [savingType, setSavingType] = useState<string | null>(null)
  const [, setStartingMapMove] = useState(false)
  const [showMoveSheet, setShowMoveSheet] = useState(false)
  const [moveError, setMoveError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Manual "measured sun" override (#645). Held locally so the sheet reflects
  // the change immediately; persisted via plantsApi.update, null = cleared.
  const [measuredSun, setMeasuredSun] = useState<number | null>(plant.measured_sun_hours)
  const [sunEditorOpen, setSunEditorOpen] = useState(false)
  const [savingSun, setSavingSun] = useState(false)
  const [sunDraft, setSunDraft] = useState(0)

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingPhoto(true)
    try {
      const compressed = await compressImage(file)
      await plantsApi.uploadPhoto(plant.id, new File([compressed], 'photo.jpg', { type: 'image/jpeg' }))
      onAction()  // refresh map data so the new photo shows on the tile
    } catch (err) {
      console.error('Progress photo upload failed', err)
    } finally {
      setUploadingPhoto(false)
    }
  }

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
    setDoneState({})
    setMeasuredSun(plant.measured_sun_hours)
    setSunEditorOpen(false)
    plantsApi.get(plant.id).then(setDetail).catch(() => {})
  }, [plant.id])

  // Persist a measured-sun value (or null to clear) and refresh map markers.
  const handleSetMeasuredSun = async (value: number | null) => {
    const prev = measuredSun
    setMeasuredSun(value)
    setSavingSun(true)
    try {
      await plantsApi.update(plant.id, { measured_sun_hours: value })
      onAction()
    } catch {
      setMeasuredSun(prev)
    } finally {
      setSavingSun(false)
    }
  }

  // ── Icon resolution: icon_key → photo → emoji ──
  const iconUrl = plant.icon_key ? resolveIconUrl(plant.icon_key) : null
  const displayName = plantDisplayName(plant, t.locale)

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
    repot: t.plantQuickSheet.careRepot,
    mist: t.plantQuickSheet.careMist,
    rotate: t.plantQuickSheet.careRotate,
    frost_protect: t.plantQuickSheet.careProtectCold,
    heat_protect: t.plantQuickSheet.careProtectHeat,
  }

  // Days-until-due per scheduled care type (negative = overdue, 0 = today).
  const dueByType = new Map<string, number>()
  for (const s of detail?.care_schedules ?? []) {
    const days = Math.round((new Date(s.next_due).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
    const prev = dueByType.get(s.care_type)
    if (prev === undefined || days < prev) dueByType.set(s.care_type, days)
  }
  // Quick-log chips: water + feed always, plus any other scheduled care type.
  const CARE_ORDER = ['water', 'fertilize', 'prune', 'mist', 'rotate', 'repot', 'frost_protect', 'heat_protect']
  const careChipTypes = CARE_ORDER.filter((ct) => ct === 'water' || ct === 'fertilize' || dueByType.has(ct))

  const handleCare = async (careType: string) => {
    setSavingType(careType)
    try {
      if (doneTypes.has(careType)) {
        // Chip was already logged in this sheet — tapping again undoes it.
        const prev = doneState[careType]
        if (prev) {
          await undoCare(plant.id, prev.care_log_id, prev.previous_next_due, prev.previous_last_done, prev.previous_last_done_by)
          setDoneTypes((prevSet) => {
            const next = new Set(prevSet)
            next.delete(careType)
            return next
          })
          setDoneState((prevMap) => {
            const next = { ...prevMap }
            delete next[careType]
            return next
          })
          onCareAction()
        }
      } else {
        const result = await markCareDone(plant.id, careType)
        if (result) {
          setDoneState((prev) => ({
            ...prev,
            [careType]: {
              care_log_id: result.care_log_id,
              previous_next_due: result.previous_next_due,
              previous_last_done: result.previous_last_done,
              previous_last_done_by: result.previous_last_done_by,
            },
          }))
        }
        setDoneTypes(prev => new Set([...prev, careType]))
        onCareAction()
      }
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
    if (!plant.sun_requirement) return null
    const profile = PLANT_SUN_PROFILES.find(p => p.id === plant.sun_requirement)
    if (!profile) return null
    // Modelled sun at the plant's (or its container's) position, when a heatmap
    // is available. A measured override wins over this and lets the fit show
    // even without heatmap data (e.g. a container without modelled sun).
    let modelled: number | null = null
    if (heatmapCells) {
      const pos = container
        ? { x: container.map_x ?? plant.map_x, y: container.map_y ?? plant.map_y }
        : { x: plant.map_x, y: plant.map_y }
      if (pos.x != null && pos.y != null) {
        const cell = heatmapCells.find(c =>
          (pos.x as number) >= c.x && (pos.x as number) < c.x + c.w &&
          (pos.y as number) >= c.y && (pos.y as number) < c.y + c.h
        )
        modelled = cell?.sunHours ?? null
      }
    }
    if (measuredSun == null && modelled == null) return null
    const sunHours = measuredSun ?? (modelled as number)
    const source: 'measured' | 'estimated' = measuredSun != null ? 'measured' : 'estimated'
    const fit = getSunFit(plant.sun_requirement, sunHours)
    return fit ? { fit, sunHours, source, profile } : null
  })()

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 lg:bg-black/20 z-40" onClick={onClose} />

      {/* Sheet */}
      <div
        className={PLANT_QUICK_SHEET_CLASS}
        style={plantQuickSheetStyle()}
      >
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="plant-quick-sheet-handle shrink-0 pt-3 pb-1 flex justify-center w-full group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        {/* Scrollable body */}
        <div
          className={PLANT_QUICK_SHEET_BODY_CLASS}
          style={plantQuickSheetBodyStyle()}
        >

          {/* ── Header: photo + name + overflow menu ── */}
          <div className={PLANT_QUICK_SHEET_HEADER_CLASS}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              {/* Photo / icon tile — tap to log a progress photo */}
              <button
                onClick={() => photoInputRef.current?.click()}
                aria-label={t.plantQuickSheet.addPhoto}
                style={{
                  position: 'relative', width: 'var(--plant-quick-sheet-photo-size)', height: 'var(--plant-quick-sheet-photo-size)', borderRadius: 12, padding: 0,
                  overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(145deg,#FDFAF1,#F4EEDB)', border: '1px solid var(--color-border-soft)',
                }}
              >
                {plant.photo_path ? (
                  <img src={plant.photo_path} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : iconUrl ? (
                  <img src={iconUrl} alt="" style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ color: 'var(--color-primary)' }}><CareIcon type="sprout" size={28} strokeWidth={1.6} /></span>
                )}
                <span style={{
                  position: 'absolute', right: 2, bottom: 2, width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 10, border: '1.5px solid var(--color-surface)',
                }}>{uploadingPhoto ? '…' : <CareIcon type="photo" size={11} strokeWidth={2.2} />}</span>
              </button>

              {/* Name + species + more info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={clampedPlantNameStyle()}>{displayName}</h3>
                {plant.species && <p style={clampedPlantSpeciesStyle()}>{plant.species}</p>}
                {plant.quantity > 1 && (
                  <p style={{ margin: '3px 0 0', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)' }}>
                    <Glyph name="sprout" size={12} aria-hidden="true" />{t.plantQuickSheet.quantityCount(plant.quantity)}
                  </p>
                )}
                <button
                                  onClick={() => { onClose(); navigate(`/plants/${plant.id}`) }}
                                  style={{ marginTop: 4, padding: 0, background: 'none', border: 'none', fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-moreinfo-size, 12px)', fontWeight: 500, color: 'var(--color-primary)', cursor: 'pointer', display: 'block' }}
                                >
                  {t.plantQuickSheet.moreInfo}
                </button>
              </div>

              {/* Overflow (⋯) — rare management actions. Desktop: inline icon row; mobile: dropdown. */}
                            <div style={{ position: 'relative', flexShrink: 0 }} className="lg:hidden">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={t.plantQuickSheet.menu}
                  style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--color-border-soft)', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                </button>
                {menuOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setMenuOpen(false)} />
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 61, minWidth: 200, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 6 }}>
                      <button style={menuItemStyle} onClick={() => { setMenuOpen(false); onClose(); navigate(`/plants/${plant.id}/edit`) }}><span style={menuIconStyle}><Glyph name="edit" size={15} /></span>{t.plantQuickSheet.edit}</button>
                      {onMoveOnMap && (
                        <button style={menuItemStyle} onClick={() => { setMenuOpen(false); void handleMoveOnMap() }}><span style={menuIconStyle}>↔</span>{t.plantQuickSheet.moveOnMap}</button>
                      )}
                      <button style={menuItemStyle} onClick={() => { setMenuOpen(false); setMoveError(false); setShowMoveSheet(true) }}><span style={menuIconStyle}>⇄</span>{t.plantQuickSheet.moveToMap}</button>
                      {onDuplicate && (
                        <button style={menuItemStyle} onClick={() => { setMenuOpen(false); onDuplicate(plant.id); onClose() }}><span style={menuIconStyle}>⧉</span>{t.plantQuickSheet.duplicate}</button>
                      )}
                      <button style={menuItemStyle} onClick={() => { setMenuOpen(false); void handleToggleLock() }}><span style={menuIconStyle}><Glyph name={locked ? 'unlock' : 'lock'} size={15} /></span>{locked ? t.plantQuickSheet.unlock : t.plantQuickSheet.lock}</button>
                      {onRemove && (
                        <button style={{ ...menuItemStyle, color: 'var(--color-overdue)' }} onClick={() => { setMenuOpen(false); onRemove(plant.id); onClose() }}><span style={menuIconStyle}><Glyph name="trash" size={15} /></span>{t.plantQuickSheet.remove}</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} style={{ display: 'none' }} />

            {/* Desktop management icon row — replaces the ⋯ dropdown at ≥1024px */}
            <div className="hidden lg:grid grid-cols-3 mt-2" style={{ width: 'fit-content', gap: 10 }}>
              <button onClick={() => { onClose(); navigate(`/plants/${plant.id}/edit`) }} title={t.plantQuickSheet.edit} style={desktopIconStyle}><Glyph name="edit" size={14} /></button>
              {onMoveOnMap && (<button onClick={() => void handleMoveOnMap()} title={t.plantQuickSheet.moveOnMap} style={desktopIconStyle}><span style={{ fontSize: 14, lineHeight: 1 }}>↔</span></button>)}
              <button onClick={() => { setMoveError(false); setShowMoveSheet(true) }} title={t.plantQuickSheet.moveToMap} style={desktopIconStyle}><span style={{ fontSize: 14, lineHeight: 1 }}>⇄</span></button>
              {onDuplicate && (<button onClick={() => { onDuplicate(plant.id); onClose() }} title={t.plantQuickSheet.duplicate} style={desktopIconStyle}><span style={{ fontSize: 14, lineHeight: 1 }}>⧉</span></button>)}
              <button onClick={() => void handleToggleLock()} title={locked ? t.plantQuickSheet.unlock : t.plantQuickSheet.lock} style={desktopIconStyle}><Glyph name={locked ? 'unlock' : 'lock'} size={14} /></button>
              {onRemove && (<button onClick={() => { onRemove(plant.id); onClose() }} title={t.plantQuickSheet.remove} style={{ ...desktopIconStyle, color: 'var(--color-overdue)' }}><Glyph name="trash" size={14} /></button>)}
            </div>
          </div>

          {/* ── Status line + one-tap care chips ── */}
          <div className="plant-quick-sheet-care" style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 12, minHeight: 18 }}>
              {urgentSchedules.length > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-status-size, 13px)', fontWeight: 600, color: 'var(--color-overdue)' }}>
                  <Glyph name="alert" size={14} aria-hidden="true" />{t.plantQuickSheet.tasksDue(urgentSchedules.length)}
                </span>
              ) : detail !== null ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 'var(--pq-status-size, 13px)', color: 'var(--color-text-muted)' }}>
                  <Glyph name="check" size={14} style={{ color: 'var(--color-primary)' }} />{t.mapPage.sheetAllGood}
                </span>
              ) : null}
            </div>

            {/* One-tap care chips — tap to log "done today"; + a progress-photo chip */}
            <div className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {careChipTypes.map((ct) => {
                const info = CARE_TYPE_INFO[ct as keyof typeof CARE_TYPE_INFO]
                const due = dueByType.get(ct)
                const overdue = due !== undefined && due < 0
                const dueToday = due === 0
                const done = doneTypes.has(ct)
                const saving = savingType === ct
                const ring = done ? 'var(--color-primary)' : overdue ? 'var(--color-overdue)' : dueToday ? 'var(--color-due)' : 'var(--color-border)'
                return (
                  <button
                    key={ct}
                    onClick={() => handleCare(ct)}
                    disabled={saving}
                    aria-label={done ? t.plantQuickSheet.undoHint(careLabelMap[ct] ?? info?.label ?? ct) : (careLabelMap[ct] ?? info?.label ?? ct)}
                    title={done ? t.plantQuickSheet.undoHint(careLabelMap[ct] ?? info?.label ?? ct) : undefined}
                    style={{ flex: '0 0 auto', width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', opacity: saving ? 0.5 : 1, padding: 0 }}
                  >
                    <span style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--color-primary)' : 'var(--color-bg)', border: `2px solid ${ring}`, transition: 'all 0.15s', color: overdue ? 'var(--color-overdue)' : dueToday ? 'var(--color-due)' : 'var(--color-text-soft)' }}>
                      {done ? <Glyph name="check" size={24} strokeWidth={2.4} style={{ color: '#fff' }} /> : <CareIcon type={ct as CareIconType} size={24} />}
                      {!done && (overdue || dueToday) && (
                        <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box', borderRadius: 9, background: overdue ? 'var(--color-overdue)' : 'var(--color-due)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', border: '1.5px solid var(--color-surface)' }}>
                          {overdue ? `${Math.abs(due as number)}d` : '!'}
                        </span>
                      )}
                    </span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-chip-label-size, 11px)', color: done ? 'var(--color-primary)' : 'var(--color-text-soft)', textAlign: 'center', lineHeight: 1.1, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {done ? t.plantQuickSheet.undo : (careLabelMap[ct] ?? info?.label ?? ct)}
                    </span>
                  </button>
                )
              })}
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                style={{ flex: '0 0 auto', width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', opacity: uploadingPhoto ? 0.5 : 1, padding: 0 }}
              >
                <span style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', border: '2px dashed var(--color-border)', color: 'var(--color-text-soft)' }}>
                  {uploadingPhoto ? '…' : <CareIcon type="photo" size={24} />}
                </span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-chip-label-size, 11px)', color: 'var(--color-text-soft)', textAlign: 'center' }}>
                  {t.plantQuickSheet.photo}
                </span>
              </button>
            </div>
          </div>

          <div className="plant-quick-sheet-context">
          {/* ── Sun fit ── */}
          {sunFitInfo && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: sunEditorOpen ? '10px 10px 0 0' : 10, background: 'var(--color-bg)' }}>
                <Glyph name="sun" size={14} style={{ flexShrink: 0, color: '#f0a020' }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-info-size, 13px)', color: 'var(--color-text-muted)' }}>
                  ~{sunFitInfo.sunHours.toFixed(1)}{t.plantQuickSheet.sunHoursUnit}{' · '}{t.locale.startsWith('en') ? sunFitInfo.profile.label : sunFitInfo.profile.labelNl}
                  {' · '}
                  <span style={{ fontStyle: 'italic', color: sunFitInfo.source === 'measured' ? 'var(--color-primary)' : 'var(--color-text-soft)' }}>
                    {sunFitInfo.source === 'measured' ? t.plantQuickSheet.sunSourceMeasured : t.plantQuickSheet.sunSourceEstimated}
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: SUN_FIT_COLORS[sunFitInfo.fit] + '22', color: SUN_FIT_COLORS[sunFitInfo.fit], flexShrink: 0 }}>
                  {sunFitInfo.fit === 'good' ? t.plantQuickSheet.goodFit : sunFitInfo.fit === 'partial' ? t.plantQuickSheet.partialFit : t.plantQuickSheet.insufficientFit}
                </span>
                <button
                  onClick={() => { setSunDraft(measuredSun ?? Math.round(sunFitInfo.sunHours * 2) / 2); setSunEditorOpen((v) => !v) }}
                  aria-label={t.plantQuickSheet.sunMeasureOpen}
                  style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: '1px solid var(--color-border-soft)', background: sunEditorOpen ? 'var(--color-primary)' : 'var(--color-surface)', color: sunEditorOpen ? '#fff' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Glyph name="edit" size={12} />
                </button>
              </div>
              {sunEditorOpen && (
                <div style={{ padding: '12px', borderRadius: '0 0 10px 10px', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border-soft)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                    {t.plantQuickSheet.sunMeasureTitle}
                  </div>
                  <p style={{ margin: '0 0 10px', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text-soft)' }}>
                    {t.plantQuickSheet.sunMeasureHint}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
                    <button
                      onClick={() => setSunDraft((d) => Math.max(0, Math.round((d - 0.5) * 2) / 2))}
                      aria-label="−"
                      style={sunStepBtnStyle}
                    >−</button>
                    <span style={{ minWidth: 64, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
                      {sunDraft.toFixed(1)}{t.plantQuickSheet.sunHoursUnit}
                    </span>
                    <button
                      onClick={() => setSunDraft((d) => Math.min(12, Math.round((d + 0.5) * 2) / 2))}
                      aria-label="+"
                      style={sunStepBtnStyle}
                    >＋</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {measuredSun != null && (
                      <button
                        onClick={() => { void handleSetMeasuredSun(null); setSunEditorOpen(false) }}
                        disabled={savingSun}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                      >
                        {t.plantQuickSheet.sunMeasureClear}
                      </button>
                    )}
                    <button
                      onClick={() => { void handleSetMeasuredSun(sunDraft); setSunEditorOpen(false) }}
                      disabled={savingSun}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: savingSun ? 0.6 : 1 }}
                    >
                      {t.plantQuickSheet.sunMeasureSave}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Container / ground zone ── */}
          {container && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--color-bg)', marginBottom: 10 }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-info-size, 13px)', color: 'var(--color-text-muted)' }}>
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
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-info-size, 13px)', color: 'var(--color-text-muted)' }}>
                  {t.plantQuickSheet.plantedIn} <strong style={{ color: 'var(--color-text)', fontWeight: 500 }}>{groundZone.name}</strong>
                </span>
                {groundZone.soil_note && <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-muted)' }}>{groundZone.soil_note}</p>}
              </div>
              <button onClick={handleLiftFromZone} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                {t.plantQuickSheet.move}
              </button>
            </div>
          )}

          {/* ── Extra placements (this plant in more than one spot) ── */}
          {onAddPlacement && (
            <div style={{ marginTop: 4, marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                {t.plantQuickSheet.spotsHeading}
              </div>
              {placements.map((pl, i) => (
                <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--color-bg)', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-text-soft)', flexShrink: 0 }}>
                    {t.plantQuickSheet.spotLabel(i + 2)}
                  </span>
                  <select
                    value={pl.phase ?? ''}
                    onChange={(e) => onUpdatePlacementPhase?.(pl.id, e.target.value)}
                    style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 12, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    <option value="">{t.plantQuickSheet.spotSameAge}</option>
                    <option value="seed">{t.addPlant.phaseSeed}</option>
                    <option value="sprout">{t.addPlant.phaseSprout}</option>
                    <option value="seedling">{t.addPlant.phaseSeedling}</option>
                    <option value="young">{t.addPlant.phaseYoung}</option>
                    <option value="established">{t.addPlant.phaseEstablished}</option>
                  </select>
                  <button
                    onClick={() => onDeletePlacement?.(pl.id)}
                    aria-label={t.plantQuickSheet.removeSpot}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-overdue)', flexShrink: 0, padding: 4, display: 'inline-flex' }}
                  >
                    <Glyph name="x" size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={onAddPlacement}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 12, background: 'var(--color-bg)', color: 'var(--color-primary)', border: '1px dashed var(--color-border)', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                <span aria-hidden="true">＋</span>
                {t.plantQuickSheet.addSpot}
              </button>
            </div>
          )}
          </div>

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

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '10px 10px', borderRadius: 8, background: 'none', border: 'none',
  cursor: 'pointer', textAlign: 'left',
  fontFamily: 'var(--font-heading)', fontSize: 14, color: 'var(--color-text)',
}

const menuIconStyle: React.CSSProperties = {
  width: 18, textAlign: 'center', flexShrink: 0, fontSize: 14,
}

const sunStepBtnStyle: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text)', fontSize: 20, lineHeight: 1, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const desktopIconStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: '1px solid var(--color-border-soft)',
  background: 'var(--color-bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--color-text-muted)', cursor: 'pointer',
}

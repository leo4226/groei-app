import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { MapPlant, MapObject, GroundZone, Plant, MapInfo, SecondaryMarker } from '../../types'
import { careChipTypes, dueChipCount, dueDaysByType, nextUpcomingCare } from './quickSheetCareChips'
import { useFloreren } from '../../store/useFloreren'
import { plants as plantsApi } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'
import { plantDisplayName } from '../../utils/plantDisplayName'
import { PLANT_PASSPORT_ANCHORS } from '../../utils/plantPassportLinks'
import { compressImage } from '../../utils/compressImage'
import CareIcon, { type CareIconType } from '../ui/CareIcon'
import Glyph from '../ui/Glyph'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import { getSunFit, sunProfileFor, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
import MovePlantSheet from './MovePlantSheet'
import MeasuredSunEditor from '../plant/MeasuredSunEditor'
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
  /** Server-derived write capability (me.capabilities.can_edit). When false,
   * every write control (care chips, photo, move, duplicate, remove, lock,
   * measured sun, container/zone edits) renders disabled and the handlers
   * no-op; viewing (passport, sun info, placements) stays. */
  canEdit?: boolean
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
  mapId, mapName, canEdit = true,
  onClose, onCareAction, onAction, onMoveOnMap, onDuplicate, onRemove,
  placements = [], onAddPlacement, onDeletePlacement, onUpdatePlacementPhase,
}: Props) {
  const t = useT()
  const navigate = useNavigate()
  const writeDisabled = !canEdit
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
  const sheetRef = useRef<HTMLDivElement>(null)
  const headingId = `plant-quick-sheet-title-${plant.id}`
  // Manual "measured sun" override (#645). Held locally so the sheet reflects
  // the change immediately; persisted via plantsApi.update, null = cleared.
  const [measuredSun, setMeasuredSun] = useState<number | null>(plant.measured_sun_hours)
  const [sunEditorOpen, setSunEditorOpen] = useState(false)
  const [savingSun, setSavingSun] = useState(false)

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (writeDisabled) return
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
    if (writeDisabled) return
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

  // Dialog behaviour: move focus into the sheet on open, hand it back to
  // whatever opened it on close, and let Escape dismiss the topmost layer
  // first (#878). No Tab trap — MovePlantSheet renders as a sibling portal,
  // and a naive trap would lock focus out of it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    sheetRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showMoveSheet) { setShowMoveSheet(false); return }
      if (menuOpen) { setMenuOpen(false); return }
      if (sunEditorOpen) { setSunEditorOpen(false); return }
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showMoveSheet, menuOpen, sunEditorOpen, onClose])

  // Persist a measured-sun value (or null to clear) and refresh map markers.
  const handleSetMeasuredSun = async (value: number | null) => {
    if (writeDisabled) return
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

  // Days-until-due per scheduled care type (negative = overdue, 0 = today).
  const dueByType = dueDaysByType(detail?.care_schedules ?? [])
  // Quick-log chips: water + feed always, plus any other scheduled care type.
  const chipTypes = careChipTypes(dueByType)
  // The status line must promise exactly what the chips can deliver. It used to
  // count every overdue schedule while the chip list silently dropped
  // pest_check and dust, so the sheet could say "4 taken te doen" and offer two
  // (#888).
  const dueCount = dueChipCount(dueByType, doneTypes)
  // What the plant needs next, when nothing needs doing today. Doubles as the
  // way into care setup: the sheet otherwise never says a rhythm exists.
  const nextCare = nextUpcomingCare(dueByType)

  // Chip labels are deliberately shorter than the catalog's (the chip clamps at
  // 64px and ellipsises): "Gieten", not "Water geven". The fallback is
  // t.careTypes — localized and complete — rather than CARE_TYPE_INFO, whose
  // labels are English-only and printed "Wipe leaves" into the Dutch UI.
  const chipLabels: Record<string, string> = {
    water: t.plantQuickSheet.careWater,
    fertilize: t.plantQuickSheet.careFertilize,
    prune: t.plantQuickSheet.carePrune,
    repot: t.plantQuickSheet.careRepot,
    mist: t.plantQuickSheet.careMist,
    rotate: t.plantQuickSheet.careRotate,
    pest_check: t.plantQuickSheet.carePestCheck,
    dust: t.plantQuickSheet.careDust,
  }
  const careLabel = (ct: string) =>
    chipLabels[ct] ?? t.careTypes[ct as keyof typeof t.careTypes] ?? ct

  const handleCare = async (careType: string) => {
    if (writeDisabled) return
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
    if (writeDisabled) return
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
    if (writeDisabled) return
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
    if (writeDisabled) return
    await plantsApi.setContainer(plant.id, null)
    onAction()
  }

  const handleLiftFromZone = async () => {
    if (writeDisabled) return
    await plantsApi.setGroundZone(plant.id, null, plant.map_x, plant.map_y)
    onAction()
  }

  const container = plant.container_id ? objects.find(o => o.id === plant.container_id) : null
  const groundZone = plant.ground_zone_id ? soilGroundZones.find(z => z.id === plant.ground_zone_id) : null

  const sunFitInfo = (() => {
    if (!plant.sun_requirement) return null
    const profile = sunProfileFor(plant.sun_requirement)
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

  // With the placement CTA gone from the body (#888), the context column is
  // empty for plenty of plants — an indoor plant with no container and no extra
  // spots has nothing to put there. Left alone the desktop grid still reserved
  // a third of the sheet for it.
  const hasContext = Boolean(sunFitInfo || container || groundZone || placements.length > 0)

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 lg:bg-black/20 z-40"
        style={{ touchAction: 'none' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className={`${PLANT_QUICK_SHEET_CLASS}${hasContext ? '' : ' plant-quick-sheet--no-context'}`}
        style={plantQuickSheetStyle()}
      >
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label={t.plantQuickSheet.close}
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
                disabled={writeDisabled}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.addPhoto}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                style={{
                  position: 'relative', width: 'var(--plant-quick-sheet-photo-size)', height: 'var(--plant-quick-sheet-photo-size)', borderRadius: 12, padding: 0,
                  overflow: 'hidden', flexShrink: 0, cursor: writeDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(145deg,#FDFAF1,#F4EEDB)', border: '1px solid var(--color-border-soft)',
                  opacity: writeDisabled ? 0.4 : 1,
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
                <h3 id={headingId} style={clampedPlantNameStyle()}>{displayName}</h3>
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
                      <button
                        disabled={writeDisabled}
                        title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                        style={{ ...menuItemStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                        onClick={() => { setMenuOpen(false); onClose(); navigate(`/plants/${plant.id}/edit`) }}
                      ><span style={menuIconStyle}><Glyph name="edit" size={15} /></span>{t.plantQuickSheet.edit}</button>
                      {onMoveOnMap && (
                        <button
                          disabled={writeDisabled}
                          title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                          style={{ ...menuItemStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                          onClick={() => { setMenuOpen(false); void handleMoveOnMap() }}
                        ><span style={menuIconStyle}><Glyph name="pin" size={15} /></span>{t.plantQuickSheet.moveOnMap}</button>
                      )}
                      <button
                        disabled={writeDisabled}
                        title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                        style={{ ...menuItemStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                        onClick={() => { setMenuOpen(false); setMoveError(false); setShowMoveSheet(true) }}
                      ><span style={menuIconStyle}><Glyph name="map" size={15} /></span>{t.plantQuickSheet.moveToMap}</button>
                      {onAddPlacement && (
                        <button
                          disabled={writeDisabled}
                          title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                          style={{ ...menuItemStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                          onClick={() => { setMenuOpen(false); onAddPlacement() }}
                        ><span style={menuIconStyle}><Glyph name="sprout" size={15} /></span>{t.plantQuickSheet.addSpot}</button>
                      )}
                      {onDuplicate && (
                        <button
                          disabled={writeDisabled}
                          title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                          style={{ ...menuItemStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                          onClick={() => { setMenuOpen(false); onDuplicate(plant.id); onClose() }}
                        ><span style={menuIconStyle}><Glyph name="copy" size={15} /></span>{t.plantQuickSheet.duplicate}</button>
                      )}
                      <button
                        disabled={writeDisabled}
                        title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                        style={{ ...menuItemStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                        onClick={() => { setMenuOpen(false); void handleToggleLock() }}
                      ><span style={menuIconStyle}><Glyph name={locked ? 'unlock' : 'lock'} size={15} /></span>{locked ? t.plantQuickSheet.unlock : t.plantQuickSheet.lock}</button>
                      {onRemove && (
                        <button
                          disabled={writeDisabled}
                          title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                          style={{ ...menuItemStyle, color: 'var(--color-overdue)', opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                          onClick={() => { setMenuOpen(false); onRemove(plant.id); onClose() }}
                        ><span style={menuIconStyle}><Glyph name="trash" size={15} /></span>{t.plantQuickSheet.remove}</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} style={{ display: 'none' }} />

            {/* Desktop management icon row — replaces the ⋯ dropdown at ≥1024px */}
            <div className="hidden lg:grid grid-cols-3 mt-2" style={{ width: 'fit-content', gap: 10 }}>
              <button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.edit}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.edit}
                onClick={() => { onClose(); navigate(`/plants/${plant.id}/edit`) }}
                style={{ ...desktopIconStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
              ><Glyph name="edit" size={14} /></button>
              {onMoveOnMap && (<button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.moveOnMap}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.moveOnMap}
                onClick={() => void handleMoveOnMap()}
                style={{ ...desktopIconStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
              ><Glyph name="pin" size={14} /></button>)}
              <button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.moveToMap}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.moveToMap}
                onClick={() => { setMoveError(false); setShowMoveSheet(true) }}
                style={{ ...desktopIconStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
              ><Glyph name="map" size={14} /></button>
              {onAddPlacement && (<button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.addSpot}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.addSpot}
                onClick={onAddPlacement}
                style={{ ...desktopIconStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
              ><Glyph name="sprout" size={14} /></button>)}
              {onDuplicate && (<button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.duplicate}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.duplicate}
                onClick={() => { onDuplicate(plant.id); onClose() }}
                style={{ ...desktopIconStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
              ><Glyph name="copy" size={14} /></button>)}
              <button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : (locked ? t.plantQuickSheet.unlock : t.plantQuickSheet.lock)}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : (locked ? t.plantQuickSheet.unlock : t.plantQuickSheet.lock)}
                onClick={() => void handleToggleLock()}
                style={{ ...desktopIconStyle, opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
              ><Glyph name={locked ? 'unlock' : 'lock'} size={14} /></button>
              {onRemove && (<button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.remove}
                aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.remove}
                onClick={() => { onRemove(plant.id); onClose() }}
                style={{ ...desktopIconStyle, color: 'var(--color-overdue)', opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
              ><Glyph name="trash" size={14} /></button>)}
            </div>
          </div>

          {/* ── Status line + one-tap care chips ── */}
          <div className="plant-quick-sheet-care" style={{ marginBottom: 14 }}>
            {/* Height is reserved for both lines — the status and the "next up"
                link — so the chips below do not jump down when `detail` lands.
                The sheet used to reserve one line's worth and render nothing,
                then grow by the other line on load (#888). */}
            <div style={{ marginBottom: 12, minHeight: 45 }}>
              {detail === null ? (
                <div aria-hidden>
                  <div className="skeleton" style={{ height: 13, width: 132, borderRadius: 6 }} />
                  <div className="skeleton" style={{ height: 11, width: 168, borderRadius: 6, marginTop: 6, opacity: 0.6 }} />
                </div>
              ) : dueCount > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-status-size, 13px)', fontWeight: 600, color: 'var(--color-overdue)' }}>
                  <Glyph name="alert" size={14} aria-hidden="true" />{t.plantQuickSheet.tasksDue(dueCount)}
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 'var(--pq-status-size, 13px)', color: 'var(--color-text-muted)' }}>
                  <Glyph name="check" size={14} style={{ color: 'var(--color-primary)' }} />{t.mapPage.sheetAllGood}
                </span>
              )}
              {detail !== null && (
                <button
                  onClick={() => { onClose(); navigate(`/plants/${plant.id}#${PLANT_PASSPORT_ANCHORS.care}`) }}
                  style={{ display: 'block', marginTop: 3, padding: 0, background: 'none', border: 'none', textAlign: 'left', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                >
                  {nextCare
                    ? t.plantQuickSheet.nextCare(careLabel(nextCare.careType), nextCare.days)
                    : t.plantQuickSheet.noRhythm}
                </button>
              )}
            </div>

            {/* One-tap care chips — tap to log "done today"; + a progress-photo chip */}
            <div className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {chipTypes.map((ct) => {
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
                    disabled={saving || writeDisabled}
                    aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : (done ? t.plantQuickSheet.undoHint(careLabel(ct)) : careLabel(ct))}
                    title={writeDisabled ? t.settings.onlyEditorsCanChange : (done ? t.plantQuickSheet.undoHint(careLabel(ct)) : undefined)}
                    style={{ flex: '0 0 auto', width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: writeDisabled ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : writeDisabled ? 0.4 : 1, padding: 0 }}
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
                      {done ? t.plantQuickSheet.undo : careLabel(ct)}
                    </span>
                  </button>
                )
              })}
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto || writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                style={{ flex: '0 0 auto', width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: writeDisabled ? 'not-allowed' : 'pointer', opacity: uploadingPhoto ? 0.5 : writeDisabled ? 0.4 : 1, padding: 0 }}
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

          {hasContext && (
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
                  onClick={() => setSunEditorOpen((v) => !v)}
                  disabled={writeDisabled}
                  aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.sunMeasureOpen}
                  title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                  style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: '1px solid var(--color-border-soft)', background: sunEditorOpen ? 'var(--color-primary)' : 'var(--color-surface)', color: sunEditorOpen ? '#fff' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: writeDisabled ? 'not-allowed' : 'pointer', opacity: writeDisabled ? 0.4 : 1 }}
                >
                  <Glyph name="edit" size={12} />
                </button>
              </div>
              {sunEditorOpen && (
                <MeasuredSunEditor
                  measured={measuredSun}
                  fallback={sunFitInfo.sunHours}
                  saving={savingSun}
                  onSave={handleSetMeasuredSun}
                  onCancel={() => setSunEditorOpen(false)}
                />
              )}
            </div>
          )}

          {/* ── Container / ground zone ── */}
          {container && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--color-bg)', marginBottom: 10 }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontSize: 'var(--pq-info-size, 13px)', color: 'var(--color-text-muted)' }}>
                {t.plantQuickSheet.plantedIn} <strong style={{ color: 'var(--color-text)', fontWeight: 500 }}>{container.name}</strong>
              </span>
              <button
                disabled={writeDisabled}
                title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                onClick={handleRemoveFromContainer}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: writeDisabled ? 'not-allowed' : 'pointer', opacity: writeDisabled ? 0.4 : 1 }}
              >
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
              <button onClick={handleLiftFromZone} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: writeDisabled ? 'not-allowed' : 'pointer', opacity: writeDisabled ? 0.4 : 1, flexShrink: 0 }}>
                {t.plantQuickSheet.move}
              </button>
            </div>
          )}

          {/* ── Extra placements (this plant in more than one spot) ──
              Shown only once the plant actually has them. It used to render for
              every plant: a heading plus a full-width dashed CTA, about a third
              of the mobile sheet and a whole column of three on desktop, for a
              feature most plants never use — while the care chips people come
              here for got less room. Adding a spot lives in the ⋯ menu now,
              beside the other placement actions (#888). */}
          {placements.length > 0 && (
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
                    disabled={writeDisabled}
                    onChange={(e) => onUpdatePlacementPhase?.(pl.id, e.target.value)}
                    style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 12, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', opacity: writeDisabled ? 0.4 : 1, cursor: writeDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    <option value="">{t.plantQuickSheet.spotSameAge}</option>
                    <option value="seed">{t.addPlant.phaseSeed}</option>
                    <option value="sprout">{t.addPlant.phaseSprout}</option>
                    <option value="seedling">{t.addPlant.phaseSeedling}</option>
                    <option value="young">{t.addPlant.phaseYoung}</option>
                    <option value="established">{t.addPlant.phaseEstablished}</option>
                  </select>
                  <button
                    disabled={writeDisabled}
                    onClick={() => onDeletePlacement?.(pl.id)}
                    title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
                    aria-label={writeDisabled ? t.settings.onlyEditorsCanChange : t.plantQuickSheet.removeSpot}
                    style={{ background: 'none', border: 'none', cursor: writeDisabled ? 'not-allowed' : 'pointer', color: 'var(--color-overdue)', flexShrink: 0, padding: 4, display: 'inline-flex', opacity: writeDisabled ? 0.4 : 1 }}
                  >
                    <Glyph name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          </div>
          )}

        </div>
      </div>

      {showMoveSheet && (
        <MovePlantSheet
          currentMapId={mapId}
          currentMapName={mapName}
          canEdit={canEdit}
          error={moveError}
          onSelect={handleMovePlant}
          onClose={() => setShowMoveSheet(false)}
        />
      )}
    </>,
    document.body,
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

const desktopIconStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: '1px solid var(--color-border-soft)',
  background: 'var(--color-bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--color-text-muted)', cursor: 'pointer',
}

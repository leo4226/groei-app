import { useT } from '../context/LanguageContext'
import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import type { Phenology, PlantWarningStateOut } from '../types'
import CareIcon, { type CareIconType } from '../components/ui/CareIcon'
import Glyph from '../components/ui/Glyph'
import { plants as plantsApi, care } from '../api/client'
import { useCareLog } from '../hooks/useCareLog'
import { useSunAt } from '../hooks/useSunAt'
import PlantCareInfo from '../components/PlantCareInfo'
import PhotoJournal from '../components/plant/PhotoJournal'
import { PassportEditLink } from '../components/plant/PassportEditLink'
import { photos as photosApi } from '../api/client'
import { compressImage } from '../utils/compressImage'
import EcologyCard from '../components/EcologyCard'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../utils/plantSunRequirements'
import PhaseCalendar from '../components/PhaseCalendar'
import { resolveIconUrl } from '../utils/icons'
import PageMasthead, { type MastheadStat } from '../components/ui/PageMasthead'
import { useIsMobile } from '../hooks/useIsMobile'
import { buildPlantDetailActions } from '../utils/plantCareRecommendations'
import { careLogAnchor, PLANT_PASSPORT_ANCHORS, resolvePlantPassportAnchor } from '../utils/plantPassportLinks'
import { plantPassportSwipeDirection } from '../utils/plantPassportSwipe'

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-6 scroll-mt-24">
      <p className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">{title}</p>
      {children}
    </section>
  )
}

/** Prev/next navigation arrow for the desktop masthead. */
function NavArrow({ dir, plant, t, onClick }: {
  dir: 'prev' | 'next'
  plant: { id: number; name: string } | null
  t: ReturnType<typeof useT>
  onClick: () => void
}) {
  if (!plant) return <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border/30 text-text-muted/30" aria-hidden>…</span>
  const label = `${dir === 'prev' ? t.plantDetail.prevPlant : t.plantDetail.nextPlant}: ${plant.name}`
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-transparent text-text-soft transition-all hover:border-primary hover:text-primary"
    >
      <Glyph name={dir === 'prev' ? 'arrow-left' : 'chevron-right'} size={18} aria-hidden />
    </button>
  )
}

const ALERT_BORDER: Record<string, string> = {
  urgent:  'border-l-fiery-red',
  warning: 'border-l-pumpkin-swirl',
  info:    'border-l-aqua-glow',
}

const ALERT_BG: Record<string, string> = {
  urgent:  'bg-fiery-red/8',
  warning: 'bg-pumpkin-swirl/8',
  info:    'bg-aqua-glow/8',
}

function PlantCareSignals({ plantId, phenology }: { plantId: number; phenology: Phenology | null }) {
  const [warningState, setWarningState] = useState<PlantWarningStateOut | null>(null)
  const t = useT()

  useEffect(() => {
    plantsApi.warnings(plantId).then(setWarningState).catch(() => {})
  }, [plantId])

  const currentMonth = new Date().getMonth() + 1
  const monthData = phenology?.months?.find(m => m.month === currentMonth)
  const rawPhenologyActions: string[] = t.locale?.startsWith('en')
    ? (monthData?.actions_en ?? [])
    : (monthData?.actions_nl ?? [])

  const warnings = warningState?.warnings ?? []

  // Merge: warn actions take precedence; duplicate-care-type phenology actions are filtered
  const displayActions = buildPlantDetailActions(
    warnings,
    rawPhenologyActions,
    t.locale ?? 'nl-NL',
  )

  if (warnings.length === 0 && displayActions.length === 0) return null

  return (
    <Section title={t.plantDetail.weatherAlerts}>
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border-l-4 ${ALERT_BORDER[w.severity] ?? 'border-l-aqua-glow'} ${ALERT_BG[w.severity] ?? 'bg-aqua-glow/8'}`}
            >
              <CareIcon type={w.care_type as CareIconType} size={18} />
              <div className="flex-1">
                <p className="text-sm text-text leading-snug">
                  {t.locale?.startsWith('en') ? w.message_en : w.message_nl}
                </p>
                {(w.reason_nl || w.reason_en) && (
                  <p className="text-xs text-text-muted mt-1">
                    {t.locale?.startsWith('en') ? w.reason_en : w.reason_nl}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {displayActions.length > 0 && (
        <div className="mt-2 rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{t.plantDetail.whatCanYouDo}</p>
          <ul className="space-y-1">
            {displayActions.map((action, i) => (
              <li key={i} className="text-sm text-text flex gap-1.5">
                <span className="text-primary shrink-0"><Glyph name="chevron-right" size={14} aria-hidden /></span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

export default function PlantDetail() {
  const t = useT()
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const plants = useFloreren(s => s.plants)
  const maps = useFloreren(s => s.maps)
  const loadPlants = useFloreren(s => s.loadPlants)
  const { markCareDone, archivePlant } = useFloreren()

  const [plant, setPlant]         = useState<typeof plants[number] | null>(null)
  const [loading, setLoading]     = useState(true)
  const [retryingSpecies, setRetryingSpecies] = useState(false)
  const [retryFailed, setRetryFailed] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [pendingCareLogId, setPendingCareLogId] = useState<number | null>(null)
  const [carePhotoBusy, setCarePhotoBusy] = useState(false)
  const [journalRefresh, setJournalRefresh] = useState(0)
  const [undoInfo, setUndoInfo] = useState<{
    careLogId: number
    previousNextDue: string | null
    previousLastDone: string | null
    previousLastDoneBy: number | null
    careType: string
  } | null>(null)
  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const carePhotoRef = useRef<HTMLInputElement>(null)
  const carePhotoUploadLogId = useRef<number | null>(null)

  const plantId = Number(id)
  const careLog = useCareLog(plantId)

  useEffect(() => {
    if (loading || !plant) return
    const frame = window.requestAnimationFrame(() => {
      resolvePlantPassportAnchor(window.location.hash)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [careLog.data, loading, plant?.id])

  const mapInfo = plant?.map_id ? (maps.find(m => m.id === plant.map_id) ?? null) : null
  const sunCoord = useMemo(
    () => plant?.map_x != null && plant?.map_y != null ? { x: plant.map_x, y: plant.map_y } : null,
    [plant?.map_x, plant?.map_y],
  )
  const currentMonth = new Date().getMonth() + 1
  const { sunHours } = useSunAt(sunCoord, currentMonth, mapInfo)
  // 720px editorial-layout boundary (same split as Plants.tsx / PageMasthead)
  const isMobile = useIsMobile(720)

  // ── Plant-to-plant navigation ──
  const sortedPlants = useMemo(
    () => [...plants].sort((a, b) => a.name.localeCompare(b.name)),
    [plants],
  )
  const plantIndex = sortedPlants.findIndex(p => p.id === plantId)
  const prevPlant = plantIndex > 0 ? sortedPlants[plantIndex - 1] : null
  const nextPlant = plantIndex < sortedPlants.length - 1 ? sortedPlants[plantIndex + 1] : null
  const navigateToPlant = (pid: number) => navigate(`/plants/${pid}`)

  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onHeroTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    swipeStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const onHeroTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const touch = e.changedTouches[0]
    const direction = plantPassportSwipeDirection(start.x, start.y, touch.clientX, touch.clientY)
    if (direction === 'prev' && prevPlant) navigateToPlant(prevPlant.id)
    if (direction === 'next' && nextPlant) navigateToPlant(nextPlant.id)
  }

  useEffect(() => {
    // Use cached plant from store if available, else fetch directly
    const cached = plants.find(p => p.id === plantId)
    if (cached) {
      setPlant(cached)
      setLoading(false)
    } else {
      plantsApi.get(plantId).then(p => {
        setPlant(p)
        setLoading(false)
      }).catch(() => navigate('/plants'))
    }
  }, [plantId, plants, navigate])

  // Keep local plant in sync with store updates (e.g. after markCareDone)
  useEffect(() => {
    if (plant) {
      const updated = plants.find(p => p.id === plantId)
      if (updated && updated !== plant) setPlant(updated)
    }
  }, [plants, plantId])

  async function handleQuickAction(careType: string) {
    const result = await markCareDone(plantId, careType)
    if (result != null) {
      setPendingCareLogId(result.care_log_id)
      setUndoInfo({
        careLogId: result.care_log_id,
        previousNextDue: result.previous_next_due,
        previousLastDone: result.previous_last_done,
        previousLastDoneBy: result.previous_last_done_by,
        careType,
      })
      if (undoTimer) clearTimeout(undoTimer)
      setUndoTimer(setTimeout(() => {
        setUndoInfo(null)
        setUndoTimer(null)
      }, 8000))
    }
  }

  function openCarePhotoPicker(careLogId: number | null = null) {
    carePhotoUploadLogId.current = careLogId
    carePhotoRef.current?.click()
  }

  async function handleUndo() {
    if (!undoInfo) return
    if (undoTimer) clearTimeout(undoTimer)
    try {
      await care.undo(
        undoInfo.careLogId,
        undoInfo.previousNextDue,
        undoInfo.previousLastDone,
        undoInfo.previousLastDoneBy,
      )
      await loadPlants()
    } finally {
      setUndoInfo(null)
      setUndoTimer(null)
      setPendingCareLogId(null)
    }
  }

  async function handleCarePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const careLogId = carePhotoUploadLogId.current
    carePhotoUploadLogId.current = null
    if (!file) return
    setCarePhotoBusy(true)
    try {
      const blob = await compressImage(file)
      await photosApi.upload(
        plantId,
        blob,
        careLogId != null ? { careLogId } : {},
      )
      setJournalRefresh(k => k + 1)
      await loadPlants()
      setPendingCareLogId(null)
    } finally {
      setCarePhotoBusy(false)
    }
  }

  async function handleDeleteSchedule(scheduleId: number) {
    if (!window.confirm(t.plantDetail.deleteScheduleConfirm)) return
    await care.deleteSchedule(scheduleId)
    await loadPlants() // store.sync effect picks up the updated plant
  }

  async function handleArchive() {
    if (!window.confirm(t.plantDetail.deleteConfirm)) return
    await archivePlant(plantId)
    navigate('/plants')
  }

  async function handleDuplicate() {
    setDuplicating(true)
    try {
      const copy = await plantsApi.duplicate(plantId)
      navigate(`/plants/${copy.id}`)
    } finally {
      setDuplicating(false)
    }
  }

  async function handleRetrySpecies() {
    setRetryingSpecies(true)
    setRetryFailed(false)
    try {
      const updated = await plantsApi.retrySpecies(plantId)
      setPlant(updated)
      // Also refresh the store so other pages see the new data
      await loadPlants()
      // A 200 doesn't guarantee a usable calendar — the LLM may have come back
      // empty. Tell the user it didn't land so they can try again later.
      if (!updated.phenology?.months?.length) setRetryFailed(true)
    } catch (e) {
      console.error('Species retry failed:', e)
      setRetryFailed(true)
    } finally {
      setRetryingSpecies(false)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton w-full h-52" style={{ borderRadius: 0 }} />
        <div className="px-4 -mt-4 space-y-4">
          <div className="card p-4 space-y-3">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-3 w-48" />
          </div>
        </div>
      </div>
    )
  }

  if (!plant) return null

  const today = new Date().toISOString().slice(0, 10)

  const sunFitInfo = (() => {
    if (!plant.sun_requirement || sunHours === null) return null
    const fit     = getSunFit(plant.sun_requirement, sunHours)
    const profile = PLANT_SUN_PROFILES.find(p => p.id === plant.sun_requirement)
    return fit && profile ? { fit, sunHours, profile } : null
  })()

  const locale = t.locale || 'nl-NL'
  const isEN = locale.startsWith('en')

  // ── Shared content blocks (identical markup in both layouts) ──

  const heroMedia = (frame: string) =>
    plant.photo_path ? (
      <img src={plant.photo_path} alt={plant.name} className={`${frame} object-cover`} />
    ) : plant.icon_key ? (
      <div className={`${frame} flex items-center justify-center`} style={{ background: 'linear-gradient(145deg, #fef9ee 0%, #f2ebe6 100%)' }}>
        <img src={resolveIconUrl(plant.icon_key)!} alt={plant.name} className="h-40 w-40 object-contain" />
      </div>
    ) : (
      <div className={`${frame} bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center text-primary/60`}><Glyph name="leaf" size={64} /></div>
    )

  const potAcquiredParts: ReactNode[] = []
  if (plant.pot_size_cm) {
    potAcquiredParts.push(
      <span key="pot" className="inline-flex items-center gap-1"><Glyph name="pot" size={11} />{plant.pot_size_cm} cm</span>
    )
  }
  if (plant.acquired_date) {
    potAcquiredParts.push(
      <span key="acq" className="inline-flex items-center gap-1"><Glyph name="calendar" size={11} />{new Date(plant.acquired_date).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
    )
  }
  const potAcquiredLine = potAcquiredParts.length > 0
    ? potAcquiredParts.flatMap((part, i) => i === 0 ? [part] : [<span key={`sep${i}`}> · </span>, part])
    : null

  const sunFitCard = sunFitInfo && (
    <div className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3 border border-border">
      <Glyph name="sun" size={18} className="text-amber-500 shrink-0" />
      <span className="text-sm text-text-muted flex-1">
        {t.plantDetail.sunHoursLabel} <span className="text-text font-medium">~{sunFitInfo.sunHours.toFixed(1)}{t.plantDetail.sunHoursUnit}</span>
        {' · '}{isEN ? sunFitInfo.profile.label : sunFitInfo.profile.labelNl}
      </span>
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ background: SUN_FIT_COLORS[sunFitInfo.fit] + '20', color: SUN_FIT_COLORS[sunFitInfo.fit] }}
      >
        {sunFitInfo.fit === 'good' ? t.plantDetail.fitGood : sunFitInfo.fit === 'partial' ? t.plantDetail.fitPartial : t.plantDetail.fitInsufficient}
      </span>
    </div>
  )
  const sunFitBlock = sunFitCard && <div className="mb-5">{sunFitCard}</div>

  // A phenology object can exist yet have no month calendar (incomplete LLM
  // generation) — that still reads as "No species data available", so treat it
  // the same as missing and offer the fetch button.
  const hasYearCalendar = (plant.phenology?.months?.length ?? 0) > 0
  const calendarInner = hasYearCalendar ? (
    <PhaseCalendar
      phenology={plant.phenology!}
      sunHours={sunHours}
      monthStripHeight={isMobile ? 'h-5' : 'h-9'}
    />
  ) : (
    <div className="bg-surface rounded-xl px-4 py-6 text-center border border-border">
        <p className="text-sm text-text-muted mb-3">
          {isEN ? 'No year calendar available yet' : 'Nog geen jaarkalender beschikbaar'}
        </p>
        <button
          onClick={handleRetrySpecies}
          disabled={retryingSpecies}
          className="px-5 py-2 bg-primary text-white rounded-full text-sm font-semibold active:scale-95 transition-transform disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {retryingSpecies
            ? (isEN ? 'Loading...' : 'Bezig...')
            : (<><Glyph name="refresh" size={14} />{isEN ? 'Fetch species data' : 'Soortgegevens ophalen'}</>)}
        </button>
        {retryFailed && !retryingSpecies && (
          <p className="text-xs text-text-muted mt-3">
            {isEN
              ? "Couldn't fetch species data right now — please try again later."
              : 'Soortgegevens konden nu niet worden opgehaald — probeer het later opnieuw.'}
          </p>
        )}
      </div>
  )
  const calendarBlock = (
    <Section title={t.plantDetail.yearCalendar}>
      {calendarInner}
    </Section>
  )

  const ecologyBlock = plant.species_id != null
    ? <EcologyCard speciesId={plant.species_id} />
    : null

  const alertsBlock = <PlantCareSignals plantId={plantId} phenology={plant.phenology ?? null} />

  // Schedule rows without the quick-action pills — the desktop layout shows
  // the pills in the hero identity panel instead, so they must not repeat here.
  const careScheduleRows = plant.care_schedules.length > 0 && (
      <div className="space-y-2">
        {plant.care_schedules.map((sched) => {
          const isOverdue = sched.next_due < today
          const isDueToday = sched.next_due === today
          return (
            <div key={sched.id} className="card p-3.5 flex items-center gap-3">
              <span className="shrink-0 text-text-soft"><CareIcon type={sched.care_type as CareIconType} size={22} strokeWidth={1.8} /></span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{t.careTypes[sched.care_type as keyof typeof t.careTypes] ?? sched.care_type}</p>
                <p className="text-xs text-text-muted">{t.plantDetail.xDays.replace('{n}', String(sched.interval_days))}</p>
                {sched.care_type === 'water'
                  && (sched.interval_source === 'species' || sched.interval_source === 'provisional')
                  && (
                  <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {sched.interval_source === 'species'
                      ? t.plantDetail.intervalSourceSpecies
                      : t.plantDetail.intervalSourceProvisional}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${isOverdue ? 'text-overdue' : isDueToday ? 'text-due' : 'text-good'}`}>
                  {isOverdue ? t.plantDetail.overdue : isDueToday ? t.plantDetail.today : sched.next_due}
                </p>
                {sched.last_done_by_name && (
                  <p className="text-[11px] text-text-muted">{t.plantDetail.byPerson.replace('{name}', sched.last_done_by_name)}</p>
                )}
              </div>
              <button
                onClick={() => handleDeleteSchedule(sched.id)}
                className="text-xs text-text-muted hover:text-overdue transition-colors px-1 shrink-0"
                title={t.plantDetail.deleteSchedule}
              >
                <Glyph name="x" size={14} />
              </button>
            </div>
          )
        })}
      </div>
  )

  const careBlock = careScheduleRows && (
    <Section title={t.plantDetail.care}>
      {/* Quick action buttons */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
        {plant.care_schedules.map((sched) => {
          return (
            <button
              key={sched.id}
              onClick={() => sched.care_type === 'photo' ? openCarePhotoPicker(null) : handleQuickAction(sched.care_type)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-full text-sm font-semibold whitespace-nowrap active:scale-95 transition-transform"
            >
              <CareIcon type={sched.care_type as CareIconType} size={16} strokeWidth={2} /> {t.careTypes[sched.care_type as keyof typeof t.careTypes] ?? sched.care_type}
            </button>
          )
        })}
      </div>
      {careScheduleRows}
    </Section>
  )

  // mt-4 lived inside PlantCareInfo; hoisted here so the desktop column can
  // start the card flush with its siblings' section headers.
  const trefleBlock = (
    <div className="mt-4 mb-6">
      <PlantCareInfo plantId={plantId} />
    </div>
  )

  const journalBlock = (
    <Section id={PLANT_PASSPORT_ANCHORS.photoJournal} title={t.plantDetail.photoJournal}>
      <PhotoJournal
        plantId={plant.id}
        refreshKey={journalRefresh}
        reminder={(() => {
          const s = plant.care_schedules.find(cs => cs.care_type === 'photo' && cs.is_active)
          return s ? { enabled: true, intervalDays: s.interval_days } : undefined
        })()}
      />
    </Section>
  )

  // Non-blocking "add a photo?" + undo affordance after logging care
  const carePhotoUi = (
    <>
      <input ref={carePhotoRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={handleCarePhotoPick} />
      {(pendingCareLogId != null || undoInfo != null) && (
        <div className="fixed bottom-20 inset-x-4 z-40 card p-3 flex items-center gap-3 shadow-lg">
          {undoInfo && (
            <button
              className="flex-1 py-2 rounded-full bg-surface border border-border text-text font-semibold text-sm active:scale-[0.98] transition-transform"
              onClick={handleUndo}
            >
              <Glyph name="refresh" size={14} aria-hidden /> {t.plantDetail.undo}
            </button>
          )}
          {pendingCareLogId != null && (
            <button
              className="flex-1 py-2 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
              disabled={carePhotoBusy}
              onClick={() => openCarePhotoPicker(pendingCareLogId)}
            >
              <span className="inline-flex items-center gap-1.5"><Glyph name="camera" size={15} />{carePhotoBusy ? t.photoJournal.uploading : t.photoJournal.addCarePhoto}</span>
            </button>
          )}
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border text-text-muted"
                  onClick={() => { setPendingCareLogId(null); setUndoInfo(null); if (undoTimer) clearTimeout(undoTimer) }}>
            <Glyph name="x" size={15} />
          </button>
        </div>
      )}
    </>
  )

  const historyBlock = careLog.data && careLog.data.length > 0 && (
    <Section id={PLANT_PASSPORT_ANCHORS.careHistory} title={t.plantDetail.careHistory}>
      <div className="card divide-y divide-border/50">
        {careLog.data.map((entry) => {
          return (
            <div key={entry.id} id={careLogAnchor(entry.id)} className="flex items-center gap-3 px-4 py-3 scroll-mt-24">
              <span className="shrink-0 text-text-soft"><CareIcon type={entry.care_type as CareIconType} size={20} strokeWidth={1.8} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{entry.done_by_name}</span>
                  <span className="text-text-muted">
                    {entry.skipped ? ` ${t.plantDetail.skipped} ` : ` ${t.plantDetail.did} `}
                    {t.careTypes[entry.care_type as keyof typeof t.careTypes] ?? entry.care_type}
                  </span>
                </p>
                {entry.notes && <p className="text-xs text-text-muted truncate">{entry.notes}</p>}
              </div>
              <span className="text-xs text-text-muted shrink-0">
                {new Date(entry.done_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </span>
            </div>
          )
        })}
      </div>
    </Section>
  )

  const archiveButton = (
    <button
      onClick={handleArchive}
      className="w-full py-2.5 text-sm text-overdue/70 border border-overdue/20 rounded-xl hover:bg-overdue/5 transition-colors mt-2"
    >
      {t.plantDetail.archivePlant}
    </button>
  )

  // ── Desktop (≥721px): editorial masthead + zoned layout ──
  if (!isMobile) {
    const eyebrow = [
      t.plantDetail.mastheadEyebrow,
      plant.location_icon && plant.location_name
        ? `${plant.location_icon} ${plant.location_name}`
        : plant.location_name,
      plant.plant_type,
    ].filter(Boolean).join(' · ')

    const stats: MastheadStat[] = []
    if (plant.care_schedules.length > 0) {
      stats.push({ value: plant.care_schedules.length, label: t.plantDetail.statSchedules })
    }
    if (sunHours !== null) {
      stats.push({ value: sunHours.toFixed(1), label: t.plantDetail.statSunHours })
    }

    // Quick-action care pills pulled into the hero panel for immediate access
    const quickActionPills = plant.care_schedules.length > 0 && (
      <div className="flex gap-2 flex-wrap">
        {plant.care_schedules.map((sched) => (
          <button
            key={sched.id}
            onClick={() => sched.care_type === 'photo' ? openCarePhotoPicker(null) : handleQuickAction(sched.care_type)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-full text-sm font-semibold whitespace-nowrap active:scale-95 transition-transform cursor-pointer"
          >
            <CareIcon type={sched.care_type as CareIconType} size={16} strokeWidth={2} /> {t.careTypes[sched.care_type as keyof typeof t.careTypes] ?? sched.care_type}
          </button>
        ))}
      </div>
    )

    return (
      <div style={{ paddingBottom: 80 }}>
        {/* ── Masthead — wide rhythm matching Plants / Calendar ── */}
        <div style={{ maxWidth: 1800, margin: '0 auto' }}>
          <PageMasthead
            eyebrow={eyebrow}
            title={plant.name}
            accent={plant.species ?? undefined}
            lede={plant.notes ? `"${plant.notes}"` : undefined}
            stats={stats}
            actions={
              <>
                <NavArrow dir="prev" plant={prevPlant} t={t} onClick={() => prevPlant && navigateToPlant(prevPlant.id)} />
                <NavArrow dir="next" plant={nextPlant} t={t} onClick={() => nextPlant && navigateToPlant(nextPlant.id)} />
                <button
                  onClick={() => navigate(-1)}
                  title={t.common.back}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-transparent text-text-soft transition-all hover:border-primary hover:text-primary"
                >
                  <Glyph name="arrow-left" size={18} aria-hidden />
                </button>
                <button
                  onClick={handleDuplicate}
                  disabled={duplicating}
                  className="cursor-pointer rounded-full border border-border bg-transparent px-4 py-2 text-[13px] font-medium text-text-soft transition-all hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {duplicating ? '…' : t.plantDetail.copyPlant}
                </button>
                <Link
                  to={`/plants/${plantId}/edit`}
                  className="rounded-full border border-primary px-4 py-2 text-[13px] font-medium text-primary no-underline transition-all hover:bg-primary hover:text-white"
                >
                  {t.plantDetail.edit}
                </Link>
              </>
            }
          />
        </div>

        {/* ── Hero: large photo + identity panel (above the fold) ── */}
        <div style={{ maxWidth: 1800, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 380px',
              padding: '0 clamp(24px, 3vw, 56px)',
            }}
          >
            {/* Photo — fills the left column, rounded-left */}
            <div
              style={{
                borderRadius: '16px 0 0 16px',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
                borderRight: 0,
                background: 'var(--color-bg-warm)',
              }}
            >
              <div className="w-full h-[380px]">
                {heroMedia('w-full h-full')}
              </div>
            </div>
            {/* Identity panel — right column, rounded-right */}
            <div
              style={{
                borderRadius: '0 16px 16px 0',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: '32px 28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 14,
              }}
            >
              {plant.species && (
                <p
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontStyle: 'italic',
                    fontSize: 18,
                    color: 'var(--color-text-soft)',
                    lineHeight: 1.3,
                  }}
                >
                  {plant.species}
                </p>
              )}
              {potAcquiredLine && (
                <p className="font-mono text-[10px] text-text-muted">{potAcquiredLine}</p>
              )}
              {sunFitCard}
              {quickActionPills}
            </div>
          </div>
        </div>

        {/* ── Content zones — passport spread ── */}
        <div style={{ maxWidth: 1800, margin: '0 auto', padding: '0 clamp(24px, 3vw, 56px)' }}>
          {/* Year calendar — full-width seasonal timeline */}
          <section className="border-b border-border pt-9 pb-7">
            <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-text-muted">
              {t.plantDetail.yearCalendar}
            </p>
            {calendarInner}
          </section>

          {/* Three columns with hairline rules: alerts + care | profile + weather | journal */}
          <div className="grid grid-cols-2 items-start gap-x-10 gap-y-8 pt-8 xl:grid-cols-3 xl:gap-x-0 xl:divide-x xl:divide-border">
            <div className="min-w-0 xl:pr-8">
              {alertsBlock}
              {careScheduleRows && (
                <Section title={t.plantDetail.care}>
                  {careScheduleRows}
                </Section>
              )}
            </div>
            <div className="min-w-0 xl:px-8">
              <PlantCareInfo plantId={plantId} layout="split" />
            </div>
            <div className="min-w-0 xl:pl-8">
              {journalBlock}
              {ecologyBlock}
            </div>
          </div>

          {/* Full-width: care history */}
          {historyBlock && (
            <div className="mt-4 border-t border-border pt-8">
              {historyBlock}
            </div>
          )}

          {/* Archive, tucked away */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleArchive}
              className="cursor-pointer rounded-full border border-overdue/25 bg-transparent px-4 py-2 text-[13px] text-overdue/70 transition-colors hover:bg-overdue/5"
            >
              {t.plantDetail.archivePlant}
            </button>
          </div>
        </div>

        {carePhotoUi}
      </div>
    )
  }

  // ── Mobile (<721px): with prev/next arrows and swipe ──
  return (
    <div className="pb-10">
      {/* Hero */}
      <div className="relative" onTouchStart={onHeroTouchStart} onTouchEnd={onHeroTouchEnd}>
        {heroMedia('w-full h-52')}

        {/* Prev/next arrows — flanking the hero image */}
        {prevPlant && (
          <button
            onClick={() => navigateToPlant(prevPlant.id)}
            title={t.plantDetail.prevPlant}
            className="absolute top-1/2 -translate-y-1/2 left-2 w-8 h-8 rounded-full bg-surface/80 backdrop-blur-sm flex items-center justify-center text-text shadow"
          >
            <Glyph name="arrow-left" size={16} aria-hidden />
          </button>
        )}
        {nextPlant && (
          <button
            onClick={() => navigateToPlant(nextPlant.id)}
            title={t.plantDetail.nextPlant}
            className="absolute top-1/2 -translate-y-1/2 right-2 w-8 h-8 rounded-full bg-surface/80 backdrop-blur-sm flex items-center justify-center text-text shadow"
          >
            <Glyph name="chevron-right" size={16} aria-hidden />
          </button>
        )}

        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center text-text"
        >
          <Glyph name="arrow-left" size={18} aria-hidden />
        </button>

        <div className="absolute top-4 right-4 flex gap-1.5">
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center text-text-muted disabled:opacity-50"
            title={t.plantDetail.copyPlant}
          >
            {duplicating ? '…' : '⎘'}
          </button>
          <PassportEditLink to={`/plants/${plantId}/edit`} label={t.plantDetail.edit} />
        </div>
      </div>

      <div className="px-4 -mt-6 relative z-10">
        {/* Identity card */}
        <div className="card p-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {(plant.location_name || plant.plant_type) && (
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1">
                  {[
                    plant.location_icon && plant.location_name
                      ? `${plant.location_icon} ${plant.location_name}`
                      : plant.location_name,
                    plant.plant_type,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight">{plant.name}</h1>
              {plant.species && (
                <p className="font-heading italic text-sm text-text-muted mt-0.5">{plant.species}</p>
              )}
              {potAcquiredLine && (
                <p className="font-mono text-[10px] text-text-muted mt-1.5">{potAcquiredLine}</p>
              )}
            </div>
          </div>

          {plant.notes && (
            <p className="text-sm mt-3 text-text-muted bg-bg rounded-xl p-3 italic">"{plant.notes}"</p>
          )}
        </div>

        {/* Sun fit (if placed on map) */}
        {sunFitBlock}

        {/* Jaarkalender */}
        {calendarBlock}

        {/* Ecology */}
        {ecologyBlock}

        {/* Weather alerts */}
        {alertsBlock}

        {/* Care schedules */}
        {careBlock}

        {/* Trefle care info */}
        {trefleBlock}

        {/* Photo journal (Groeidagboek) */}
        {journalBlock}

        {carePhotoUi}

        {/* Care history */}
        {historyBlock}

        {/* Archive */}
        {archiveButton}
      </div>
    </div>
  )
}

import { useT } from '../context/LanguageContext'
import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import type { Phenology, PlantAlert } from '../types'
import CareIcon, { type CareIconType } from '../components/ui/CareIcon'
import Glyph from '../components/ui/Glyph'
import { plants as plantsApi, care } from '../api/client'
import { useCareLog } from '../hooks/useCareLog'
import { useSunAt } from '../hooks/useSunAt'
import PlantCareInfo from '../components/PlantCareInfo'
import PhotoJournal from '../components/plant/PhotoJournal'
import { photos as photosApi } from '../api/client'
import { compressImage } from '../utils/compressImage'
import EcologyCard from '../components/EcologyCard'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../utils/plantSunRequirements'
import PhaseCalendar from '../components/PhaseCalendar'
import { resolveIconUrl } from '../utils/icons'
import PageMasthead, { type MastheadStat } from '../components/ui/PageMasthead'
import { useIsMobile } from '../hooks/useIsMobile'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <p className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">{title}</p>
      {children}
    </section>
  )
}

const ALERT_BORDER: Record<PlantAlert['severity'], string> = {
  urgent:  'border-l-fiery-red',
  warning: 'border-l-pumpkin-swirl',
  info:    'border-l-aqua-glow',
}

const ALERT_BG: Record<PlantAlert['severity'], string> = {
  urgent:  'bg-fiery-red/8',
  warning: 'bg-pumpkin-swirl/8',
  info:    'bg-aqua-glow/8',
}

function PlantAlerts({ plantId, phenology }: { plantId: number; phenology: Phenology | null }) {
  const [alerts, setAlerts] = useState<PlantAlert[]>([])
  const t = useT()

  useEffect(() => {
    plantsApi.alerts(plantId).then(setAlerts).catch(() => {})
  }, [plantId])

  if (alerts.length === 0) return null

  const currentMonth = new Date().getMonth() + 1
  const monthData = phenology?.months?.find(m => m.month === currentMonth)
  const monthActions = t.locale?.startsWith('en') && monthData?.actions_en
    ? monthData.actions_en
    : (monthData?.actions_nl ?? [])

  return (
    <Section title={t.plantDetail.weatherAlerts}>
      <div className="space-y-2">
        {alerts.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border-l-4 ${ALERT_BORDER[alert.severity]} ${ALERT_BG[alert.severity]}`}
          >
            <span className="text-lg shrink-0 mt-0.5">{alert.icon}</span>
            {/* Use message_en if available for EN locale */}
            <p className="text-sm text-text leading-snug">
              {(t.locale?.startsWith('en') && (alert as any).message_en)
                ? (alert as any).message_en
                : (alert as any).message_nl}
            </p>
          </div>
        ))}
      </div>
      {monthActions.length > 0 && (
        <div className="mt-2 rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{t.plantDetail.whatCanYouDo}</p>
          <ul className="space-y-1">
            {monthActions.map((action, i) => (
              <li key={i} className="text-sm text-text flex gap-1.5">
                <span className="text-primary shrink-0">→</span>
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

  const mapInfo = plant?.map_id ? (maps.find(m => m.id === plant.map_id) ?? null) : null
  const sunCoord = useMemo(
    () => plant?.map_x != null && plant?.map_y != null ? { x: plant.map_x, y: plant.map_y } : null,
    [plant?.map_x, plant?.map_y],
  )
  const currentMonth = new Date().getMonth() + 1
  const { sunHours } = useSunAt(sunCoord, currentMonth, mapInfo)
  // 720px editorial-layout boundary (same split as Plants.tsx / PageMasthead)
  const isMobile = useIsMobile(720)

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

  const sunFitBlock = sunFitInfo && (
    <div className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3 mb-5 border border-border">
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

  // A phenology object can exist yet have no month calendar (incomplete LLM
  // generation) — that still reads as "No species data available", so treat it
  // the same as missing and offer the fetch button.
  const hasYearCalendar = (plant.phenology?.months?.length ?? 0) > 0
  const calendarBlock = hasYearCalendar ? (
    <Section title={t.plantDetail.yearCalendar}>
      <PhaseCalendar phenology={plant.phenology!} sunHours={sunHours} />
    </Section>
  ) : (
    <Section title={t.plantDetail.yearCalendar}>
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
    </Section>
  )

  const ecologyBlock = plant.species_id != null
    ? <EcologyCard speciesId={plant.species_id} />
    : null

  const alertsBlock = <PlantAlerts plantId={plantId} phenology={plant.phenology ?? null} />

  const careBlock = plant.care_schedules.length > 0 && (
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

      {/* Schedule rows */}
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
    </Section>
  )

  const trefleBlock = (
    <div className="mb-6">
      <PlantCareInfo plantId={plantId} />
    </div>
  )

  const journalBlock = (
    <Section title={t.plantDetail.photoJournal}>
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
              ↩ {t.plantDetail.undo}
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
    <Section title={t.plantDetail.careHistory}>
      <div className="card divide-y divide-border/50">
        {careLog.data.map((entry) => {
          return (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
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

  // ── Desktop (≥721px): editorial masthead + two-column layout ──
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

    return (
      <div className="pb-16">
        <div className="mx-auto max-w-5xl">
          <PageMasthead
            eyebrow={eyebrow}
            title={plant.name}
            accent={plant.species ?? undefined}
            lede={plant.notes ? `"${plant.notes}"` : undefined}
            stats={stats}
            actions={
              <>
                <button
                  onClick={() => navigate(-1)}
                  title={t.common.back}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-transparent text-text-soft transition-all hover:border-primary hover:text-primary"
                >
                  ←
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
          <div className="grid grid-cols-[1fr_380px] items-start gap-8 px-6 pt-6">
            <div className="min-w-0">
              {alertsBlock}
              {sunFitBlock}
              {careBlock}
              {calendarBlock}
              {historyBlock}
              {archiveButton}
            </div>
            <div className="min-w-0">
              <div className="mb-3 overflow-hidden rounded-2xl border border-border">
                {heroMedia('w-full h-64')}
              </div>
              {potAcquiredLine && (
                <p className="mb-5 font-mono text-[10px] text-text-muted">{potAcquiredLine}</p>
              )}
              {journalBlock}
              {ecologyBlock}
              {trefleBlock}
            </div>
          </div>
        </div>
        {carePhotoUi}
      </div>
    )
  }

  // ── Mobile (<721px): unchanged layout ──
  return (
    <div className="pb-10">
      {/* Hero */}
      <div className="relative">
        {heroMedia('w-full h-52')}

        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center text-text"
        >
          ←
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
          <Link
            to={`/plants/${plantId}/edit`}
            className="w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center no-underline text-primary font-semibold text-sm"
          >
            {t.plantDetail.edit}
          </Link>
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

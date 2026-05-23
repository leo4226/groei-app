import { useT } from '../context/LanguageContext'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { CARE_TYPE_INFO } from '../types'
import type { Phenology, PlantAlert } from '../types'
import { plants as plantsApi, care } from '../api/client'
import { useCareLog } from '../hooks/useCareLog'
import { useSunAt } from '../hooks/useSunAt'
import PlantCareInfo from '../components/PlantCareInfo'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../utils/plantSunRequirements'
import PhaseCalendar from '../components/PhaseCalendar'
import { resolveIconUrl } from '../utils/icons'

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
  const monthActions = phenology?.months.find(m => m.month === currentMonth)?.actions_nl ?? []

  return (
    <Section title={t.plantDetail.weatherAlerts}>
      <div className="space-y-2">
        {alerts.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border-l-4 ${ALERT_BORDER[alert.severity]} ${ALERT_BG[alert.severity]}`}
          >
            <span className="text-lg shrink-0 mt-0.5">{alert.icon}</span>
            <p className="text-sm text-text leading-snug">{alert.message_nl}</p>
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
  const [duplicating, setDuplicating] = useState(false)

  const plantId = Number(id)
  const careLog = useCareLog(plantId)

  const mapInfo = plant?.map_id ? (maps.find(m => m.id === plant.map_id) ?? null) : null
  const sunCoord = useMemo(
    () => plant?.map_x != null && plant?.map_y != null ? { x: plant.map_x, y: plant.map_y } : null,
    [plant?.map_x, plant?.map_y],
  )
  const currentMonth = new Date().getMonth() + 1
  const { sunHours } = useSunAt(sunCoord, currentMonth, mapInfo)

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
    await markCareDone(plantId, careType)
  }

  async function handleDeleteSchedule(scheduleId: number) {
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

  return (
    <div className="pb-10">
      {/* Hero */}
      <div className="relative">
        {plant.photo_path ? (
          <img src={plant.photo_path} alt={plant.name} className="w-full h-52 object-cover" />
        ) : plant.icon_key ? (
          <div className="w-full h-52 flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #fef9ee 0%, #f2ebe6 100%)' }}>
            <img src={resolveIconUrl(plant.icon_key)!} alt={plant.name} className="h-40 w-40 object-contain" />
          </div>
        ) : (
          <div className="w-full h-52 bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center text-7xl">🌿</div>
        )}

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
              {(plant.pot_size_cm || plant.acquired_date) && (
                <p className="font-mono text-[10px] text-text-muted mt-1.5">
                  {[
                    plant.pot_size_cm ? `🪴 ${plant.pot_size_cm} cm` : null,
                    plant.acquired_date
                      ? `📅 ${new Date(plant.acquired_date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`
                      : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>

          {plant.notes && (
            <p className="text-sm mt-3 text-text-muted bg-bg rounded-xl p-3 italic">"{plant.notes}"</p>
          )}
        </div>

        {/* Sun fit (if placed on map) */}
        {sunFitInfo && (
          <div className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3 mb-5 border border-border">
            <span className="text-lg">☀️</span>
            <span className="text-sm text-text-muted flex-1">
              {t.plantDetail.sunHoursLabel} <span className="text-text font-medium">~{sunFitInfo.sunHours.toFixed(1)}u/dag</span>
              {' · '}{sunFitInfo.profile.labelNl}
            </span>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: SUN_FIT_COLORS[sunFitInfo.fit] + '20', color: SUN_FIT_COLORS[sunFitInfo.fit] }}
            >
              {sunFitInfo.fit === 'good' ? t.plantDetail.fitGood : sunFitInfo.fit === 'partial' ? t.plantDetail.fitPartial : t.plantDetail.fitInsufficient}
            </span>
          </div>
        )}

        {/* Jaarkalender */}
        {plant.phenology && (
          <Section title={t.plantDetail.yearCalendar}>
            <PhaseCalendar phenology={plant.phenology} sunHours={sunHours} />
          </Section>
        )}

        {/* Weather alerts */}
        <PlantAlerts plantId={plantId} phenology={plant.phenology ?? null} />

        {/* Care schedules */}
        {plant.care_schedules.length > 0 && (
          <Section title={t.plantDetail.care}>
            {/* Quick action buttons */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
              {plant.care_schedules.map((sched) => {
                const info = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
                return (
                  <button
                    key={sched.id}
                    onClick={() => handleQuickAction(sched.care_type)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-full text-sm font-semibold whitespace-nowrap active:scale-95 transition-transform"
                  >
                    {info?.icon ?? '🌿'} {info?.label ?? sched.care_type}
                  </button>
                )
              })}
            </div>

            {/* Schedule rows */}
            <div className="space-y-2">
              {plant.care_schedules.map((sched) => {
                const info      = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
                const isOverdue = sched.next_due < today
                const isDueToday = sched.next_due === today
                return (
                  <div key={sched.id} className="card p-3.5 flex items-center gap-3">
                    <span className="text-xl shrink-0">{info?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{info?.label ?? sched.care_type}</p>
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
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Trefle care info */}
        <div className="mb-6">
          <PlantCareInfo plantId={plantId} />
        </div>

        {/* Care history */}
        {careLog.data && careLog.data.length > 0 && (
          <Section title={t.plantDetail.careHistory}>
            <div className="card divide-y divide-border/50">
              {careLog.data.map((entry) => {
                const info = CARE_TYPE_INFO[entry.care_type as keyof typeof CARE_TYPE_INFO]
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-lg shrink-0">{info?.icon ?? '🌿'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold">{entry.done_by_name}</span>
                        <span className="text-text-muted">
                          {entry.skipped ? ` ${t.plantDetail.skipped} ` : ` ${t.plantDetail.did} `}
                          {info?.label ?? entry.care_type}
                        </span>
                      </p>
                      {entry.notes && <p className="text-xs text-text-muted truncate">{entry.notes}</p>}
                    </div>
                    <span className="text-xs text-text-muted shrink-0">
                      {new Date(entry.done_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Archive */}
        <button
          onClick={handleArchive}
          className="w-full py-2.5 text-sm text-overdue/70 border border-overdue/20 rounded-xl hover:bg-overdue/5 transition-colors mt-2"
        >
          {t.plantDetail.archivePlant}
        </button>
      </div>
    </div>
  )
}

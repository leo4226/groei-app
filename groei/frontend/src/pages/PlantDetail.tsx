import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { CARE_TYPE_INFO } from '../types'
import type { CareLogEntry, Phenology, PlantAlert } from '../types'
import { fetchPlant, fetchCareLog, deleteCareSchedule, duplicatePlant, fetchPlantAlerts } from '../api/client'
import PlantCareInfo from '../components/PlantCareInfo'
import { getSunHoursAtPosition } from '../utils/heatmapCalc'
import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../utils/plantSunRequirements'
import { computeSuitability } from '../utils/suitability'

const MONTH_LABELS  = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MONTH_NL      = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <p className="text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">{title}</p>
      {children}
    </section>
  )
}

function Jaarkalender({ phenology, sunHours }: { phenology: Phenology; sunHours: number | null }) {
  const currentMonth = new Date().getMonth() + 1
  const suitability  = computeSuitability(phenology, sunHours ?? 0, currentMonth)
  const fmtMonths = (months: number[]) => months.map(m => MONTH_NL[m - 1]).join(', ')

  return (
    <Section title="Jaarkalender">
      {/* Phase strips */}
      <div className="flex gap-0.5 mb-1">
        {MONTH_LABELS.map((lbl, i) => {
          const month = i + 1
          const data  = phenology.months.find(m => m.month === month)
          const phase = data?.phase ?? 'unknown'
          const isCurrent = month === currentMonth
          return (
            <div key={month} className="flex-1 flex flex-col items-center" title={data?.phase_label_nl ?? ''}>
              <div
                className={`w-full h-5 rounded-sm ${isCurrent ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                style={{ backgroundColor: PHASE_COLORS[phase] ?? PHASE_COLORS.unknown }}
              />
              <span className="text-[8px] text-text-muted mt-0.5">{lbl}</span>
            </div>
          )
        })}
      </div>

      {/* Current month callout */}
      <div className="mt-2 p-3 bg-surface rounded-xl border border-border">
        <p className="text-sm font-semibold text-text">
          Nu ({MONTH_NL[currentMonth - 1]}): {suitability.phaseLabel || '—'}
        </p>
        {suitability.detailLabel && (
          <p className="text-xs text-text-muted mt-0.5">{suitability.detailLabel}</p>
        )}
        {suitability.actions.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {suitability.actions.map((action, i) => (
              <li key={i} className="text-xs text-text-muted">→ {action}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Planting windows */}
      {(phenology.sow_window?.length > 0 || phenology.transplant_window?.length > 0 || phenology.harvest_window?.length > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {phenology.sow_window?.length > 0 && (
            <div className="bg-green-50 rounded-xl p-2">
              <p className="text-xs font-semibold text-green-700">Zaaien</p>
              <p className="text-xs text-green-600 mt-0.5">{fmtMonths(phenology.sow_window)}</p>
            </div>
          )}
          {phenology.transplant_window?.length > 0 && (
            <div className="bg-blue-50 rounded-xl p-2">
              <p className="text-xs font-semibold text-blue-700">Uitplanten</p>
              <p className="text-xs text-blue-600 mt-0.5">{fmtMonths(phenology.transplant_window)}</p>
            </div>
          )}
          {phenology.harvest_window?.length > 0 && (
            <div className="bg-amber-50 rounded-xl p-2">
              <p className="text-xs font-semibold text-amber-700">Oogst</p>
              <p className="text-xs text-amber-600 mt-0.5">{fmtMonths(phenology.harvest_window)}</p>
            </div>
          )}
        </div>
      )}

      {/* Interesting fact */}
      {phenology.interesting_facts_nl && (
        <p className="text-xs text-text-muted italic mt-3 border-t border-border pt-3">
          💡 {phenology.interesting_facts_nl}
        </p>
      )}
    </Section>
  )
}

const ALERT_BORDER: Record<PlantAlert['severity'], string> = {
  urgent:  'border-l-red-500',
  warning: 'border-l-orange-400',
  info:    'border-l-blue-400',
}

const ALERT_BG: Record<PlantAlert['severity'], string> = {
  urgent:  'bg-red-50',
  warning: 'bg-orange-50',
  info:    'bg-blue-50',
}

function PlantAlerts({ plantId, phenology }: { plantId: number; phenology: Phenology | null }) {
  const [alerts, setAlerts] = useState<PlantAlert[]>([])

  useEffect(() => {
    fetchPlantAlerts(plantId).then(setAlerts).catch(() => {})
  }, [plantId])

  if (alerts.length === 0) return null

  const currentMonth = new Date().getMonth() + 1
  const monthActions = phenology?.months.find(m => m.month === currentMonth)?.actions_nl ?? []

  return (
    <Section title="Weeralerts">
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
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Wat kun je nu doen?</p>
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
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { markCareDone, archivePlant } = useGroeiStore()

  const [plant, setPlant]         = useState<Awaited<ReturnType<typeof fetchPlant>> | null>(null)
  const [careLog, setCareLog]     = useState<CareLogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [duplicating, setDuplicating] = useState(false)
  const [sunHours, setSunHours]   = useState<number | null>(null)

  const plantId = Number(id)

  useEffect(() => {
    async function load() {
      try {
        const [p, log] = await Promise.all([fetchPlant(plantId), fetchCareLog(plantId)])
        setPlant(p)
        setCareLog(log)
        if (p.map_x != null && p.map_y != null) {
          const month = new Date().getMonth() + 1
          setSunHours(getSunHoursAtPosition(p.map_x, p.map_y, month))
        }
      } catch {
        navigate('/plants')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [plantId, navigate])

  async function handleQuickAction(careType: string) {
    await markCareDone(plantId, careType)
    const [p, log] = await Promise.all([fetchPlant(plantId), fetchCareLog(plantId)])
    setPlant(p)
    setCareLog(log)
  }

  async function handleDeleteSchedule(scheduleId: number) {
    await deleteCareSchedule(scheduleId)
    setPlant(await fetchPlant(plantId))
  }

  async function handleArchive() {
    await archivePlant(plantId)
    navigate('/plants')
  }

  async function handleDuplicate() {
    setDuplicating(true)
    try {
      const copy = await duplicatePlant(plantId)
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
          <div className="w-full h-52 flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #FDFAF1 0%, #EDE5D1 100%)' }}>
            <img src={`/api/icons/${plant.icon_key}.svg`} alt={plant.name} className="h-40 w-40 object-contain" />
          </div>
        ) : (
          <div className="w-full h-52 bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center text-7xl">🌿</div>
        )}

        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center shadow-sm text-text"
        >
          ←
        </button>

        <div className="absolute top-4 right-4 flex gap-1.5">
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center shadow-sm text-text-muted disabled:opacity-50"
            title="Kopieer plant"
          >
            {duplicating ? '…' : '⎘'}
          </button>
          <Link
            to={`/plants/${plantId}/edit`}
            className="w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center shadow-sm no-underline text-primary font-semibold text-sm"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="px-4 -mt-6 relative z-10">
        {/* Identity card */}
        <div className="card p-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold leading-tight">{plant.name}</h1>
              {plant.species && <p className="text-sm text-text-muted italic mt-0.5">{plant.species}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {plant.plant_type && (
              <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium capitalize">
                {plant.plant_type}
              </span>
            )}
            {plant.location_name && (
              <span className="text-xs bg-bg text-text-muted px-2.5 py-1 rounded-full">
                {plant.location_icon} {plant.location_name}
              </span>
            )}
            {plant.pot_size_cm && (
              <span className="text-xs bg-bg text-text-muted px-2.5 py-1 rounded-full">
                🪴 {plant.pot_size_cm} cm
              </span>
            )}
            {plant.acquired_date && (
              <span className="text-xs bg-bg text-text-muted px-2.5 py-1 rounded-full">
                📅 {plant.acquired_date}
              </span>
            )}
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
              Zonuren: <span className="text-text font-medium">~{sunFitInfo.sunHours.toFixed(1)}u/dag</span>
              {' · '}{sunFitInfo.profile.labelNl}
            </span>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: SUN_FIT_COLORS[sunFitInfo.fit] + '20', color: SUN_FIT_COLORS[sunFitInfo.fit] }}
            >
              {sunFitInfo.fit === 'good' ? '✓ Geschikt' : sunFitInfo.fit === 'partial' ? '~ Deels' : '⚠ Te weinig'}
            </span>
          </div>
        )}

        {/* Jaarkalender */}
        {plant.phenology && (
          <Jaarkalender phenology={plant.phenology} sunHours={sunHours} />
        )}

        {/* Weather alerts */}
        <PlantAlerts plantId={plantId} phenology={plant.phenology ?? null} />

        {/* Care schedules */}
        {plant.care_schedules.length > 0 && (
          <Section title="Verzorging">
            {/* Quick action buttons */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
              {plant.care_schedules.map((sched) => {
                const info = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
                return (
                  <button
                    key={sched.id}
                    onClick={() => handleQuickAction(sched.care_type)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold whitespace-nowrap active:scale-95 transition-transform shadow-sm"
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
                      <p className="text-xs text-text-muted">Elke {sched.interval_days} dagen</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${isOverdue ? 'text-overdue' : isDueToday ? 'text-due' : 'text-good'}`}>
                        {isOverdue ? 'Te laat' : isDueToday ? 'Vandaag' : sched.next_due}
                      </p>
                      {sched.last_done_by_name && (
                        <p className="text-[11px] text-text-muted">Door {sched.last_done_by_name}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteSchedule(sched.id)}
                      className="text-xs text-text-muted hover:text-overdue transition-colors px-1 shrink-0"
                      title="Verwijder schema"
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
        {careLog.length > 0 && (
          <Section title="Zorggeschiedenis">
            <div className="card divide-y divide-border/50">
              {careLog.map((entry) => {
                const info = CARE_TYPE_INFO[entry.care_type as keyof typeof CARE_TYPE_INFO]
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-lg shrink-0">{info?.icon ?? '🌿'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold">{entry.done_by_name}</span>
                        <span className="text-text-muted">
                          {entry.skipped ? ' sloeg over: ' : ' deed: '}
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
          Archiveer plant
        </button>
      </div>
    </div>
  )
}

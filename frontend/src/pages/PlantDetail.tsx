     1|import { useEffect, useState } from 'react'
     2|import { useParams, useNavigate, Link } from 'react-router-dom'
     3|import { useFloreren } from '../store/useFloreren'
     4|import { CARE_TYPE_INFO } from '../types'
     5|import type { Phenology, PlantAlert } from '../types'
     6|import { fetchPlant, deleteCareSchedule, duplicatePlant, fetchPlantAlerts } from '../api/client'
     7|import { useCareLog } from '../hooks/useCareLog'
     8|import PlantCareInfo from '../components/PlantCareInfo'
     9|import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../utils/plantSunRequirements'
    10|import PhaseCalendar from '../components/PhaseCalendar'
    11|
    12|function Section({ title, children }: { title: string; children: React.ReactNode }) {
    13|  return (
    14|    <section className="mb-6">
    15|      <p className="font-mono text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">{title}</p>
    16|      {children}
    17|    </section>
    18|  )
    19|}
    20|
    21|const ALERT_BORDER: Record<PlantAlert['severity'], string> = {
    22|  urgent:  'border-l-fiery-red',
    23|  warning: 'border-l-pumpkin-swirl',
    24|  info:    'border-l-aqua-glow',
    25|}
    26|
    27|const ALERT_BG: Record<PlantAlert['severity'], string> = {
    28|  urgent:  'bg-fiery-red/8',
    29|  warning: 'bg-pumpkin-swirl/8',
    30|  info:    'bg-aqua-glow/8',
    31|}
    32|
    33|function PlantAlerts({ plantId, phenology }: { plantId: number; phenology: Phenology | null }) {
    34|  const [alerts, setAlerts] = useState<PlantAlert[]>([])
    35|
    36|  useEffect(() => {
    37|    fetchPlantAlerts(plantId).then(setAlerts).catch(() => {})
    38|  }, [plantId])
    39|
    40|  if (alerts.length === 0) return null
    41|
    42|  const currentMonth = new Date().getMonth() + 1
    43|  const monthActions = phenology?.months.find(m => m.month === currentMonth)?.actions_nl ?? []
    44|
    45|  return (
    46|    <Section title="Weeralerts">
    47|      <div className="space-y-2">
    48|        {alerts.map((alert, i) => (
    49|          <div
    50|            key={i}
    51|            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border-l-4 ${ALERT_BORDER[alert.severity]} ${ALERT_BG[alert.severity]}`}
    52|          >
    53|            <span className="text-lg shrink-0 mt-0.5">{alert.icon}</span>
    54|            <p className="text-sm text-text leading-snug">{alert.message_nl}</p>
    55|          </div>
    56|        ))}
    57|      </div>
    58|      {monthActions.length > 0 && (
    59|        <div className="mt-2 rounded-xl border border-border bg-surface/50 p-3">
    60|          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Wat kun je nu doen?</p>
    61|          <ul className="space-y-1">
    62|            {monthActions.map((action, i) => (
    63|              <li key={i} className="text-sm text-text flex gap-1.5">
    64|                <span className="text-primary shrink-0">→</span>
    65|                <span>{action}</span>
    66|              </li>
    67|            ))}
    68|          </ul>
    69|        </div>
    70|      )}
    71|    </Section>
    72|  )
    73|}
    74|
    75|export default function PlantDetail() {
    76|  const { id }     = useParams<{ id: string }>()
    77|  const navigate   = useNavigate()
    78|  const plants = useFloreren(s => s.plants)
    79|  const loadPlants = useFloreren(s => s.loadPlants)
    80|  const { markCareDone, archivePlant } = useFloreren()
    81|
    82|  const [plant, setPlant]         = useState<typeof plants[number] | null>(null)
    83|  const [loading, setLoading]     = useState(true)
    84|  const [duplicating, setDuplicating] = useState(false)
    85|  const [sunHours, setSunHours]   = useState<number | null>(null)
    86|
    87|  const plantId = Number(id)
    88|  const careLog = useCareLog(plantId)
    89|
    90|  useEffect(() => {
    91|    // Use cached plant from store if available, else fetch directly
    92|    const cached = plants.find(p => p.id === plantId)
    93|    if (cached) {
    94|      setPlant(cached)
    95|      setLoading(false)
    96|    } else {
    97|      fetchPlant(plantId).then(p => {
    98|        setPlant(p)
    99|        setLoading(false)
   100|      }).catch(() => navigate('/plants'))
   101|    }
   102|  }, [plantId, plants, navigate])
   103|
   104|  // Keep local plant in sync with store updates (e.g. after markCareDone)
   105|  useEffect(() => {
   106|    if (plant) {
   107|      const updated = plants.find(p => p.id === plantId)
   108|      if (updated && updated !== plant) setPlant(updated)
   109|    }
   110|  }, [plants, plantId])
   111|
   112|  async function handleQuickAction(careType: string) {
   113|    await markCareDone(plantId, careType)
   114|    careLog.invalidate()
   115|  }
   116|
   117|  async function handleDeleteSchedule(scheduleId: number) {
   118|    await deleteCareSchedule(scheduleId)
   119|    await loadPlants() // store.sync effect picks up the updated plant
   120|  }
   121|
   122|  async function handleArchive() {
   123|    await archivePlant(plantId)
   124|    navigate('/plants')
   125|  }
   126|
   127|  async function handleDuplicate() {
   128|    setDuplicating(true)
   129|    try {
   130|      const copy = await duplicatePlant(plantId)
   131|      navigate(`/plants/${copy.id}`)
   132|    } finally {
   133|      setDuplicating(false)
   134|    }
   135|  }
   136|
   137|  if (loading) {
   138|    return (
   139|      <div>
   140|        <div className="skeleton w-full h-52" style={{ borderRadius: 0 }} />
   141|        <div className="px-4 -mt-4 space-y-4">
   142|          <div className="card p-4 space-y-3">
   143|            <div className="skeleton h-6 w-40" />
   144|            <div className="skeleton h-4 w-28" />
   145|            <div className="skeleton h-3 w-48" />
   146|          </div>
   147|        </div>
   148|      </div>
   149|    )
   150|  }
   151|
   152|  if (!plant) return null
   153|
   154|  const today = new Date().toISOString().slice(0, 10)
   155|
   156|  const sunFitInfo = (() => {
   157|    if (!plant.sun_requirement || sunHours === null) return null
   158|    const fit     = getSunFit(plant.sun_requirement, sunHours)
   159|    const profile = PLANT_SUN_PROFILES.find(p => p.id === plant.sun_requirement)
   160|    return fit && profile ? { fit, sunHours, profile } : null
   161|  })()
   162|
   163|  return (
   164|    <div className="pb-10">
   165|      {/* Hero */}
   166|      <div className="relative">
   167|        {plant.photo_path ? (
   168|          <img src={plant.photo_path} alt={plant.name} className="w-full h-52 object-cover" />
   169|        ) : plant.icon_key ? (
   170|          <div className="w-full h-52 flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #fef9ee 0%, #f2ebe6 100%)' }}>
   171|            <img src={`/api/icons/${plant.icon_key}.svg`} alt={plant.name} className="h-40 w-40 object-contain" />
   172|          </div>
   173|        ) : (
   174|          <div className="w-full h-52 bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center text-7xl">🌿</div>
   175|        )}
   176|
   177|        <button
   178|          onClick={() => navigate(-1)}
   179|          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center text-text"
   180|        >
   181|          ←
   182|        </button>
   183|
   184|        <div className="absolute top-4 right-4 flex gap-1.5">
   185|          <button
   186|            onClick={handleDuplicate}
   187|            disabled={duplicating}
   188|            className="w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center text-text-muted disabled:opacity-50"
   189|            title="Kopieer plant"
   190|          >
   191|            {duplicating ? '…' : '⎘'}
   192|          </button>
   193|          <Link
   194|            to={`/plants/${plantId}/edit`}
   195|            className="w-9 h-9 rounded-full bg-surface/90 backdrop-blur-sm flex items-center justify-center no-underline text-primary font-semibold text-sm"
   196|          >
   197|            Edit
   198|          </Link>
   199|        </div>
   200|      </div>
   201|
   202|      <div className="px-4 -mt-6 relative z-10">
   203|        {/* Identity card */}
   204|        <div className="card p-4 mb-5">
   205|          <div className="flex items-start gap-3">
   206|            <div className="flex-1 min-w-0">
   207|              {(plant.location_name || plant.plant_type) && (
   208|                <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1">
   209|                  {[
   210|                    plant.location_icon && plant.location_name
   211|                      ? `${plant.location_icon} ${plant.location_name}`
   212|                      : plant.location_name,
   213|                    plant.plant_type,
   214|                  ].filter(Boolean).join(' · ')}
   215|                </p>
   216|              )}
   217|              <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight">{plant.name}</h1>
   218|              {plant.species && (
   219|                <p className="font-heading italic text-sm text-text-muted mt-0.5">{plant.species}</p>
   220|              )}
   221|              {(plant.pot_size_cm || plant.acquired_date) && (
   222|                <p className="font-mono text-[10px] text-text-muted mt-1.5">
   223|                  {[
   224|                    plant.pot_size_cm ? `🪴 ${plant.pot_size_cm} cm` : null,
   225|                    plant.acquired_date
   226|                      ? `📅 ${new Date(plant.acquired_date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`
   227|                      : null,
   228|                  ].filter(Boolean).join(' · ')}
   229|                </p>
   230|              )}
   231|            </div>
   232|          </div>
   233|
   234|          {plant.notes && (
   235|            <p className="text-sm mt-3 text-text-muted bg-bg rounded-xl p-3 italic">"{plant.notes}"</p>
   236|          )}
   237|        </div>
   238|
   239|        {/* Sun fit (if placed on map) */}
   240|        {sunFitInfo && (
   241|          <div className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3 mb-5 border border-border">
   242|            <span className="text-lg">☀️</span>
   243|            <span className="text-sm text-text-muted flex-1">
   244|              Zonuren: <span className="text-text font-medium">~{sunFitInfo.sunHours.toFixed(1)}u/dag</span>
   245|              {' · '}{sunFitInfo.profile.labelNl}
   246|            </span>
   247|            <span
   248|              className="text-xs font-semibold px-2.5 py-1 rounded-full"
   249|              style={{ background: SUN_FIT_COLORS[sunFitInfo.fit] + '20', color: SUN_FIT_COLORS[sunFitInfo.fit] }}
   250|            >
   251|              {sunFitInfo.fit === 'good' ? '✓ Geschikt' : sunFitInfo.fit === 'partial' ? '~ Deels' : '⚠ Te weinig'}
   252|            </span>
   253|          </div>
   254|        )}
   255|
   256|        {/* Jaarkalender */}
   257|        {plant.phenology && (
   258|          <Section title="Jaarkalender">
   259|            <PhaseCalendar phenology={plant.phenology} sunHours={sunHours} />
   260|          </Section>
   261|        )}
   262|
   263|        {/* Weather alerts */}
   264|        <PlantAlerts plantId={plantId} phenology={plant.phenology ?? null} />
   265|
   266|        {/* Care schedules */}
   267|        {plant.care_schedules.length > 0 && (
   268|          <Section title="Verzorging">
   269|            {/* Quick action buttons */}
   270|            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
   271|              {plant.care_schedules.map((sched) => {
   272|                const info = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
   273|                return (
   274|                  <button
   275|                    key={sched.id}
   276|                    onClick={() => handleQuickAction(sched.care_type)}
   277|                    className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-full text-sm font-semibold whitespace-nowrap active:scale-95 transition-transform"
   278|                  >
   279|                    {info?.icon ?? '🌿'} {info?.label ?? sched.care_type}
   280|                  </button>
   281|                )
   282|              })}
   283|            </div>
   284|
   285|            {/* Schedule rows */}
   286|            <div className="space-y-2">
   287|              {plant.care_schedules.map((sched) => {
   288|                const info      = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
   289|                const isOverdue = sched.next_due < today
   290|                const isDueToday = sched.next_due === today
   291|                return (
   292|                  <div key={sched.id} className="card p-3.5 flex items-center gap-3">
   293|                    <span className="text-xl shrink-0">{info?.icon}</span>
   294|                    <div className="flex-1 min-w-0">
   295|                      <p className="font-semibold text-sm">{info?.label ?? sched.care_type}</p>
   296|                      <p className="text-xs text-text-muted">Elke {sched.interval_days} dagen</p>
   297|                    </div>
   298|                    <div className="text-right shrink-0">
   299|                      <p className={`text-sm font-semibold ${isOverdue ? 'text-overdue' : isDueToday ? 'text-due' : 'text-good'}`}>
   300|                        {isOverdue ? 'Te laat' : isDueToday ? 'Vandaag' : sched.next_due}
   301|                      </p>
   302|                      {sched.last_done_by_name && (
   303|                        <p className="text-[11px] text-text-muted">Door {sched.last_done_by_name}</p>
   304|                      )}
   305|                    </div>
   306|                    <button
   307|                      onClick={() => handleDeleteSchedule(sched.id)}
   308|                      className="text-xs text-text-muted hover:text-overdue transition-colors px-1 shrink-0"
   309|                      title="Verwijder schema"
   310|                    >
   311|                      ✕
   312|                    </button>
   313|                  </div>
   314|                )
   315|              })}
   316|            </div>
   317|          </Section>
   318|        )}
   319|
   320|        {/* Trefle care info */}
   321|        <div className="mb-6">
   322|          <PlantCareInfo plantId={plantId} />
   323|        </div>
   324|
   325|        {/* Care history */}
   326|        {careLog.data && careLog.data.length > 0 && (
   327|          <Section title="Zorggeschiedenis">
   328|            <div className="card divide-y divide-border/50">
   329|              {careLog.data.map((entry) => {
   330|                const info = CARE_TYPE_INFO[entry.care_type as keyof typeof CARE_TYPE_INFO]
   331|                return (
   332|                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
   333|                    <span className="text-lg shrink-0">{info?.icon ?? '🌿'}</span>
   334|                    <div className="flex-1 min-w-0">
   335|                      <p className="text-sm">
   336|                        <span className="font-semibold">{entry.done_by_name}</span>
   337|                        <span className="text-text-muted">
   338|                          {entry.skipped ? ' sloeg over: ' : ' deed: '}
   339|                          {info?.label ?? entry.care_type}
   340|                        </span>
   341|                      </p>
   342|                      {entry.notes && <p className="text-xs text-text-muted truncate">{entry.notes}</p>}
   343|                    </div>
   344|                    <span className="text-xs text-text-muted shrink-0">
   345|                      {new Date(entry.done_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
   346|                    </span>
   347|                  </div>
   348|                )
   349|              })}
   350|            </div>
   351|          </Section>
   352|        )}
   353|
   354|        {/* Archive */}
   355|        <button
   356|          onClick={handleArchive}
   357|          className="w-full py-2.5 text-sm text-overdue/70 border border-overdue/20 rounded-xl hover:bg-overdue/5 transition-colors mt-2"
   358|        >
   359|          Archiveer plant
   360|        </button>
   361|      </div>
   362|    </div>
   363|  )
   364|}
   365|
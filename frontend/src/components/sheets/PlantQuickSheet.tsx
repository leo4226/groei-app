     1|import { useState, useEffect } from 'react'
     2|import { useNavigate } from 'react-router-dom'
     3|import type { MapPlant, MapObject, GroundZone, Plant } from '../../types'
     4|import { CARE_TYPE_INFO } from '../../types'
     5|import { useFloreren } from '../../store/useFloreren'
     6|import { updatePlantContainer, updatePlantGroundZone, updatePlantLock, fetchPlant } from '../../api/client'
     7|
     8|import type { HeatmapCell } from '../../utils/heatmapCalc'
     9|import { getSunFit, PLANT_SUN_PROFILES, SUN_FIT_COLORS } from '../../utils/plantSunRequirements'
    10|
    11|
    12|interface Props {
    13|  plant: MapPlant
    14|  objects: MapObject[]
    15|  soilGroundZones?: GroundZone[]
    16|  heatmapCells?: HeatmapCell[]
    17|  onClose: () => void
    18|  onCareAction: () => void
    19|  onAction: () => void
    20|  onDuplicate?: (plantId: number) => void
    21|  onRemove?: (plantId: number) => void
    22|}
    23|
    24|
    25|export default function PlantQuickSheet({ plant, objects, soilGroundZones = [], heatmapCells, onClose, onCareAction, onAction, onDuplicate, onRemove }: Props) {
    26|  const navigate = useNavigate()
    27|  const markCareDone = useFloreren((s) => s.markCareDone)
    28|  const [locked, setLocked] = useState(plant.is_locked)
    29|  const [detail, setDetail] = useState<Plant | null>(null)
    30|
    31|  useEffect(() => {
    32|    setDetail(null)
    33|    fetchPlant(plant.id).then(setDetail).catch(() => {})
    34|  }, [plant.id])
    35|
    36|  const handleToggleLock = async () => {
    37|    const next = !locked
    38|    setLocked(next)
    39|    try {
    40|      await updatePlantLock(plant.id, next)
    41|      onAction()
    42|    } catch {
    43|      setLocked(!next)
    44|    }
    45|  }
    46|
    47|  const handleWater = async () => {
    48|    try {
    49|      await markCareDone(plant.id, 'water')
    50|      onCareAction()
    51|    } catch (e) {
    52|      console.error('Failed to mark care done:', e)
    53|    }
    54|  }
    55|
    56|  const handleFertilize = async () => {
    57|    try {
    58|      await markCareDone(plant.id, 'fertilize')
    59|      onCareAction()
    60|    } catch (e) {
    61|      console.error('Failed to mark fertilize done:', e)
    62|    }
    63|  }
    64|
    65|  const container = plant.container_id
    66|    ? objects.find(o => o.id === plant.container_id)
    67|    : null
    68|
    69|  const groundZone = plant.ground_zone_id
    70|    ? soilGroundZones.find(z => z.id === plant.ground_zone_id)
    71|    : null
    72|
    73|  const sunFitInfo = (() => {
    74|    if (!plant.sun_requirement) return null
    75|    const pos = container
    76|      ? { x: container.map_x ?? plant.map_x, y: container.map_y ?? plant.map_y }
    77|      : { x: plant.map_x, y: plant.map_y }
    78|    if (pos.x == null || pos.y == null) return null
    79|
    80|    if (!heatmapCells) return null
    81|    const cell = heatmapCells.find(c =>
    82|      (pos.x as number) >= c.x && (pos.x as number) < c.x + c.w &&
    83|      (pos.y as number) >= c.y && (pos.y as number) < c.y + c.h
    84|    )
    85|    const sunHours = cell?.sunHours ?? null
    86|
    87|    if (sunHours === null) return null // still computing
    88|    const fit = getSunFit(plant.sun_requirement, sunHours)
    89|    const profile = PLANT_SUN_PROFILES.find(p => p.id === plant.sun_requirement)
    90|    return fit && profile ? { fit, sunHours, profile } : null
    91|  })()
    92|
    93|  const handleRemoveFromContainer = async () => {
    94|    await updatePlantContainer(plant.id, null)
    95|    onAction()
    96|  }
    97|
    98|  const handleLiftFromZone = async () => {
    99|    await updatePlantGroundZone(plant.id, null, plant.map_x, plant.map_y)
   100|    onAction()
   101|  }
   102|
   103|  return (
   104|    <>
   105|      {/* Backdrop */}
   106|      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
   107|
   108|      {/* Sheet */}
   109|      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[env(safe-area-inset-bottom)] animate-slide-up">
   110|        <button
   111|          onClick={onClose}
   112|          aria-label="Sluiten"
   113|          className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
   114|        >
   115|          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
   116|        </button>
   117|
   118|        <div className="px-5 pb-5">
   119|          {/* Header */}
   120|          <div className="flex items-start gap-3 mb-4">
   121|            {plant.photo_path ? (
   122|              <img src={plant.photo_path} alt={plant.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
   123|            ) : (
   124|              <div className="w-14 h-14 rounded-xl bg-bg flex items-center justify-center text-2xl shrink-0">
   125|                🌱
   126|              </div>
   127|            )}
   128|            <div className="flex-1 min-w-0">
   129|              <div className="flex items-baseline gap-2">
   130|                <h3 className="text-lg font-semibold text-text truncate">{plant.name}</h3>
   131|                <button
   132|                  onClick={() => { onClose(); navigate(`/plants/${plant.id}`) }}
   133|                  className="text-xs text-primary font-medium shrink-0 hover:underline"
   134|                >
   135|                  Meer info →
   136|                </button>
   137|              </div>
   138|              {plant.species && (
   139|                <p className="text-sm text-text-muted italic">{plant.species}</p>
   140|              )}
   141|
   142|            </div>
   143|            <div className="flex gap-1.5 shrink-0">
   144|              {onDuplicate && (
   145|                <button
   146|                  onClick={() => { onDuplicate(plant.id); onClose() }}
   147|                  className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center text-text-muted hover:text-text hover:bg-border transition-colors"
   148|                  title="Kopieer plant"
   149|                >
   150|                  ⎘
   151|                </button>
   152|              )}
   153|              <button
   154|                onClick={() => { onClose(); navigate(`/plants/${plant.id}/edit`) }}
   155|                className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
   156|                title="Bewerk plant"
   157|              >
   158|                ✏️
   159|              </button>
   160|              <button
   161|                onClick={handleToggleLock}
   162|                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
   163|                  locked
   164|                    ? 'bg-amber-500/20 text-amber-600'
   165|                    : 'bg-bg text-text-muted hover:text-amber-500 hover:bg-amber-500/10'
   166|                }`}
   167|                title={locked ? 'Ontgrendel plant' : 'Vergrendel plant'}
   168|              >
   169|                {locked ? '🔒' : '🔓'}
   170|              </button>
   171|              {onRemove && (
   172|                <button
   173|                  onClick={() => { onRemove(plant.id); onClose() }}
   174|                  className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center text-text-muted hover:text-overdue hover:bg-overdue/10 transition-colors"
   175|                  title="Verwijder plant"
   176|                >
   177|                  🗑
   178|                </button>
   179|              )}
   180|            </div>
   181|          </div>
   182|
   183|          {/* Care schedules */}
   184|          {detail?.care_schedules && detail.care_schedules.length > 0 ? (
   185|            <div className="flex flex-col gap-2 mb-4">
   186|              {detail.care_schedules.map(sched => {
   187|                const nextDue = new Date(sched.next_due)
   188|                const today = new Date()
   189|                today.setHours(0, 0, 0, 0)
   190|                const diffMs = nextDue.getTime() - today.getTime()
   191|                const daysUntil = Math.round(diffMs / 86400000)
   192|                const isOverdue = daysUntil < 0
   193|                const isDueToday = daysUntil === 0
   194|
   195|                const info = CARE_TYPE_INFO[sched.care_type as keyof typeof CARE_TYPE_INFO]
   196|                const labelMap: Record<string, string> = {
   197|                  water: 'Gieten', fertilize: 'Bemesten', prune: 'Snoeien', repot_check: 'Verpotten',
   198|                  mist: 'Sproeien', rotate: 'Draaien', protect_cold: 'Beschermen tegen kou', protect_heat: 'Beschermen tegen hitte',
   199|                }
   200|                const icon = info?.icon ?? '📋'
   201|                const label = labelMap[sched.care_type] ?? info?.label ?? sched.care_type
   202|
   203|                let statusText: string
   204|                let statusColor: string
   205|                if (isOverdue) {
   206|                  statusText = `${Math.abs(daysUntil)} dag${Math.abs(daysUntil) === 1 ? '' : 'en'} te laat`
   207|                  statusColor = 'var(--color-overdue)'
   208|                } else if (isDueToday) {
   209|                  statusText = 'vandaag'
   210|                  statusColor = 'var(--color-due)'
   211|                } else {
   212|                  statusText = `over ${daysUntil} dag${daysUntil === 1 ? '' : 'en'}`
   213|                  statusColor = 'var(--color-text-muted)'
   214|                }
   215|
   216|                return (
   217|                  <div
   218|                    key={sched.id}
   219|                    className="flex items-center gap-2.5 px-3 py-2 bg-bg rounded-xl border border-border-soft"
   220|                    style={{
   221|                      borderColor: isOverdue ? 'var(--color-overdue)' : undefined,
   222|                    }}
   223|                  >
   224|                    <span className="text-lg">{icon}</span>
   225|                    <span className="flex-1 text-text text-sm">
   226|                      {label}
   227|                    </span>
   228|                    <span className="font-mono text-xs" style={{ color: statusColor }}>
   229|                      {statusText}
   230|                    </span>
   231|                  </div>
   232|                )
   233|              })}
   234|            </div>
   235|          ) : (
   236|            // Fallback: show most_urgent if detail not yet loaded
   237|            plant.most_urgent && (
   238|              <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4 text-sm text-text-muted">
   239|                <span>💧</span>
   240|                <span>{plant.most_urgent.care_type} · {plant.most_urgent.days_overdue > 0 ? `${plant.most_urgent.days_overdue}d te laat` : 'vandaag'}</span>
   241|              </div>
   242|            )
   243|          )}
   244|
   245|          {/* Container info */}
   246|          {container && (
   247|            <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4">
   248|              <span className="text-sm text-text-muted flex-1">
   249|                In: <span className="text-text font-medium">{container.name}</span>
   250|              </span>
   251|              <button
   252|                onClick={handleRemoveFromContainer}
   253|                className="text-xs text-text-muted hover:text-overdue transition-colors"
   254|              >
   255|                Remove
   256|              </button>
   257|            </div>
   258|          )}
   259|
   260|          {/* Ground zone info */}
   261|          {groundZone && (
   262|            <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4">
   263|              <div className="flex-1 min-w-0">
   264|                <span className="text-sm text-text-muted">
   265|                  Geplant in: <span className="text-text font-medium">{groundZone.name}</span>
   266|                </span>
   267|                {groundZone.soil_note && (
   268|                  <p className="text-xs text-text-muted mt-0.5 italic">{groundZone.soil_note}</p>
   269|                )}
   270|              </div>
   271|              <button
   272|                onClick={handleLiftFromZone}
   273|                className="text-xs text-text-muted hover:text-overdue transition-colors shrink-0"
   274|              >
   275|                Verplaatsen
   276|              </button>
   277|            </div>
   278|          )}
   279|
   280|          {/* Sun-fit row */}
   281|          {sunFitInfo && (
   282|            <div className="flex items-center gap-2 bg-bg rounded-xl px-4 py-3 mb-4">
   283|              <span className="text-base">☀️</span>
   284|              <span className="text-sm text-text-muted flex-1">
   285|                Dit punt:{' '}
   286|                <span className="text-text font-medium">~{sunFitInfo.sunHours.toFixed(1)}u</span>
   287|                {' · '}{sunFitInfo.profile.labelNl}
   288|              </span>
   289|              <span
   290|                className="text-xs font-semibold px-2 py-0.5 rounded-full"
   291|                style={{
   292|                  background: SUN_FIT_COLORS[sunFitInfo.fit] + '22',
   293|                  color: SUN_FIT_COLORS[sunFitInfo.fit],
   294|                }}
   295|              >
   296|                {sunFitInfo.fit === 'good' ? '✓ Geschikt' : sunFitInfo.fit === 'partial' ? '~ Deels' : '⚠ Te weinig'}
   297|              </span>
   298|            </div>
   299|          )}
   300|
   301|          {/* Actions */}
   302|          <div className="flex gap-2 mt-4">
   303|            <button
   304|              onClick={handleWater}
   305|              className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
   306|            >
   307|              💧 Water
   308|            </button>
   309|            <button
   310|              onClick={handleFertilize}
   311|              className="flex-1 bg-emerald-green/15 text-emerald-green rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
   312|            >
   313|              🌿 Bemesten
   314|            </button>
   315|            <button
   316|              onClick={() => { onClose(); navigate(`/plants/${plant.id}/edit`) }}
   317|              className="flex-1 bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
   318|            >
   319|              ✏️ Bewerken
   320|            </button>
   321|          </div>
   322|        </div>
   323|      </div>
   324|    </>
   325|  )
   326|}
   327|
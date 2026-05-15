     1|import { useMemo, useEffect, useState } from 'react'
     2|import { useNavigate } from 'react-router-dom'
     3|import type { HeatmapCell } from '../../utils/heatmapCalc'
     4|import type { MapPlant } from '../../types'
     5|import { PLANT_SUN_PROFILES, getSunFit } from '../../utils/plantSunRequirements'
     6|import { LOCAL_PLANTS, type LocalPlant } from '../../data/plants-dataset'
     7|import { fetchGrowHereSuggestions, type GrowHereResponse, type AISuggestion } from '../../api/client'
     8|import { useFloreren } from '../../store/useFloreren'
     9|
    10|const MONTHS_NL = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
    11|
    12|// Module-level cache — survives sheet open/close within the session
    13|const _aiCache = new Map<string, GrowHereResponse>()
    14|
    15|function cacheKey(sunHours: number, month: number) {
    16|  return `${Math.round(sunHours * 10)}_${month}`
    17|}
    18|
    19|interface Props {
    20|  tappedCell: HeatmapCell
    21|  selectedMonth: number
    22|  mapPlants: MapPlant[]
    23|  mapId: number | null
    24|  onClose: () => void
    25|}
    26|
    27|function sunCategoryLabel(hours: number): { label: string; emoji: string } {
    28|  if (hours >= 6) return { label: 'Volle zon', emoji: '☀️' }
    29|  if (hours >= 3) return { label: 'Half zon', emoji: '⛅' }
    30|  return { label: 'Schaduw', emoji: '🌿' }
    31|}
    32|
    33|function sunReqId(hours: number): string {
    34|  if (hours >= 6) return 'full_sun'
    35|  if (hours >= 3) return 'partial_sun'
    36|  return 'shade'
    37|}
    38|
    39|const SUN_FIT_BADGE: Record<string, { label: string; className: string }> = {
    40|  perfect:    { label: 'Perfect',    className: 'bg-good/15 text-good' },
    41|  good:       { label: 'Goed',       className: 'bg-good/15 text-good' },
    42|  acceptable: { label: 'Acceptabel', className: 'bg-due/15 text-due' },
    43|}
    44|
    45|function AISuggestionCard({ s, onAdd, loading, disabled }: { s: AISuggestion; onAdd: () => void; loading?: boolean; disabled?: boolean }) {
    46|  const badge = SUN_FIT_BADGE[s.sunFit]
    47|  return (
    48|    <div className="card p-3 space-y-1.5">
    49|      <div className="flex items-start justify-between gap-2">
    50|        <div className="flex-1 min-w-0">
    51|          <div className="flex items-center gap-2 flex-wrap">
    52|            <p className="font-medium text-sm text-text">{s.dutchName || s.commonName}</p>
    53|            {badge && (
    54|              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.className}`}>
    55|                {badge.label}
    56|              </span>
    57|            )}
    58|          </div>
    59|          <p className="text-xs text-text-muted italic">{s.latinName}</p>
    60|        </div>
    61|        <button
    62|          onClick={onAdd}
    63|          disabled={disabled}
    64|          className="shrink-0 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
    65|        >
    66|          {loading ? '...' : '+ Voeg toe'}
    67|        </button>
    68|      </div>
    69|      <p className="text-xs text-text-muted leading-relaxed">{s.reasoning}</p>
    70|      {s.caveat && (
    71|        <p className="text-xs text-amber-400/80 leading-relaxed">⚠ {s.caveat}</p>
    72|      )}
    73|      {s.companionNote && (
    74|        <p className="text-xs text-text-muted/70 leading-relaxed">🌿 {s.companionNote}</p>
    75|      )}
    76|    </div>
    77|  )
    78|}
    79|
    80|function AISkeleton() {
    81|  return (
    82|    <div className="space-y-2">
    83|      {[0, 1, 2].map(i => (
    84|        <div key={i} className="card p-3 space-y-2">
    85|          <div className="flex justify-between gap-2">
    86|            <div className="space-y-1.5 flex-1">
    87|              <div className="skeleton h-4 w-2/5 rounded" />
    88|              <div className="skeleton h-3 w-1/3 rounded" />
    89|            </div>
    90|            <div className="skeleton h-7 w-20 rounded-xl" />
    91|          </div>
    92|          <div className="skeleton h-3 w-full rounded" />
    93|          <div className="skeleton h-3 w-4/5 rounded" />
    94|        </div>
    95|      ))}
    96|    </div>
    97|  )
    98|}
    99|
   100|export default function GrowHereSheet({ tappedCell, selectedMonth, mapPlants, mapId, onClose }: Props) {
   101|  const navigate = useNavigate()
   102|  const { addPlant } = useFloreren()
   103|  const { sunHours } = tappedCell
   104|  const { label: catLabel, emoji: catEmoji } = sunCategoryLabel(sunHours)
   105|  const spotReqId = sunReqId(sunHours)
   106|  const profile = PLANT_SUN_PROFILES.find(p => p.id === spotReqId)
   107|
   108|  // AI state
   109|  const [aiData, setAiData] = useState<GrowHereResponse | null>(() => _aiCache.get(cacheKey(sunHours, selectedMonth)) ?? null)
   110|  const [aiLoading, setAiLoading] = useState(!_aiCache.has(cacheKey(sunHours, selectedMonth)))
   111|  const [aiError, setAiError] = useState(false)
   112|
   113|  // Adding state — tracks which plant name is being added
   114|  const [addingName, setAddingName] = useState<string | null>(null)
   115|
   116|  // User's own map plants that fit this spot
   117|  const userMatches = useMemo(() =>
   118|    mapPlants.filter(p => {
   119|      if (!p.sun_requirement) return false
   120|      const fit = getSunFit(p.sun_requirement, sunHours)
   121|      return fit === 'good' || fit === 'partial'
   122|    }),
   123|    [mapPlants, sunHours]
   124|  )
   125|
   126|  // Species already in garden for deduplication
   127|  const userSpecies = useMemo(() =>
   128|    new Set(mapPlants.map(p => p.species?.toLowerCase()).filter(Boolean)),
   129|    [mapPlants]
   130|  )
   131|
   132|  // LOCAL_PLANTS that fit and aren't already in garden
   133|  const datasetMatches = useMemo((): LocalPlant[] =>
   134|    LOCAL_PLANTS
   135|      .filter(lp => {
   136|        if (userSpecies.has(lp.latinName.toLowerCase())) return false
   137|        const fit = getSunFit(lp.sunRequirement, sunHours)
   138|        return fit === 'good' || fit === 'partial'
   139|      })
   140|      .slice(0, 12),
   141|    [sunHours, userSpecies]
   142|  )
   143|
   144|  // Fetch AI suggestions on mount (unless already cached)
   145|  useEffect(() => {
   146|    const key = cacheKey(sunHours, selectedMonth)
   147|    if (_aiCache.has(key)) return
   148|
   149|    const existingPlantNames = mapPlants.map(p => p.species ?? p.name)
   150|
   151|    fetchGrowHereSuggestions(sunHours, selectedMonth, existingPlantNames)
   152|      .then(data => {
   153|        _aiCache.set(key, data)
   154|        setAiData(data)
   155|        setAiLoading(false)
   156|      })
   157|      .catch(() => {
   158|        setAiError(true)
   159|        setAiLoading(false)
   160|      })
   161|  }, [sunHours, selectedMonth, mapPlants])
   162|
   163|  async function handleAddToGarden(name: string, species: string, sunReq?: string) {
   164|    if (addingName) return
   165|    setAddingName(name)
   166|    try {
   167|      // Center of the tapped cell in SVG coordinates
   168|      const mapX = Math.round((tappedCell.x + tappedCell.w / 2) * 10) / 10
   169|      const mapY = Math.round((tappedCell.y + tappedCell.h / 2) * 10) / 10
   170|      const plant = await addPlant({
   171|        name,
   172|        species: species || undefined,
   173|        sun_requirement: sunReq ?? spotReqId,
   174|        map_id: mapId ?? undefined,
   175|        map_x: mapId != null ? mapX : undefined,
   176|        map_y: mapId != null ? mapY : undefined,
   177|        care_schedules: [{ care_type: 'water', interval_days: 3 }],
   178|      })
   179|      onClose()
   180|      navigate(`/plants/${plant.id}`)
   181|    } catch {
   182|      setAddingName(null)
   183|    }
   184|  }
   185|
   186|  return (
   187|    <div className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none">
   188|      {/* Backdrop */}
   189|      <div
   190|        className="absolute inset-0 bg-black/40 pointer-events-auto"
   191|        onClick={onClose}
   192|      />
   193|
   194|      {/* Sheet */}
   195|      <div className="relative pointer-events-auto bg-bg rounded-t-2xl border-t border-border max-h-[82vh] flex flex-col">
   196|        {/* Handle */}
   197|        <div className="flex justify-center pt-3 pb-1 shrink-0">
   198|          <div className="w-10 h-1 rounded-full bg-border" />
   199|        </div>
   200|
   201|        {/* Header */}
   202|        <div className="px-4 pb-3 border-b border-border shrink-0">
   203|          <div className="flex items-start justify-between">
   204|            <div className="flex-1 min-w-0 pr-2">
   205|              <p className="text-xs text-text-muted mb-0.5">
   206|                {MONTHS_NL[selectedMonth - 1]} · {catEmoji} {catLabel}
   207|              </p>
   208|              <h2 className="text-lg font-bold text-text">Wat kan hier groeien?</h2>
   209|              <p className="text-sm text-text-muted mt-0.5">
   210|                {aiData?.spotSummary ?? (
   211|                  <>
   212|                    Dit punt krijgt{' '}
   213|                    <span className="text-text font-medium">~{sunHours.toFixed(1)}u</span>{' '}
   214|                    directe zon
   215|                  </>
   216|                )}
   217|              </p>
   218|            </div>
   219|            <button
   220|              onClick={onClose}
   221|              className="text-text-muted hover:text-text transition-colors p-1 shrink-0"
   222|            >
   223|              ✕
   224|            </button>
   225|          </div>
   226|
   227|          {/* Sun bar */}
   228|          <div className="mt-3 flex items-center gap-2">
   229|            <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
   230|              <div
   231|                className="h-full rounded-full transition-all"
   232|                style={{
   233|                  width: `${Math.min(100, (sunHours / 10) * 100)}%`,
   234|                  backgroundColor: profile?.color ?? '#f0a020',
   235|                }}
   236|              />
   237|            </div>
   238|            <span className="text-xs text-text-muted shrink-0">{sunHours.toFixed(1)}u / dag</span>
   239|          </div>
   240|        </div>
   241|
   242|        {/* Scrollable body */}
   243|        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-5">
   244|
   245|          {/* User's own plants that fit */}
   246|          {userMatches.length > 0 && (
   247|            <section>
   248|              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
   249|                Al in uw tuin
   250|              </h3>
   251|              <div className="flex flex-wrap gap-2">
   252|                {userMatches.map(p => (
   253|                  <span
   254|                    key={p.id}
   255|                    className="px-3 py-1 rounded-full bg-surface border border-border text-sm text-text"
   256|                  >
   257|                    {p.name}
   258|                  </span>
   259|                ))}
   260|              </div>
   261|            </section>
   262|          )}
   263|
   264|          {/* Local dataset matches */}
   265|          {datasetMatches.length > 0 && (
   266|            <section>
   267|              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
   268|                Suggesties
   269|              </h3>
   270|              <div className="space-y-2">
   271|                {datasetMatches.map(lp => {
   272|                  const fit = getSunFit(lp.sunRequirement, sunHours)
   273|                  return (
   274|                    <div key={lp.id} className="card p-3 flex items-start justify-between gap-3">
   275|                      <div className="flex-1 min-w-0">
   276|                        <div className="flex items-center gap-2 flex-wrap">
   277|                          <p className="font-medium text-sm text-text">{lp.dutchName}</p>
   278|                          {fit === 'good' && (
   279|                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-good/15 text-good">Perfect</span>
   280|                          )}
   281|                          {fit === 'partial' && (
   282|                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-due/15 text-due">Acceptabel</span>
   283|                          )}
   284|                        </div>
   285|                        <p className="text-xs text-text-muted italic">{lp.latinName}</p>
   286|                        {lp.amsterdamNotes && (
   287|                          <p className="text-xs text-text-muted mt-1 leading-relaxed">{lp.amsterdamNotes}</p>
   288|                        )}
   289|                      </div>
   290|                      <button
   291|                        onClick={() => handleAddToGarden(lp.dutchName, lp.latinName, lp.sunRequirement)}
   292|                        disabled={!!addingName}
   293|                        className="shrink-0 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
   294|                      >
   295|                        {addingName === lp.dutchName ? '...' : '+ Voeg toe'}
   296|                      </button>
   297|                    </div>
   298|                  )
   299|                })}
   300|              </div>
   301|            </section>
   302|          )}
   303|
   304|          {/* AI suggestions */}
   305|          <section>
   306|            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
   307|              AI Suggesties
   308|            </h3>
   309|            {aiLoading && <AISkeleton />}
   310|            {!aiLoading && aiError && (
   311|              <p className="text-xs text-text-muted">Kon geen AI suggesties laden.</p>
   312|            )}
   313|            {!aiLoading && !aiError && aiData && (
   314|              <div className="space-y-2">
   315|                {aiData.suggestions.map((s, i) => (
   316|                  <AISuggestionCard
   317|                    key={i}
   318|                    s={s}
   319|                    onAdd={() => handleAddToGarden(s.dutchName || s.commonName, s.latinName)}
   320|                    loading={addingName === (s.dutchName || s.commonName)}
   321|                    disabled={!!addingName}
   322|                  />
   323|                ))}
   324|              </div>
   325|            )}
   326|          </section>
   327|
   328|        </div>
   329|      </div>
   330|    </div>
   331|  )
   332|}
   333|
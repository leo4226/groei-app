     1|import { useState, useMemo } from 'react'
     2|import { useNavigate, useLocation } from 'react-router-dom'
     3|import type { LocalPlant } from '../data/plants-dataset'
     4|
     5|const DUTCH_TYPE_TO_SYSTEM: Record<string, string> = {
     6|  vaste_plant: 'herb',
     7|  heester: 'shrub',
     8|  klimmer: 'climber',
     9|  gras: 'grass',
    10|  bol: 'bulb',
    11|  eenjarig: 'flower',
    12|  boom: 'tree',
    13|}
    14|import { useFloreren } from '../store/useFloreren'
    15|import { CARE_TYPE_INFO } from '../types'
    16|import { PLANT_SUN_PROFILES } from '../utils/plantSunRequirements'
    17|import type { CareType, CareScheduleInput } from '../types'
    18|import IconPicker from '../components/IconPicker'
    19|
    20|const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas', 'moestuin']
    21|const isTuinLoc = (name: string) => OUTDOOR_KEYWORDS.some(k => name.toLowerCase().includes(k))
    22|
    23|export default function AddPlant() {
    24|  const navigate = useNavigate()
    25|  const location = useLocation()
    26|  const prefill = location.state?.prefill as LocalPlant | { name: string } | undefined
    27|  const isFromDatabase = !!(prefill && 'latinName' in prefill)
    28|  const { locations, maps, addPlant, uploadPhoto } = useFloreren()
    29|
    30|  const [name, setName] = useState(
    31|    prefill
    32|      ? 'latinName' in prefill
    33|        ? prefill.dutchName
    34|        : prefill.name
    35|      : ''
    36|  )
    37|  const [species, setSpecies] = useState(
    38|    prefill && 'latinName' in prefill ? prefill.latinName : ''
    39|  )
    40|  const [locationId, setLocationId] = useState<number | undefined>()
    41|  const [potSize, setPotSize] = useState('')
    42|  const [acquiredDate, setAcquiredDate] = useState('')
    43|  const [notes, setNotes] = useState('')
    44|  const [sunRequirement, setSunRequirement] = useState<string | null>(
    45|    prefill && 'latinName' in prefill ? (prefill as LocalPlant).sunRequirement : null
    46|  )
    47|  const [iconKey, setIconKey] = useState<string | null>(null)
    48|  const [photoFile, setPhotoFile] = useState<File | null>(null)
    49|  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
    50|  const [submitting, setSubmitting] = useState(false)
    51|
    52|  const tuinLocs = useMemo(() => locations.filter(l => isTuinLoc(l.name)), [locations])
    53|  const huisLocs = useMemo(() => locations.filter(l => !isTuinLoc(l.name)), [locations])
    54|  const tuinMap = maps.find(m => ['garden', 'tuin'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
    55|  const huisMap = maps.find(m => ['huis', 'house', 'indoor'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
    56|
    57|  const currentArea: 'tuin' | 'huis' | null = locationId == null ? null
    58|    : locations.find(l => l.id === locationId && isTuinLoc(l.name)) ? 'tuin'
    59|    : locations.find(l => l.id === locationId) ? 'huis'
    60|    : null
    61|
    62|  const isOutdoor = currentArea === 'tuin'
    63|
    64|  function randomMapPos(viewbox: string) {
    65|    const [, , w, h] = viewbox.split(' ').map(Number)
    66|    const pad = Math.min(w, h) * 0.12
    67|    return {
    68|      x: Math.round((pad + Math.random() * (w - pad * 2)) * 10) / 10,
    69|      y: Math.round((pad + Math.random() * (h - pad * 2)) * 10) / 10,
    70|    }
    71|  }
    72|
    73|  function selectArea(area: 'tuin' | 'huis') {
    74|    if (currentArea === area) { setLocationId(undefined); return }
    75|    const pool = area === 'tuin' ? tuinLocs : huisLocs
    76|    if (pool.length > 0) setLocationId(pool[0].id)
    77|  }
    78|
    79|  const [schedules, setSchedules] = useState<Record<CareType, { enabled: boolean; days: number }>>(() => {
    80|    const initial: Record<string, { enabled: boolean; days: number }> = {}
    81|    for (const [type, info] of Object.entries(CARE_TYPE_INFO)) {
    82|      initial[type] = { enabled: type === 'water', days: info.defaultIndoor }
    83|    }
    84|    return initial as Record<CareType, { enabled: boolean; days: number }>
    85|  })
    86|
    87|  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    88|    const file = e.target.files?.[0]
    89|    if (file) {
    90|      setPhotoFile(file)
    91|      setPhotoPreview(URL.createObjectURL(file))
    92|    }
    93|  }
    94|
    95|  function toggleSchedule(type: CareType) {
    96|    setSchedules(prev => ({ ...prev, [type]: { ...prev[type], enabled: !prev[type].enabled } }))
    97|  }
    98|
    99|  function setScheduleDays(type: CareType, days: number) {
   100|    setSchedules(prev => ({ ...prev, [type]: { ...prev[type], days } }))
   101|  }
   102|
   103|  async function handleSubmit(e: React.FormEvent) {
   104|    e.preventDefault()
   105|    if (!name.trim()) return
   106|
   107|    setSubmitting(true)
   108|    try {
   109|      const careSchedules: CareScheduleInput[] = Object.entries(schedules)
   110|        .filter(([, s]) => s.enabled && s.days > 0)
   111|        .map(([type, s]) => ({ care_type: type as CareType, interval_days: s.days }))
   112|
   113|      // Auto-place on garden map at a random spot when Tuin is selected
   114|      const mapPos = currentArea === 'tuin' && tuinMap ? randomMapPos(tuinMap.viewbox) : undefined
   115|
   116|      const plant = await addPlant({
   117|        name: name.trim(),
   118|        species: species.trim() || undefined,
   119|        location_id: locationId,
   120|        map_id: currentArea === 'tuin' && tuinMap ? tuinMap.id : undefined,
   121|        map_x: mapPos?.x,
   122|        map_y: mapPos?.y,
   123|        pot_size_cm: potSize ? parseInt(potSize) : undefined,
   124|        acquired_date: acquiredDate || undefined,
   125|        notes: notes.trim() || undefined,
   126|        icon_key: iconKey ?? undefined,
   127|        plant_type: isFromDatabase ? (DUTCH_TYPE_TO_SYSTEM[(prefill as LocalPlant).type] ?? (prefill as LocalPlant).type) : undefined,
   128|        sun_requirement: sunRequirement ?? undefined,
   129|        care_schedules: careSchedules,
   130|      })
   131|
   132|      if (photoFile) {
   133|        await uploadPhoto(plant.id, photoFile)
   134|      }
   135|
   136|      navigate('/plants')
   137|    } catch {
   138|      // Error handled by store
   139|    } finally {
   140|      setSubmitting(false)
   141|    }
   142|  }
   143|
   144|  const inputClass = "w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
   145|
   146|  return (
   147|    <div className="px-4 pt-6 pb-8">
   148|      <div className="flex items-center gap-3 mb-6">
   149|        <button
   150|          onClick={() => navigate(-1)}
   151|          className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text"
   152|        >
   153|          ←
   154|        </button>
   155|        <h1 className="text-2xl font-extrabold">Plant toevoegen</h1>
   156|      </div>
   157|
   158|      <form onSubmit={handleSubmit} className="space-y-5">
   159|        {/* Photo */}
   160|        <label className="card p-4 flex items-center gap-4 cursor-pointer">
   161|          {photoPreview ? (
   162|            <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
   163|          ) : (
   164|            <div className="w-20 h-20 rounded-xl bg-bg border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted flex-shrink-0">
   165|              <span className="text-2xl">📷</span>
   166|              <span className="text-[10px] mt-0.5">Foto toevoegen</span>
   167|            </div>
   168|          )}
   169|          <div className="flex-1 min-w-0">
   170|            <p className="text-sm font-medium text-text">Plantfoto</p>
   171|            <p className="text-xs text-text-muted mt-0.5">Tik om foto toe te voegen</p>
   172|          </div>
   173|          <input
   174|            type="file"
   175|            accept="image/*"
   176|            onChange={handlePhotoChange}
   177|            className="hidden"
   178|          />
   179|        </label>
   180|
   181|        {/* Name */}
   182|        <div>
   183|          <label className="block text-sm font-medium text-text-muted mb-1.5">Naam *</label>
   184|          <input
   185|            type="text"
   186|            value={name}
   187|            onChange={(e) => setName(e.target.value)}
   188|            placeholder="Grote Monstera"
   189|            required
   190|            className={inputClass}
   191|          />
   192|        </div>
   193|
   194|        {/* Species */}
   195|        <div>
   196|          <label className="block text-sm font-medium text-text-muted mb-1.5">Botanische naam</label>
   197|          <input
   198|            type="text"
   199|            value={species}
   200|            onChange={(e) => setSpecies(e.target.value)}
   201|            placeholder="Monstera deliciosa"
   202|            className={inputClass}
   203|          />
   204|        </div>
   205|
   206|        {/* Icon */}
   207|        <div>
   208|          <label className="block text-sm font-medium text-text-muted mb-1.5">Icoon</label>
   209|          <IconPicker value={iconKey} onChange={setIconKey} />
   210|        </div>
   211|
   212|        {isFromDatabase && (
   213|          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 text-sm text-primary">
   214|            <span className="text-base">📋</span>
   215|            <span>Ingevuld uit plantendatabase — pas aan waar nodig</span>
   216|          </div>
   217|        )}
   218|
   219|        {/* Sun requirement */}
   220|        <div>
   221|          <label className="block text-sm font-medium text-text-muted mb-1.5">Zonbehoefte</label>
   222|          <div className="flex gap-2">
   223|            {PLANT_SUN_PROFILES.map((profile) => (
   224|              <button
   225|                key={profile.id}
   226|                type="button"
   227|                onClick={() => setSunRequirement(sunRequirement === profile.id ? null : profile.id)}
   228|                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-colors ${
   229|                  sunRequirement === profile.id
   230|                    ? 'border-transparent text-white'
   231|                    : 'border-border text-text-muted hover:border-text-muted'
   232|                }`}
   233|                style={sunRequirement === profile.id ? { backgroundColor: profile.color } : undefined}
   234|              >
   235|                <span className="text-lg">{profile.emoji}</span>
   236|                <span>{profile.labelNl}</span>
   237|              </button>
   238|            ))}
   239|          </div>
   240|        </div>
   241|
   242|        {/* Location */}
   243|        <div>
   244|          <label className="block text-sm font-medium text-text-muted mb-1.5">Locatie</label>
   245|          <div className="flex gap-3">
   246|            {([
   247|              { area: 'tuin' as const, label: 'Tuin', emoji: '🌿', hasMap: !!tuinMap },
   248|              { area: 'huis' as const, label: 'Huis', emoji: '🏠', hasMap: !!huisMap },
   249|            ]).map(({ area, label, emoji, hasMap }) => (
   250|              <button
   251|                key={area}
   252|                type="button"
   253|                onClick={() => selectArea(area)}
   254|                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
   255|                  currentArea === area
   256|                    ? 'border-primary bg-primary/10 text-primary'
   257|                    : 'border-border text-text-muted hover:border-text-muted'
   258|                }`}
   259|              >
   260|                <span className="text-2xl">{emoji}</span>
   261|                <span>{label}</span>
   262|                {!hasMap && (
   263|                  <span className="text-[10px] text-text-muted/60">kaart binnenkort</span>
   264|                )}
   265|              </button>
   266|            ))}
   267|          </div>
   268|        </div>
   269|
   270|        {/* Pot size & Acquired */}
   271|        <div className="grid grid-cols-2 gap-3">
   272|          <div>
   273|            <label className="block text-sm font-medium text-text-muted mb-1.5">Potmaat (cm)</label>
   274|            <input
   275|              type="number"
   276|              value={potSize}
   277|              onChange={(e) => setPotSize(e.target.value)}
   278|              placeholder="15"
   279|              className={inputClass}
   280|            />
   281|          </div>
   282|          <div>
   283|            <label className="block text-sm font-medium text-text-muted mb-1.5">Verkregen</label>
   284|            <input
   285|              type="date"
   286|              value={acquiredDate}
   287|              onChange={(e) => setAcquiredDate(e.target.value)}
   288|              className={inputClass}
   289|            />
   290|          </div>
   291|        </div>
   292|
   293|        {/* Notes */}
   294|        <div>
   295|          <label className="block text-sm font-medium text-text-muted mb-1.5">Notities</label>
   296|          <textarea
   297|            value={notes}
   298|            onChange={(e) => setNotes(e.target.value)}
   299|            placeholder="Houdt van indirect licht, van onderen water geven..."
   300|            rows={2}
   301|            className={`${inputClass} resize-none`}
   302|          />
   303|        </div>
   304|
   305|        {/* Care Schedules */}
   306|        <div>
   307|          <h2 className="text-lg font-bold mb-1">Verzorgingsschema</h2>
   308|          <p className="text-xs text-text-muted mb-3">Hoe vaak heeft deze plant verzorging nodig?</p>
   309|          <div className="space-y-2">
   310|            {(Object.entries(CARE_TYPE_INFO) as [CareType, typeof CARE_TYPE_INFO[CareType]][]).map(([type, info]) => {
   311|              const sched = schedules[type]
   312|              const defaultDays = isOutdoor ? info.defaultOutdoor : info.defaultIndoor
   313|              if (defaultDays === 0 && !sched.enabled) return null
   314|
   315|              return (
   316|                <div key={type} className={`card p-3 transition-all ${sched.enabled ? 'border-primary/20' : ''}`}>
   317|                  <div className="flex items-center justify-between">
   318|                    <label className="flex items-center gap-2.5 cursor-pointer">
   319|                      <input
   320|                        type="checkbox"
   321|                        checked={sched.enabled}
   322|                        onChange={() => toggleSchedule(type)}
   323|                        className="w-5 h-5 rounded accent-primary"
   324|                      />
   325|                      <span className="text-lg">{info.icon}</span>
   326|                      <span className="font-medium text-sm">{info.label}</span>
   327|                    </label>
   328|                    {sched.enabled && (
   329|                      <div className="flex items-center gap-1.5">
   330|                        <span className="text-xs text-text-muted">elke</span>
   331|                        <input
   332|                          type="number"
   333|                          min={1}
   334|                          value={sched.days}
   335|                          onChange={(e) => setScheduleDays(type, parseInt(e.target.value) || 1)}
   336|                          className="w-14 px-2 py-1 rounded-lg bg-bg border border-border text-center text-sm font-medium"
   337|                        />
   338|                        <span className="text-xs text-text-muted">dagen</span>
   339|                      </div>
   340|                    )}
   341|                  </div>
   342|                </div>
   343|              )
   344|            })}
   345|          </div>
   346|        </div>
   347|
   348|        <button
   349|          type="submit"
   350|          disabled={submitting || !name.trim()}
   351|          className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-lg active:scale-[0.98] transition-transform disabled:opacity-50 shadow-sm"
   352|        >
   353|          {submitting ? (
   354|            <span className="flex items-center justify-center gap-2">
   355|              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
   356|              Toevoegen...
   357|            </span>
   358|          ) : (
   359|            'Plant toevoegen 🌱'
   360|          )}
   361|        </button>
   362|      </form>
   363|    </div>
   364|  )
   365|}
   366|
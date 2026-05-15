     1|import { useState, useEffect, useMemo } from 'react'
     2|import { useParams, useNavigate } from 'react-router-dom'
     3|import { useFloreren } from '../store/useFloreren'
     4|import { fetchPlant } from '../api/client'
     5|import type { Plant } from '../types'
     6|import { PLANT_SUN_PROFILES } from '../utils/plantSunRequirements'
     7|import IconPicker from '../components/IconPicker'
     8|
     9|const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas', 'moestuin']
    10|const isTuinLoc = (name: string) => OUTDOOR_KEYWORDS.some(k => name.toLowerCase().includes(k))
    11|
    12|export default function EditPlant() {
    13|  const { id } = useParams<{ id: string }>()
    14|  const navigate = useNavigate()
    15|  const { locations, maps, updatePlant, uploadPhoto } = useFloreren()
    16|  const plantId = Number(id)
    17|
    18|  const [plant, setPlant] = useState<Plant | null>(null)
    19|  const [loading, setLoading] = useState(true)
    20|
    21|  const [name, setName] = useState('')
    22|  const [species, setSpecies] = useState('')
    23|  const [locationId, setLocationId] = useState<number | undefined>()
    24|  const [potSize, setPotSize] = useState('')
    25|  const [acquiredDate, setAcquiredDate] = useState('')
    26|  const [lastRepotted, setLastRepotted] = useState('')
    27|  const [notes, setNotes] = useState('')
    28|  const [sunRequirement, setSunRequirement] = useState<string | null>(null)
    29|  const [iconKey, setIconKey] = useState<string | null>(null)
    30|  const [photoFile, setPhotoFile] = useState<File | null>(null)
    31|  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
    32|  const [submitting, setSubmitting] = useState(false)
    33|
    34|  const tuinLocs = useMemo(() => locations.filter(l => isTuinLoc(l.name)), [locations])
    35|  const huisLocs = useMemo(() => locations.filter(l => !isTuinLoc(l.name)), [locations])
    36|  const tuinMap = maps.find(m => ['garden', 'tuin'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
    37|  const huisMap = maps.find(m => ['huis', 'house', 'indoor'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
    38|
    39|  const currentArea: 'tuin' | 'huis' | null = locationId == null ? null
    40|    : locations.find(l => l.id === locationId && isTuinLoc(l.name)) ? 'tuin'
    41|    : locations.find(l => l.id === locationId) ? 'huis'
    42|    : null
    43|
    44|  function selectArea(area: 'tuin' | 'huis') {
    45|    if (currentArea === area) { setLocationId(undefined); return }
    46|    const pool = area === 'tuin' ? tuinLocs : huisLocs
    47|    if (pool.length > 0) setLocationId(pool[0].id)
    48|  }
    49|
    50|  useEffect(() => {
    51|    async function load() {
    52|      try {
    53|        const p = await fetchPlant(plantId)
    54|        setPlant(p)
    55|        setName(p.name)
    56|        setSpecies(p.species ?? '')
    57|        setLocationId(p.location_id ?? undefined)
    58|        setPotSize(p.pot_size_cm ? String(p.pot_size_cm) : '')
    59|        setAcquiredDate(p.acquired_date ?? '')
    60|        setLastRepotted(p.last_repotted ?? '')
    61|        setNotes(p.notes ?? '')
    62|        setSunRequirement(p.sun_requirement ?? null)
    63|        setIconKey(p.icon_key ?? null)
    64|        if (p.photo_path) setPhotoPreview(p.photo_path)
    65|      } catch {
    66|        navigate('/plants')
    67|      } finally {
    68|        setLoading(false)
    69|      }
    70|    }
    71|    load()
    72|  }, [plantId, navigate])
    73|
    74|  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    75|    const file = e.target.files?.[0]
    76|    if (file) {
    77|      setPhotoFile(file)
    78|      setPhotoPreview(URL.createObjectURL(file))
    79|    }
    80|  }
    81|
    82|  async function handleSubmit(e: React.FormEvent) {
    83|    e.preventDefault()
    84|    if (!name.trim()) return
    85|
    86|    setSubmitting(true)
    87|    try {
    88|      await updatePlant(plantId, {
    89|        name: name.trim(),
    90|        species: species.trim() || null,
    91|        location_id: locationId ?? null,
    92|        pot_size_cm: potSize ? parseInt(potSize) : null,
    93|        acquired_date: acquiredDate || null,
    94|        last_repotted: lastRepotted || null,
    95|        notes: notes.trim() || null,
    96|        sun_requirement: sunRequirement ?? null,
    97|        icon_key: iconKey,
    98|      })
    99|
   100|      if (photoFile) {
   101|        await uploadPhoto(plantId, photoFile)
   102|      }
   103|
   104|      navigate(-1)
   105|    } catch {
   106|      // Error handled by store
   107|    } finally {
   108|      setSubmitting(false)
   109|    }
   110|  }
   111|
   112|  if (loading || !plant) {
   113|    return (
   114|      <div className="px-4 pt-6 space-y-4">
   115|        <div className="h-8 w-40 bg-surface rounded-lg animate-pulse" />
   116|        <div className="h-12 bg-surface rounded-xl animate-pulse" />
   117|        <div className="h-12 bg-surface rounded-xl animate-pulse" />
   118|        <div className="h-12 bg-surface rounded-xl animate-pulse" />
   119|      </div>
   120|    )
   121|  }
   122|
   123|  const inputClass = "w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
   124|
   125|  return (
   126|    <div className="px-4 pt-6 pb-8">
   127|      <div className="flex items-center gap-3 mb-6">
   128|        <button
   129|          onClick={() => navigate(-1)}
   130|          className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text"
   131|        >
   132|          ←
   133|        </button>
   134|        <h1 className="text-2xl font-extrabold">Plant bewerken</h1>
   135|      </div>
   136|
   137|      <form onSubmit={handleSubmit} className="space-y-5">
   138|        {/* Photo */}
   139|        <label className="card p-4 flex items-center gap-4 cursor-pointer">
   140|          {photoPreview ? (
   141|            <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
   142|          ) : (
   143|            <div className="w-20 h-20 rounded-xl bg-bg border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted flex-shrink-0">
   144|              <span className="text-2xl">📷</span>
   145|              <span className="text-[10px] mt-0.5">Foto toevoegen</span>
   146|            </div>
   147|          )}
   148|          <div className="flex-1 min-w-0">
   149|            <p className="text-sm font-medium text-text">Plantfoto</p>
   150|            <p className="text-xs text-text-muted mt-0.5">Tik om foto te wijzigen</p>
   151|          </div>
   152|          <input
   153|            type="file"
   154|            accept="image/*"
   155|            onChange={handlePhotoChange}
   156|            className="hidden"
   157|          />
   158|        </label>
   159|
   160|        {/* Name */}
   161|        <div>
   162|          <label className="block text-sm font-medium text-text-muted mb-1.5">Naam *</label>
   163|          <input
   164|            type="text"
   165|            value={name}
   166|            onChange={(e) => setName(e.target.value)}
   167|            required
   168|            className={inputClass}
   169|          />
   170|        </div>
   171|
   172|        {/* Species */}
   173|        <div>
   174|          <label className="block text-sm font-medium text-text-muted mb-1.5">Botanische naam</label>
   175|          <input
   176|            type="text"
   177|            value={species}
   178|            onChange={(e) => setSpecies(e.target.value)}
   179|            placeholder="Monstera deliciosa"
   180|            className={inputClass}
   181|          />
   182|        </div>
   183|
   184|        {/* Icon */}
   185|        <div>
   186|          <label className="block text-sm font-medium text-text-muted mb-1.5">Icoon</label>
   187|          <IconPicker value={iconKey} onChange={setIconKey} />
   188|        </div>
   189|
   190|        {/* Sun requirement */}
   191|        <div>
   192|          <label className="block text-sm font-medium text-text-muted mb-1.5">Zonbehoefte</label>
   193|          <div className="flex gap-2">
   194|            {PLANT_SUN_PROFILES.map((profile) => (
   195|              <button
   196|                key={profile.id}
   197|                type="button"
   198|                onClick={() => setSunRequirement(sunRequirement === profile.id ? null : profile.id)}
   199|                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-colors ${
   200|                  sunRequirement === profile.id
   201|                    ? 'border-transparent text-white'
   202|                    : 'border-border text-text-muted hover:border-text-muted'
   203|                }`}
   204|                style={sunRequirement === profile.id ? { backgroundColor: profile.color } : undefined}
   205|              >
   206|                <span className="text-lg">{profile.emoji}</span>
   207|                <span>{profile.labelNl}</span>
   208|              </button>
   209|            ))}
   210|          </div>
   211|        </div>
   212|
   213|        {/* Location */}
   214|        <div>
   215|          <label className="block text-sm font-medium text-text-muted mb-1.5">Locatie</label>
   216|          <div className="flex gap-3">
   217|            {([
   218|              { area: 'tuin' as const, label: 'Tuin', emoji: '🌿', hasMap: !!tuinMap },
   219|              { area: 'huis' as const, label: 'Huis', emoji: '🏠', hasMap: !!huisMap },
   220|            ]).map(({ area, label, emoji, hasMap }) => (
   221|              <button
   222|                key={area}
   223|                type="button"
   224|                onClick={() => selectArea(area)}
   225|                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
   226|                  currentArea === area
   227|                    ? 'border-primary bg-primary/10 text-primary'
   228|                    : 'border-border text-text-muted hover:border-text-muted'
   229|                }`}
   230|              >
   231|                <span className="text-2xl">{emoji}</span>
   232|                <span>{label}</span>
   233|                {!hasMap && (
   234|                  <span className="text-[10px] text-text-muted/60">kaart binnenkort</span>
   235|                )}
   236|              </button>
   237|            ))}
   238|          </div>
   239|        </div>
   240|
   241|        {/* Pot size & dates */}
   242|        <div className="grid grid-cols-2 gap-3">
   243|          <div>
   244|            <label className="block text-sm font-medium text-text-muted mb-1.5">Potmaat (cm)</label>
   245|            <input
   246|              type="number"
   247|              value={potSize}
   248|              onChange={(e) => setPotSize(e.target.value)}
   249|              placeholder="15"
   250|              className={inputClass}
   251|            />
   252|          </div>
   253|          <div>
   254|            <label className="block text-sm font-medium text-text-muted mb-1.5">Verkregen</label>
   255|            <input
   256|              type="date"
   257|              value={acquiredDate}
   258|              onChange={(e) => setAcquiredDate(e.target.value)}
   259|              className={inputClass}
   260|            />
   261|          </div>
   262|        </div>
   263|
   264|        <div>
   265|          <label className="block text-sm font-medium text-text-muted mb-1.5">Laatste verpot</label>
   266|          <input
   267|            type="date"
   268|            value={lastRepotted}
   269|            onChange={(e) => setLastRepotted(e.target.value)}
   270|            className={inputClass}
   271|          />
   272|        </div>
   273|
   274|        {/* Notes */}
   275|        <div>
   276|          <label className="block text-sm font-medium text-text-muted mb-1.5">Notities</label>
   277|          <textarea
   278|            value={notes}
   279|            onChange={(e) => setNotes(e.target.value)}
   280|            placeholder="Houdt van indirect licht, van onderen water geven..."
   281|            rows={2}
   282|            className={`${inputClass} resize-none`}
   283|          />
   284|        </div>
   285|
   286|        <button
   287|          type="submit"
   288|          disabled={submitting || !name.trim()}
   289|          className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-lg active:scale-[0.98] transition-transform disabled:opacity-50 shadow-sm"
   290|        >
   291|          {submitting ? (
   292|            <span className="flex items-center justify-center gap-2">
   293|              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
   294|              Opslaan...
   295|            </span>
   296|          ) : (
   297|            'Opslaan'
   298|          )}
   299|        </button>
   300|      </form>
   301|    </div>
   302|  )
   303|}
   304|
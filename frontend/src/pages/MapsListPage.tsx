     1|import { useState, useEffect } from 'react'
     2|import { useNavigate } from 'react-router-dom'
     3|import { useFloreren } from '../store/useFloreren'
     4|import { useT } from '../context/LanguageContext'
     5|import type { MapInfo } from '../types'
     6|
     7|function MapThumbnail({ map }: { map: MapInfo }) {
     8|  const isOutdoor = map.map_type === 'outdoor' || map.map_type === 'garden'
     9|  const baseColor = isOutdoor ? '#7A9E5A' : '#E8E0D0'
    10|  const accentColor = isOutdoor ? '#C8A96A' : '#C8A060'
    11|
    12|  if (map.thumbnail_file) {
    13|    return (
    14|      <div className="bg-[#f5f3ef] rounded-xl h-44 flex items-center justify-center overflow-hidden mb-3">
    15|        <img
    16|          src={`/maps/${map.thumbnail_file}`}
    17|          alt={map.name}
    18|          className="w-full h-full object-contain"
    19|        />
    20|      </div>
    21|    )
    22|  }
    23|
    24|  return (
    25|    <div className="bg-[#f5f3ef] rounded-xl h-44 flex items-center justify-center overflow-hidden mb-3">
    26|      <svg viewBox="0 0 120 80" width="150" height="120">
    27|        <rect x="0" y="0" width="120" height="80" fill={baseColor} opacity="0.08" />
    28|        <rect x="10" y="8" width="100" height="64" rx="4" fill={baseColor} opacity="0.25" />
    29|        <rect x="20" y="18" width="38" height="22" rx="3" fill={accentColor} opacity="0.45" />
    30|        <rect x="62" y="18" width="38" height="22" rx="3" fill={accentColor} opacity="0.35" />
    31|        <rect x="20" y="46" width="38" height="20" rx="3" fill={accentColor} opacity="0.3" />
    32|        <rect x="62" y="46" width="38" height="20" rx="3" fill={accentColor} opacity="0.4" />
    33|        <line x1="10" y1="8" x2="110" y2="72" stroke={baseColor} strokeWidth="0.4" opacity="0.15" />
    34|        <line x1="110" y1="8" x2="10" y2="72" stroke={baseColor} strokeWidth="0.4" opacity="0.15" />
    35|      </svg>
    36|    </div>
    37|  )
    38|}
    39|
    40|export default function MapsListPage() {
    41|  const t = useT()
    42|  const maps = useFloreren(s => s.maps)
    43|  const isLoading = useFloreren(s => s.isLoading)
    44|  const loadMaps = useFloreren(s => s.loadMaps)
    45|  const createMap = useFloreren(s => s.createMap)
    46|  const deleteMap = useFloreren(s => s.deleteMap)
    47|  const [showCreate, setShowCreate] = useState(false)
    48|  const [newName, setNewName] = useState('')
    49|  const [newMapType, setNewMapType] = useState<'outdoor' | 'indoor'>('outdoor')
    50|  const [creating, setCreating] = useState(false)
    51|  const [error, setError] = useState<string | null>(null)
    52|  const navigate = useNavigate()
    53|
    54|  useEffect(() => { loadMaps() }, [loadMaps])
    55|
    56|  async function handleCreate() {
    57|    if (!newName.trim() || creating) return
    58|    setCreating(true)
    59|    setError(null)
    60|    try {
    61|      const map = await createMap({ name: newName.trim(), map_type: newMapType })
    62|      setShowCreate(false)
    63|      setNewName('')
    64|      navigate(`/maps/${map.id}/edit-layout`)
    65|    } catch (e) {
    66|      setError(e instanceof Error ? e.message : t.maps.failedCreate)
    67|    } finally {
    68|      setCreating(false)
    69|    }
    70|  }
    71|
    72|  async function handleDelete(map: MapInfo) {
    73|    if (!confirm(`Delete "${map.name}"?`)) return
    74|    setError(null)
    75|    try {
    76|      await deleteMap(map.id)
    77|    } catch (e) {
    78|      setError(e instanceof Error ? e.message : t.maps.failedDelete)
    79|    }
    80|  }
    81|
    82|  if (isLoading) {
    83|    return <div className="p-6 text-text-muted text-center">{t.maps.loading}</div>
    84|  }
    85|
    86|  return (
    87|    <div className="p-4 max-w-lg mx-auto">
    88|      {error && (
    89|        <div className="bg-overdue/10 text-overdue text-sm px-3 py-2 rounded-lg mb-3 flex justify-between items-center">
    90|          <span>{error}</span>
    91|          <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
    92|        </div>
    93|      )}
    94|
    95|      <div className="flex items-center justify-between mb-4">
    96|        <h1 className="text-xl font-bold text-text">{t.maps.title}</h1>
    97|        <button
    98|          onClick={() => setShowCreate(true)}
    99|          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
   100|        >
   101|          {t.maps.newMap}
   102|        </button>
   103|      </div>
   104|
   105|      {showCreate && (
   106|        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
   107|          <label className="text-sm text-text-muted block mb-1">{t.maps.mapNameLabel}</label>
   108|          <input
   109|            autoFocus
   110|            value={newName}
   111|            onChange={(e) => setNewName(e.target.value)}
   112|            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
   113|            placeholder={t.maps.mapNamePlaceholder}
   114|            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg text-text mb-3"
   115|          />
   116|          <label className="text-sm text-text-muted block mb-1">Type</label>
   117|          <div className="flex gap-2 mb-3">
   118|            {(['outdoor', 'indoor'] as const).map(mapType => (
   119|              <button
   120|                key={mapType}
   121|                onClick={() => setNewMapType(mapType)}
   122|                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
   123|                  newMapType === mapType
   124|                    ? 'bg-primary text-white border-primary'
   125|                    : 'bg-bg text-text-muted border-border'
   126|                }`}
   127|              >
   128|                {mapType === 'outdoor' ? t.maps.outdoor : t.maps.indoor}
   129|              </button>
   130|            ))}
   131|          </div>
   132|          <div className="flex gap-2">
   133|            <button
   134|              onClick={handleCreate}
   135|              disabled={!newName.trim() || creating}
   136|              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
   137|            >
   138|              {creating ? 'Creating...' : 'Create'}
   139|            </button>
   140|            <button
   141|              onClick={() => { setShowCreate(false); setNewName(''); setNewMapType('outdoor') }}
   142|              className="text-text-muted px-4 py-2 text-sm"
   143|            >
   144|              {t.common.cancel}
   145|            </button>
   146|          </div>
   147|        </div>
   148|      )}
   149|
   150|      <div className="space-y-3">
   151|        {maps.map((map) => (
   152|          <div key={map.id} className="bg-surface border border-border rounded-xl p-4">
   153|            <MapThumbnail map={map} />
   154|            <div className="flex items-center justify-between mb-3">
   155|              <div className="flex items-center gap-2">
   156|                <h2 className="font-semibold text-text">{map.name}</h2>
   157|                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${map.map_type === 'indoor' ? 'bg-sky-blue/10 text-sky-blue' : 'bg-emerald-green/10 text-emerald-green'}`}>
   158|                  {map.map_type === 'indoor' ? t.maps.indoor : t.maps.outdoor}
   159|                </span>
   160|              </div>
   161|              <div className="flex items-center gap-1">
   162|                <button
   163|                  onClick={() => navigate(`/maps/${map.id}/settings`)}
   164|                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-bg hover:text-text transition-colors"
   165|                  title="Instellingen"
   166|                >
   167|                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
   168|                    <circle cx="12" cy="12" r="3" />
   169|                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
   170|                  </svg>
   171|                </button>
   172|                <button
   173|                  onClick={() => handleDelete(map)}
   174|                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-overdue transition-colors"
   175|                  title="Verwijderen"
   176|                >
   177|                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
   178|                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
   179|                  </svg>
   180|                </button>
   181|              </div>
   182|            </div>
   183|            <div className="flex gap-2">
   184|              <button
   185|                onClick={() => navigate(`/map/${map.slug}`)}
   186|                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text font-medium"
   187|              >
   188|                View
   189|              </button>
   190|              {map.canvas_data ? (
   191|                <button
   192|                  onClick={() => navigate(`/maps/${map.id}/edit-layout`)}
   193|                  className="flex-1 border border-primary/30 bg-primary/5 rounded-lg px-3 py-2 text-sm text-primary font-medium"
   194|                >
   195|                  Edit layout
   196|                </button>
   197|              ) : (
   198|                <div className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text-muted text-center opacity-50">
   199|                  SVG import
   200|                </div>
   201|              )}
   202|            </div>
   203|          </div>
   204|        ))}
   205|      </div>
   206|    </div>
   207|  )
   208|}
   209|
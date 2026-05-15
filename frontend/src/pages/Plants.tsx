     1|import { useState, useEffect, useMemo } from 'react'
     2|import { Link, useSearchParams, useNavigate } from 'react-router-dom'
     3|import { useFloreren } from '../store/useFloreren'
     4|import { PLANT_ICONS } from '../constants/plantIcons'
     5|import { useCategoryLabels, useTypeLabels, useFormLabels } from '../constants/plantLabels'
     6|import type { Plant, PlantIcon } from '../types'
     7|import { fetchAlertSummary, fetchIconCatalog } from '../api/client'
     8|import { getHaloStatus, HALO_COLORS } from '../hooks/usePlantStatus'
     9|
    10|
    11|const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas']
    12|const isTuin = (plant: Plant) =>
    13|  OUTDOOR_KEYWORDS.some(k => plant.location_name?.toLowerCase().includes(k))
    14|
    15|const TYPE_BG: Record<string, string> = {
    16|  tree:       '#160572',
    17|  shrub:      '#2544a0',
    18|  grass:      '#24e34c',
    19|  herb:       '#24e3dc',
    20|  flower:     '#d98199',
    21|  bulb:       '#d64e2e',
    22|  succulent:  '#e29675',
    23|  fern:       '#4b0f4d',
    24|  edible:     '#ff7701',
    25|  houseplant: '#160572',
    26|  cactus:     '#f9e44d',
    27|  climber:    '#2544a0',
    28|  unknown:    '#909090',
    29|}
    30|
    31|export default function Plants() {
    32|  const CATEGORY_LABELS = useCategoryLabels()
    33|  const PLANT_TYPE_LABELS = useTypeLabels()
    34|  const FORM_LABELS = useFormLabels()
    35|  const { plants, isLoading, setShowPlantPicker } = useFloreren()
    36|  const [filterArea, setFilterArea] = useState<'all' | 'tuin' | 'huis'>('all')
    37|  const [filterType, setFilterType] = useState<string>('all')
    38|  const [filterForm, setFilterForm] = useState<string>('all')
    39|  const [query, setQuery] = useState('')
    40|  const [searchParams] = useSearchParams()
    41|  const navigate = useNavigate()
    42|  const alertsOnly = searchParams.get('alerts') === '1'
    43|  const [alertPlantIds, setAlertPlantIds] = useState<number[] | null>(null)
    44|  const [iconCatalog, setIconCatalog] = useState<PlantIcon[]>([])
    45|
    46|  useEffect(() => {
    47|    fetchIconCatalog().then(setIconCatalog).catch(() => {})
    48|  }, [])
    49|
    50|  useEffect(() => {
    51|    if (alertsOnly) {
    52|      fetchAlertSummary()
    53|        .then(s => setAlertPlantIds(s.plant_ids_with_alerts))
    54|        .catch(() => setAlertPlantIds([]))
    55|    } else {
    56|      setAlertPlantIds(null)
    57|    }
    58|  }, [alertsOnly])
    59|
    60|  // Build icon_key -> PlantIcon lookup for form + family data
    61|  const iconMap = useMemo(() => {
    62|    const m = new Map<string, PlantIcon>()
    63|    iconCatalog.forEach(icon => m.set(icon.id, icon))
    64|    return m
    65|  }, [iconCatalog])
    66|
    67|  const tuinCount = plants.filter(isTuin).length
    68|  const huisCount = plants.filter(p => !isTuin(p)).length
    69|
    70|  // Compute available plant types from current plants
    71|  const typeCounts = useMemo(() => {
    72|    const counts: Record<string, number> = {}
    73|    plants.forEach(p => {
    74|      const t = p.plant_type || 'unknown'
    75|      counts[t] = (counts[t] || 0) + 1
    76|    })
    77|    counts.all = plants.length
    78|    return counts
    79|  }, [plants])
    80|
    81|  // Compute form counts from icon catalog
    82|  const formCounts = useMemo(() => {
    83|    const counts: Record<string, number> = {}
    84|    plants.forEach(p => {
    85|      if (!p.icon_key) return
    86|      const icon = iconMap.get(p.icon_key)
    87|      const form = icon?.form || 'other'
    88|      counts[form] = (counts[form] || 0) + 1
    89|    })
    90|    counts.all = plants.length
    91|    return counts
    92|  }, [plants, iconMap])
    93|
    94|  // Build filtered list
    95|  const filtered = plants.filter((p) => {
    96|    if (alertsOnly && alertPlantIds !== null && !alertPlantIds.includes(p.id)) return false
    97|    if (filterArea === 'tuin' && !isTuin(p)) return false
    98|    if (filterArea === 'huis' && isTuin(p)) return false
    99|    if (filterType !== 'all' && (p.plant_type || 'unknown') !== filterType) return false
   100|    if (filterForm !== 'all') {
   101|      const icon = p.icon_key ? iconMap.get(p.icon_key) : null
   102|      const form = icon?.form || 'other'
   103|      if (form !== filterForm) return false
   104|    }
   105|    if (query) {
   106|      const q = query.toLowerCase()
   107|      return (
   108|        p.name.toLowerCase().includes(q) ||
   109|        (p.species?.toLowerCase().includes(q) ?? false)
   110|      )
   111|    }
   112|    return true
   113|  })
   114|
   115|  // Keyboard shortcut: Ctrl/Cmd+K focuses search
   116|  useEffect(() => {
   117|    const handler = (e: KeyboardEvent) => {
   118|      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
   119|        e.preventDefault()
   120|        const input = document.querySelector<HTMLInputElement>('#plant-search')
   121|        input?.focus()
   122|        input?.select()
   123|      }
   124|    }
   125|    window.addEventListener('keydown', handler)
   126|    return () => window.removeEventListener('keydown', handler)
   127|  }, [])
   128|
   129|  const categoryCount = new Set(plants.map(p => p.plant_type).filter(Boolean)).size
   130|
   131|  return (
   132|    <div style={{ paddingBottom: 80 }}>
   133|      {/* Header */}
   134|      <header className="plants-header" style={{
   135|        padding: '40px 24px 20px',
   136|        borderBottom: '1px solid var(--color-border)',
   137|        display: 'flex',
   138|        justifyContent: 'space-between',
   139|        alignItems: 'flex-end',
   140|        flexWrap: 'wrap',
   141|        gap: 20,
   142|      }}>
   143|        <div>
   144|          <p style={{
   145|            fontFamily: 'var(--font-mono)',
   146|            fontSize: 10,
   147|            letterSpacing: '0.2em',
   148|            textTransform: 'uppercase',
   149|            color: 'var(--color-text-muted)',
   150|            margin: '0 0 8px 0',
   151|            display: 'flex',
   152|            alignItems: 'center',
   153|            gap: 12,
   154|          }}>
   155|            <span style={{ width: 24, height: 1, background: 'var(--color-border)', flex: 'none' }} />
   156|            Mijn Tuin · Est. 2026
   157|            <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
   158|          </p>
   159|          <h1 style={{
   160|            fontFamily: 'var(--font-heading)',
   161|            fontWeight: 500,
   162|            fontSize: 'clamp(36px, 5vw, 56px)',
   163|            lineHeight: 0.95,
   164|            letterSpacing: '-0.02em',
   165|            color: 'var(--color-text)',
   166|            margin: 0,
   167|          }}>
   168|            Planten <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>Icons</em>.
   169|          </h1>
   170|          <p style={{
   171|            fontFamily: 'var(--font-heading)',
   172|            fontStyle: 'italic',
   173|            fontSize: 15,
   174|            lineHeight: 1.5,
   175|            color: 'var(--color-text-soft)',
   176|            maxWidth: 440,
   177|            margin: '8px 0 0 0',
   178|          }}>
   179|            Een botanische gids voor je plantencollectie — binnen en buiten.
   180|          </p>
   181|        </div>
   182|        <div style={{ display: 'flex', gap: 28 }}>
   183|          <div style={{ textAlign: 'right' }}>
   184|            <span style={{
   185|              fontFamily: 'var(--font-heading)',
   186|              fontSize: 34,
   187|              fontWeight: 500,
   188|              lineHeight: 1,
   189|              color: 'var(--color-primary)',
   190|              display: 'block',
   191|            }}>{plants.length}</span>
   192|            <span style={{
   193|              fontFamily: 'var(--font-mono)',
   194|              fontSize: 9,
   195|              textTransform: 'uppercase',
   196|              letterSpacing: '0.15em',
   197|              color: 'var(--color-text-muted)',
   198|              marginTop: 4,
   199|            }}>Planten</span>
   200|          </div>
   201|          <div style={{ textAlign: 'right' }}>
   202|            <span style={{
   203|              fontFamily: 'var(--font-heading)',
   204|              fontSize: 34,
   205|              fontWeight: 500,
   206|              lineHeight: 1,
   207|              color: 'var(--color-primary)',
   208|              display: 'block',
   209|            }}>{categoryCount}</span>
   210|            <span style={{
   211|              fontFamily: 'var(--font-mono)',
   212|              fontSize: 9,
   213|              textTransform: 'uppercase',
   214|              letterSpacing: '0.15em',
   215|              color: 'var(--color-text-muted)',
   216|              marginTop: 4,
   217|            }}>Categorieen</span>
   218|          </div>
   219|        </div>
   220|      </header>
   221|
   222|      {/* Search bar */}
   223|      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 16, alignItems: 'center' }}>
   224|        <div style={{ flex: 1, position: 'relative' }}>
   225|          <svg
   226|            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
   227|            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
   228|          >
   229|            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
   230|          </svg>
   231|          <input
   232|            id="plant-search"
   233|            type="text"
   234|            value={query}
   235|            onChange={e => setQuery(e.target.value)}
   236|            placeholder="Zoek op naam of soort…"
   237|            style={{
   238|              width: '100%',
   239|              padding: '13px 50px 13px 42px',
   240|              borderRadius: 100,
   241|              border: '1px solid var(--color-border)',
   242|              background: 'var(--color-surface)',
   243|              color: 'var(--color-text)',
   244|              fontSize: 15,
   245|              fontFamily: 'var(--font-heading)',
   246|              boxShadow: '0 1px 2px rgba(31,42,30,0.04)',
   247|              boxSizing: 'border-box',
   248|              outline: 'none',
   249|            }}
   250|            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(47,93,58,0.12), 0 1px 2px rgba(31,42,30,0.04)'; }}
   251|            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(31,42,30,0.04)'; }}
   252|          />
   253|          <span style={{
   254|            position: 'absolute',
   255|            right: 12,
   256|            top: '50%',
   257|            transform: 'translateY(-50%)',
   258|            fontFamily: 'var(--font-mono)',
   259|            fontSize: 9,
   260|            color: 'var(--color-text-muted)',
   261|            background: 'var(--color-bg-warm)',
   262|            padding: '3px 7px',
   263|            borderRadius: 5,
   264|            border: '1px solid var(--color-border)',
   265|            pointerEvents: 'none',
   266|          }}>
   267|            {typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
   268|          </span>
   269|        </div>
   270|        <button
   271|          onClick={() => setShowPlantPicker(true)}
   272|          style={{
   273|            fontFamily: 'var(--font-body)',
   274|            fontSize: 13,
   275|            fontWeight: 500,
   276|            color: 'var(--color-primary)',
   277|            textDecoration: 'none',
   278|            padding: '10px 16px',
   279|            border: '1px solid var(--color-primary)',
   280|            borderRadius: 100,
   281|            whiteSpace: 'nowrap',
   282|            transition: 'all 0.15s',
   283|            flexShrink: 0,
   284|            background: 'transparent',
   285|            cursor: 'pointer',
   286|          }}
   287|          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-surface)'; }}
   288|          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-primary)'; }}
   289|        >
   290|          + Toevoegen
   291|        </button>
   292|      </div>
   293|
   294|      {/* Filter row 1: Locatie */}
   295|      <div style={{ padding: '14px 24px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
   296|        <span style={{
   297|          fontFamily: 'var(--font-mono)',
   298|          fontSize: 9,
   299|          textTransform: 'uppercase',
   300|          letterSpacing: '0.2em',
   301|          color: 'var(--color-text-muted)',
   302|          flexShrink: 0,
   303|          minWidth: 48,
   304|        }}>Locatie</span>
   305|        <FilterChip label="Alle" count={plants.length} active={filterArea === 'all'} onClick={() => setFilterArea('all')} />
   306|        <FilterChip label="🏠 Huis" count={huisCount} active={filterArea === 'huis'} onClick={() => setFilterArea('huis')} />
   307|        <FilterChip label="🌿 Tuin" count={tuinCount} active={filterArea === 'tuin'} onClick={() => setFilterArea('tuin')} />
   308|      </div>
   309|
   310|      {/* Filter row 2: Plant type */}
   311|      <div style={{ padding: '6px 24px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
   312|        <span style={{
   313|          fontFamily: 'var(--font-mono)',
   314|          fontSize: 9,
   315|          textTransform: 'uppercase',
   316|          letterSpacing: '0.2em',
   317|          color: 'var(--color-text-muted)',
   318|          flexShrink: 0,
   319|          minWidth: 48,
   320|        }}>Type</span>
   321|        <FilterChip label="Alle" count={typeCounts.all} active={filterType === 'all'} onClick={() => setFilterType('all')} />
   322|        {Object.entries(PLANT_TYPE_LABELS).map(([key, label]) => {
   323|          const count = typeCounts[key] || 0
   324|          if (count === 0) return null
   325|          return (
   326|            <FilterChip
   327|              key={key}
   328|              label={label}
   329|              count={count}
   330|              active={filterType === key}
   331|              onClick={() => setFilterType(filterType === key ? 'all' : key)}
   332|            />
   333|          )
   334|        })}
   335|      </div>
   336|
   337|      {/* Filter row 3: Form */}
   338|      <div style={{ padding: '6px 24px 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
   339|        <span style={{
   340|          fontFamily: 'var(--font-mono)',
   341|          fontSize: 9,
   342|          textTransform: 'uppercase',
   343|          letterSpacing: '0.2em',
   344|          color: 'var(--color-text-muted)',
   345|          flexShrink: 0,
   346|          minWidth: 48,
   347|        }}>Vorm</span>
   348|        {Object.entries(FORM_LABELS).map(([key, label]) => {
   349|          const count = formCounts[key] || 0
   350|          const disabled = count === 0 && key !== 'all'
   351|          return (
   352|            <FilterChip
   353|              key={key}
   354|              label={label}
   355|              count={count}
   356|              active={filterForm === key}
   357|              onClick={() => setFilterForm(filterForm === key ? 'all' : key)}
   358|              disabled={disabled}
   359|              variant="terra"
   360|            />
   361|          )
   362|        })}
   363|      </div>
   364|
   365|      <div style={{ padding: '0 24px' }}>
   366|        {/* Alert filter banner */}
   367|        {alertsOnly && (
   368|          <div style={{
   369|            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
   370|            padding: '8px 12px', marginBottom: 12, marginTop: 12,
   371|            background: '#fffac2', borderRadius: 10, border: '1px solid var(--color-due)',
   372|          }}>
   373|            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
   374|              ⚠️ Planten met weeralerts
   375|            </p>
   376|            <button
   377|              onClick={() => navigate('/plants')}
   378|              style={{
   379|                fontSize: 12, color: 'var(--color-text)', background: 'none',
   380|                border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
   381|              }}
   382|            >
   383|              Alles tonen
   384|            </button>
   385|          </div>
   386|        )}
   387|
   388|        {/* Results bar */}
   389|        {!isLoading && (
   390|          <div style={{
   391|            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
   392|            padding: '16px 0 18px',
   393|            borderBottom: '1px solid var(--color-border)',
   394|            marginBottom: 18,
   395|          }}>
   396|            <p style={{
   397|              margin: 0,
   398|              fontFamily: 'var(--font-heading)',
   399|              fontStyle: 'italic',
   400|              fontSize: 15,
   401|              color: 'var(--color-text-soft)',
   402|            }}>
   403|              {query ? (
   404|                <>Gevonden: <strong style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--color-text)' }}>{filtered.length}</strong></>
   405|              ) : (
   406|                <>Toon <strong style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--color-text)' }}>alle {filtered.length}</strong> planten</>
   407|              )}
   408|            </p>
   409|            <span style={{
   410|              fontFamily: 'var(--font-mono)',
   411|              fontSize: 10,
   412|              textTransform: 'uppercase',
   413|              letterSpacing: '0.2em',
   414|              color: 'var(--color-text-muted)',
   415|            }}>
   416|              {query
   417|                ? '§ Zoekresultaten'
   418|                : filterArea === 'tuin' ? '§ De Tuin'
   419|                : filterArea === 'huis' ? '§ Huis'
   420|                : filterType !== 'all' ? `§ ${PLANT_TYPE_LABELS[filterType] || filterType}`
   421|                : '§ De Collectie'
   422|              }
   423|            </span>
   424|          </div>
   425|        )}
   426|
   427|        {/* Loading skeleton */}
   428|        {isLoading && (
   429|          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
   430|            {[1, 2, 3, 4].map((i) => (
   431|              <div key={i} className="card" style={{ borderRadius: 14 }}>
   432|                <div className="skeleton" style={{ aspectRatio: '1', borderRadius: '12px 12px 0 0' }} />
   433|                <div style={{ padding: '12px 14px 14px' }}>
   434|                  <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 6 }} />
   435|                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
   436|                </div>
   437|              </div>
   438|            ))}
   439|          </div>
   440|        )}
   441|
   442|        {/* Empty state */}
   443|        {!isLoading && filtered.length === 0 && (
   444|          <div style={{ textAlign: 'center', padding: '80px 20px', gridColumn: '1 / -1' }}>
   445|            <p style={{
   446|              fontFamily: 'var(--font-heading)',
   447|              fontStyle: 'italic',
   448|              fontSize: 16,
   449|              color: 'var(--color-text-soft)',
   450|              margin: '0 0 6px',
   451|            }}>
   452|              {query ? 'Niets gevonden in deze hoek van de tuin.' : 'Nog geen planten in deze collectie.'}
   453|            </p>
   454|            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
   455|              {query ? 'Probeer een andere zoekopdracht' : 'Voeg je eerste plant toe via + Toevoegen'}
   456|            </p>
   457|          </div>
   458|        )}
   459|
   460|        {/* Plant grid */}
   461|        {!isLoading && filtered.length > 0 && (
   462|          <div className="plants-grid" style={{
   463|            display: 'grid',
   464|            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
   465|            gap: 16,
   466|          }}>
   467|            {filtered.map((plant) => (
   468|              <PlantCard key={plant.id} plant={plant} iconMap={iconMap} index={plants.indexOf(plant) + 1} />
   469|            ))}
   470|          </div>
   471|        )}
   472|      </div>
   473|    </div>
   474|  )
   475|}
   476|
   477|function FilterChip({
   478|  active,
   479|  onClick,
   480|  children,
   481|  label,
   482|  count,
   483|  disabled,
   484|  variant,
   485|}: {
   486|  active?: boolean
   487|  onClick?: () => void
   488|  children?: React.ReactNode
   489|  label?: string
   490|  count?: number
   491|  disabled?: boolean
   492|  variant?: 'green' | 'terra'
   493|}) {
   494|  // Support both old API (children) and new API (label + count)
   495|  const display = children ?? (
   496|    <>
   497|      {label}
   498|      {count !== undefined && <Count>{count}</Count>}
   499|    </>
   500|  )
   501|
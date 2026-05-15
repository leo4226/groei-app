     1|import { useEffect, useState } from 'react'
     2|import { Link, useNavigate } from 'react-router-dom'
     3|import { useFloreren } from '../store/useFloreren'
     4|import { CARE_TYPE_INFO } from '../types'
     5|import type { CareTask, RecentLogEntry, MapInfo, PlantFactOut } from '../types'
     6|import type { WeatherData, WeatherIcon } from '../hooks/useWeather'
     7|import { useWeather } from '../hooks/useWeather'
     8|import UserSwitcher from '../components/UserSwitcher'
     9|import { HALO_COLORS } from '../hooks/usePlantStatus'
    10|import { useT } from '../context/LanguageContext'
    11|import { getToken } from '../api/auth'
    12|import type { Translations } from '../i18n/translations'
    13|import PageDecor from '../components/PageDecor'
    14|
    15|const PX_PER_M = 46
    16|
    17|function parseMapDimensions(viewbox: string): { w: number; h: number } | null {
    18|  const parts = viewbox.trim().split(/\s+/).map(Number)
    19|  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
    20|  const [, , wPx, hPx] = parts
    21|  if (wPx <= 0 || hPx <= 0) return null
    22|  return { w: Math.round(wPx / PX_PER_M), h: Math.round(hPx / PX_PER_M) }
    23|}
    24|
    25|const WEEKLY_BUDGET: Record<string, number> = {
    26|  winter: 5, spring: 18, summer: 25, autumn: 10,
    27|}
    28|function dailyWaterNeedMm(): number {
    29|  const m = new Date().getMonth() // 0=Jan
    30|  const season = m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'
    31|  return WEEKLY_BUDGET[season] / 7
    32|}
    33|
    34|const RAIN_OK = 'var(--color-primary)'   // green
    35|const RAIN_DRY = 'var(--color-overdue)'  // red
    36|
    37|export default function Dashboard() {
    38|  const { dashboardV2, activeUserId, users, maps, loadDashboardV2, isLoading, createMap } = useFloreren()
    39|  const activeUser = users.find((u) => u.id === activeUserId)
    40|  const t = useT()
    41|  const navigate = useNavigate()
    42|
    43|  const [showNewMap, setShowNewMap] = useState(false)
    44|  const [newMapName, setNewMapName] = useState('')
    45|  const [newMapType, setNewMapType] = useState<'outdoor' | 'indoor'>('outdoor')
    46|  const [creating, setCreating] = useState(false)
    47|  const [createError, setCreateError] = useState<string | null>(null)
    48|
    49|  async function handleCreateMap() {
    50|    if (!newMapName.trim() || creating) return
    51|    setCreating(true)
    52|    setCreateError(null)
    53|    try {
    54|      const map = await createMap({ name: newMapName.trim(), map_type: newMapType })
    55|      setShowNewMap(false)
    56|      setNewMapName('')
    57|      setNewMapType('outdoor')
    58|      navigate(`/maps/${map.id}/edit-layout`)
    59|    } catch (e) {
    60|      setCreateError(e instanceof Error ? e.message : t.maps.failedCreate)
    61|    } finally {
    62|      setCreating(false)
    63|    }
    64|  }
    65|
    66|  function openNewMap() {
    67|    setNewMapName('')
    68|    setNewMapType('outdoor')
    69|    setCreateError(null)
    70|    setShowNewMap(true)
    71|  }
    72|
    73|  const greeting = (() => {
    74|    const hour = new Date().getHours()
    75|    if (hour < 6) return t.dashboard.greeting.night
    76|    if (hour < 12) return t.dashboard.greeting.morning
    77|    if (hour < 18) return t.dashboard.greeting.afternoon
    78|    return t.dashboard.greeting.evening
    79|  })()
    80|
    81|  const outdoorMap = maps.find((m) => m.map_type === 'outdoor')
    82|  const { weather } = useWeather(outdoorMap?.lat ?? null, outdoorMap?.lon ?? null)
    83|
    84|  useEffect(() => {
    85|    if (getToken()) loadDashboardV2()
    86|  }, [loadDashboardV2])
    87|
    88|  const overdueCount = dashboardV2?.overdue.length ?? 0
    89|  const dueTodayCount = dashboardV2?.due_today.length ?? 0
    90|  const upcomingCount = dashboardV2?.upcoming.length ?? 0
    91|  const totalTasks = overdueCount + dueTodayCount + upcomingCount
    92|  const nextCareTask = dashboardV2?.overdue[0] ?? dashboardV2?.due_today[0] ?? null
    93|
    94|  const date = new Date().toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long' })
    95|
    96|  function leadCopy(overdue: number, due: number): string {
    97|    if (overdue > 0) return `${overdue} ${overdue === 1 ? 'plant' : t.dashboard.status.collection.toLowerCase()} ${t.dashboard.tasks.overdue.toLowerCase()}.`
    98|    if (due > 0) return t.dashboard.tasks.calm
    99|    return t.dashboard.tasks.calm
   100|  }
   101|
   102|  function summaryLede(overdue: number, due: number, upcoming: number): string {
   103|    const parts: string[] = []
   104|    if (overdue > 0) parts.push(`${overdue} ${t.dashboard.tasks.overdue.toLowerCase()}`)
   105|    if (due > 0) parts.push(`${due} ${t.dashboard.tasks.today.toLowerCase()}`)
   106|    if (upcoming > 0) parts.push(`${upcoming} ${t.dashboard.tasks.upcoming.toLowerCase()}`)
   107|    return parts.join(' · ')
   108|  }
   109|
   110|  return (
   111|    <div style={{ paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
   112|      <PageDecor />
   113|      <div style={{ position: 'relative', zIndex: 1 }}>
   114|
   115|        {/* ── Header ── */}
   116|        <DashboardHeader
   117|          t={t}
   118|          greeting={greeting}
   119|          userName={activeUser?.name ?? '…'}
   120|          date={date}
   121|          lede={leadCopy(overdueCount, dueTodayCount)}
   122|          weather={weather}
   123|          nextCareTask={nextCareTask}
   124|        />
   125|
   126|        {/* ── Status Banner ── */}
   127|        {dashboardV2 && (
   128|          <StatusBanner t={t} counts={dashboardV2.status_counts} />
   129|        )}
   130|
   131|        {/* ── Responsive grid: main + sidebar ── */}
   132|        <div style={{
   133|          display: 'grid',
   134|          gridTemplateColumns: '1fr',
   135|          gap: 0,
   136|        }}
   137|          className="dashboard-grid"
   138|        >
   139|          {/* MAIN column */}
   140|          <div>
   141|            {/* Mijn Tuinen */}
   142|            <section style={{ padding: '0 24px' }}>
   143|              <SectionHeader
   144|                leftLede={maps.length === 0 ? t.dashboard.actions.addGarden : maps.length === 1 ? t.dashboard.actions.view : `${t.dashboard.actions.view} (${maps.length})`}
   145|                rightMarker={t.dashboard.sections.myGardens}
   146|              />
   147|              {maps.length > 0 ? (
   148|                <div className="no-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: 14, margin: '0 -24px', padding: '4px 24px 16px' }}>
   149|                  {maps.map((map) => <MapCard key={map.id} map={map} t={t} />)}
   150|                  <NewMapCard t={t} onNewMap={openNewMap} />
   151|                </div>
   152|              ) : (
   153|                <button onClick={openNewMap} style={{
   154|                  display: 'flex', width: '100%', height: 132,
   155|                  border: '1px dashed var(--color-border)', borderRadius: 14,
   156|                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
   157|                  color: 'var(--color-text-muted)', background: 'var(--color-surface)',
   158|                  cursor: 'pointer', marginBottom: 18,
   159|                }}>
   160|                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
   161|                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>{t.dashboard.actions.addGarden}</span>
   162|                </button>
   163|              )}
   164|            </section>
   165|
   166|            {/* Vandaag */}
   167|            <section style={{ padding: '0 24px' }}>
   168|              <SectionHeader
   169|                leftLede={summaryLede(overdueCount, dueTodayCount, upcomingCount)}
   170|                rightMarker={t.dashboard.sections.today}
   171|              />
   172|              {isLoading && <TaskSkeletons />}
   173|              {!isLoading && totalTasks === 0 && <CalmEmptyState t={t} />}
   174|              {!isLoading && dashboardV2 && totalTasks > 0 && (
   175|                <TodayGrid
   176|                  t={t}
   177|                  overdue={dashboardV2.overdue}
   178|                  dueToday={dashboardV2.due_today}
   179|                />
   180|              )}
   181|            </section>
   182|
   183|            {/* Logboek */}
   184|            {dashboardV2 && dashboardV2.recent_log.length > 0 && (
   185|              <section style={{ padding: '0 24px' }}>
   186|                <SectionHeader leftLede="" rightMarker={t.dashboard.sections.logbook} />
   187|                <LogboekSection t={t} entries={dashboardV2.recent_log} />
   188|              </section>
   189|            )}
   190|          </div>
   191|
   192|          {/* SIDEBAR column */}
   193|          <div className="dashboard-sidebar" style={{ padding: '0 24px' }}>
   194|            <WeatherCard t={t} weather={weather} />
   195|            {dashboardV2?.plant_fact && (
   196|              <CareTipCard t={t} fact={dashboardV2.plant_fact} />
   197|            )}
   198|            <UnderConstructionCard
   199|              t={t}
   200|              icon="🌿"
   201|              title="Detectie"
   202|              description={`Onkruid & ziektes herkennen — ${t.dashboard.comingSoon.toLowerCase()} beschikbaar.`}
   203|            />
   204|            <UnderConstructionCard
   205|              t={t}
   206|              icon="📷"
   207|              title="Foto-identificatie"
   208|              description={`Richt de camera op een plant — ${t.dashboard.comingSoon.toLowerCase()} beschikbaar.`}
   209|            />
   210|          </div>
   211|        </div>
   212|
   213|      </div>
   214|
   215|      <style>{`
   216|        @media (min-width: 900px) {
   217|          .dashboard-grid {
   218|            grid-template-columns: 1fr 340px !important;
   219|            align-items: start;
   220|            padding: 0 24px;
   221|            gap: 28px;
   222|          }
   223|          .dashboard-sidebar {
   224|            padding: 0 !important;
   225|          }
   226|        }
   227|      `}</style>
   228|
   229|      {showNewMap && (
   230|        <div
   231|          onClick={() => setShowNewMap(false)}
   232|          style={{
   233|            position: 'fixed', inset: 0, zIndex: 200,
   234|            background: 'rgba(0,0,0,0.45)',
   235|            display: 'flex', alignItems: 'center', justifyContent: 'center',
   236|            padding: 24,
   237|          }}
   238|        >
   239|          <div
   240|            onClick={(e) => e.stopPropagation()}
   241|            style={{
   242|              background: 'var(--color-surface)',
   243|              borderRadius: 16,
   244|              padding: '28px 24px 24px',
   245|              width: '100%',
   246|              maxWidth: 400,
   247|              border: '1px solid var(--color-border)',
   248|            }}
   249|          >
   250|            <h2 style={{
   251|              margin: '0 0 20px',
   252|              fontFamily: 'var(--font-heading)',
   253|              fontWeight: 500,
   254|              fontSize: 22,
   255|              color: 'var(--color-text)',
   256|              letterSpacing: '-0.01em',
   257|            }}>{t.dashboard.actions.newGarden}</h2>
   258|
   259|            {createError && (
   260|              <div style={{
   261|                background: 'var(--color-overdue-soft, rgba(200,60,60,.1))',
   262|                color: 'var(--color-overdue)',
   263|                fontSize: 13, borderRadius: 8, padding: '8px 12px', marginBottom: 16,
   264|              }}>{createError}</div>
   265|            )}
   266|
   267|            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
   268|              {t.maps.mapNameLabel}
   269|            </label>
   270|            <input
   271|              autoFocus
   272|              value={newMapName}
   273|              onChange={(e) => setNewMapName(e.target.value)}
   274|              onKeyDown={(e) => e.key === 'Enter' && handleCreateMap()}
   275|              placeholder={t.maps.mapNamePlaceholder}
   276|              style={{
   277|                width: '100%', boxSizing: 'border-box',
   278|                border: '1px solid var(--color-border)', borderRadius: 10,
   279|                padding: '10px 14px', fontSize: 15,
   280|                background: 'var(--color-bg)', color: 'var(--color-text)',
   281|                fontFamily: 'var(--font-body)', marginBottom: 18, outline: 'none',
   282|              }}
   283|            />
   284|
   285|            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>
   286|              Type
   287|            </label>
   288|            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
   289|              {(['outdoor', 'indoor'] as const).map((type) => (
   290|                <button
   291|                  key={type}
   292|                  onClick={() => setNewMapType(type)}
   293|                  style={{
   294|                    flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14,
   295|                    fontFamily: 'var(--font-body)', fontWeight: 500, cursor: 'pointer',
   296|                    border: `1px solid ${newMapType === type ? 'var(--color-primary)' : 'var(--color-border)'}`,
   297|                    background: newMapType === type ? 'var(--color-primary)' : 'var(--color-bg)',
   298|                    color: newMapType === type ? '#fff' : 'var(--color-text-muted)',
   299|                    transition: 'all 0.12s',
   300|                  }}
   301|                >
   302|                  {type === 'outdoor' ? t.maps.outdoor : t.maps.indoor}
   303|                </button>
   304|              ))}
   305|            </div>
   306|
   307|            <div style={{ display: 'flex', gap: 10 }}>
   308|              <button
   309|                onClick={handleCreateMap}
   310|                disabled={!newMapName.trim() || creating}
   311|                style={{
   312|                  flex: 1, padding: '12px 0', borderRadius: 10,
   313|                  background: 'var(--color-primary)', color: '#fff',
   314|                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
   315|                  border: 'none', cursor: 'pointer', opacity: (!newMapName.trim() || creating) ? 0.5 : 1,
   316|                  transition: 'opacity 0.12s',
   317|                }}
   318|              >
   319|                {creating ? '…' : t.maps.newMap.replace('+ ', '')}
   320|              </button>
   321|              <button
   322|                onClick={() => setShowNewMap(false)}
   323|                style={{
   324|                  padding: '12px 18px', borderRadius: 10,
   325|                  background: 'transparent', color: 'var(--color-text-muted)',
   326|                  fontFamily: 'var(--font-body)', fontSize: 15,
   327|                  border: '1px solid var(--color-border)', cursor: 'pointer',
   328|                }}
   329|              >
   330|                {t.common.cancel}
   331|              </button>
   332|            </div>
   333|          </div>
   334|        </div>
   335|      )}
   336|    </div>
   337|  )
   338|}
   339|
   340|// ── Helper components ──
   341|
   342|function DashboardHeader({
   343|  t, greeting, userName, date, lede, weather, nextCareTask,
   344|}: {
   345|  t: Translations
   346|  greeting: string
   347|  userName: string
   348|  date: string
   349|  lede: string
   350|  weather: WeatherData | null
   351|  nextCareTask: CareTask | null
   352|}) {
   353|  const sunrise = weather ? new Date(weather.sunrise).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
   354|  const sunset  = weather ? new Date(weather.sunset).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
   355|  const temp    = weather ? `${weather.currentTemp}°C` : '—'
   356|  const nextCare = nextCareTask
   357|    ? `${nextCareTask.plant_name}${nextCareTask.days_overdue > 0 ? ` · ${t.dashboard.tasks.daysLate(nextCareTask.days_overdue)}` : ` · ${t.dashboard.tasks.today}`}`
   358|    : t.dashboard.almanac.onTrack
   359|
   360|  return (
   361|    <header style={{
   362|      padding: '40px 24px 20px',
   363|      borderBottom: '1px solid var(--color-border)',
   364|      display: 'flex',
   365|      justifyContent: 'space-between',
   366|      alignItems: 'flex-start',
   367|      flexWrap: 'wrap',
   368|      gap: 20,
   369|    }}>
   370|      <div style={{ flex: 1, minWidth: 240 }}>
   371|        {/* Eyebrow */}
   372|        <p style={{
   373|          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em',
   374|          textTransform: 'uppercase', color: 'var(--color-text-muted)',
   375|          margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12,
   376|        }}>
   377|          <span style={{ width: 24, height: 1, background: 'var(--color-border)', flex: 'none' }} />
   378|          {greeting} · {date}
   379|          <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
   380|        </p>
   381|
   382|        {/* H1 */}
   383|        <h1 style={{
   384|          fontFamily: 'var(--font-heading)', fontWeight: 500,
   385|          fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.95,
   386|          letterSpacing: '-0.02em', color: 'var(--color-text)', margin: 0,
   387|        }}>
   388|          {greeting},{' '}
   389|          <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>
   390|            {userName}
   391|          </em>.
   392|        </h1>
   393|
   394|        {/* Lede */}
   395|        <p style={{
   396|          fontFamily: 'var(--font-heading)', fontStyle: 'italic',
   397|          fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-soft)',
   398|          maxWidth: 440, margin: '8px 0 16px 0',
   399|        }}>
   400|          {lede}
   401|        </p>
   402|
   403|        {/* Almanac 2×2 grid */}
   404|        <div style={{
   405|          display: 'grid', gridTemplateColumns: '1fr 1fr',
   406|          border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden',
   407|          maxWidth: 440,
   408|        }}>
   409|          {[
   410|            { label: t.dashboard.almanac.sunrise, value: sunrise },
   411|            { label: t.dashboard.almanac.sunset, value: sunset },
   412|            { label: t.dashboard.almanac.temp, value: temp },
   413|            { label: t.dashboard.almanac.nextCare, value: nextCare },
   414|          ].map((row, i) => (
   415|            <div key={row.label} style={{
   416|              padding: '10px 14px',
   417|              borderRight: i % 2 === 0 ? '1px solid var(--color-border)' : 'none',
   418|              borderBottom: i < 2 ? '1px solid var(--color-border)' : 'none',
   419|              background: 'var(--color-surface)',
   420|            }}>
   421|              <div style={{
   422|                fontFamily: 'var(--font-mono)', fontSize: 9,
   423|                textTransform: 'uppercase', letterSpacing: '0.18em',
   424|                color: 'var(--color-text-muted)', marginBottom: 3,
   425|              }}>{row.label}</div>
   426|              <div style={{
   427|                fontFamily: 'var(--font-heading)', fontSize: 14,
   428|                color: i === 2 ? 'var(--color-overdue)' : 'var(--color-text)',
   429|                fontWeight: 500,
   430|              }}>{row.value}</div>
   431|            </div>
   432|          ))}
   433|        </div>
   434|      </div>
   435|
   436|      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16, paddingTop: 4 }}>
   437|        <UserSwitcher />
   438|      </div>
   439|    </header>
   440|  )
   441|}
   442|
   443|function StatusBanner({ t, counts }: { t: Translations; counts: { total: number; on_schedule: number; thirsty: number; dry: number } }) {
   444|  const cells = [
   445|    { label: t.dashboard.status.collection, value: counts.total, color: 'var(--color-text)' },
   446|    { label: t.dashboard.status.onSchedule, value: counts.on_schedule, color: 'var(--color-primary)' },
   447|    { label: t.dashboard.status.thirsty, value: counts.thirsty, color: counts.thirsty > 0 ? 'var(--color-due)' : 'var(--color-text-muted)' },
   448|    { label: t.dashboard.status.dry, value: counts.dry, color: counts.dry > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)' },
   449|  ]
   450|  return (
   451|    <div style={{
   452|      display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
   453|      border: '1px solid var(--color-border)',
   454|      borderLeft: 'none', borderRight: 'none',
   455|      background: 'var(--color-surface)',
   456|      margin: '0 0 20px',
   457|    }}>
   458|      {cells.map((cell, i) => (
   459|        <div key={cell.label} style={{
   460|          padding: '14px 16px', textAlign: 'center',
   461|          borderRight: i < cells.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
   462|        }}>
   463|          <div style={{
   464|            fontFamily: 'var(--font-mono)', fontSize: 9,
   465|            textTransform: 'uppercase', letterSpacing: '0.18em',
   466|            color: 'var(--color-text-muted)', marginBottom: 5,
   467|          }}>{cell.label}</div>
   468|          <div style={{
   469|            fontFamily: 'var(--font-heading)', fontSize: 28,
   470|            fontWeight: 500, lineHeight: 1, color: cell.color,
   471|          }}>{cell.value}</div>
   472|        </div>
   473|      ))}
   474|    </div>
   475|  )
   476|}
   477|
   478|
   479|function SectionHeader({
   480|  leftLede,
   481|  rightMarker,
   482|  rightAction,
   483|}: {
   484|  leftLede: string
   485|  rightMarker: string
   486|  rightAction?: { to: string; label: string }
   487|}) {
   488|  return (
   489|    <div style={{
   490|      display: 'flex',
   491|      justifyContent: 'space-between',
   492|      alignItems: 'baseline',
   493|      padding: '20px 0 18px',
   494|      borderBottom: '1px solid var(--color-border)',
   495|      marginBottom: 18,
   496|      gap: 12,
   497|    }}>
   498|      <p style={{
   499|        margin: 0,
   500|        fontFamily: 'var(--font-heading)',
   501|
1|import { useState, useEffect } from 'react'
     2|import { useNavigate } from 'react-router-dom'
     3|import { useFloreren } from '../store/useFloreren'
     4|import { useT } from '../context/LanguageContext'
     5|import { syncIcons, fetchIconGaps, fetchAdminAccounts, type AdminAccount } from '../api/client'
     6|import { clearToken } from '../api/auth'
     7|import type { IconSyncResult, IconGapReport } from '../types'
     8|
     9|export default function Settings() {
    10|  const { users, locations, activeUserId, setActiveUser, updateUserLanguage: updateUserLanguageFn } = useFloreren()
    11|  const t = useT()
    12|  const navigate = useNavigate()
    13|  const [syncing, setSyncing] = useState(false)
    14|  const [syncResult, setSyncResult] = useState<IconSyncResult | null>(null)
    15|  const [syncError, setSyncError] = useState<string | null>(null)
    16|  const [gapReport, setGapReport] = useState<IconGapReport | null>(null)
    17|  const [gapsLoading, setGapsLoading] = useState(false)
    18|  const [gapsError, setGapsError] = useState<string | null>(null)
    19|  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[] | null>(null)
    20|
    21|  useEffect(() => {
    22|    fetchAdminAccounts()
    23|      .then(setAdminAccounts)
    24|      .catch(() => setAdminAccounts(null))
    25|  }, [])
    26|
    27|  async function handleSyncIcons() {
    28|    setSyncing(true)
    29|    setSyncResult(null)
    30|    setSyncError(null)
    31|    try {
    32|      const result = await syncIcons()
    33|      setSyncResult(result)
    34|    } catch (e) {
    35|      setSyncError(e instanceof Error ? e.message : t.common.error)
    36|    } finally {
    37|      setSyncing(false)
    38|    }
    39|  }
    40|
    41|  async function handleLoadGaps() {
    42|    setGapsLoading(true)
    43|    setGapsError(null)
    44|    try {
    45|      const report = await fetchIconGaps()
    46|      setGapReport(report)
    47|    } catch (e) {
    48|      setGapsError(e instanceof Error ? e.message : t.common.error)
    49|    } finally {
    50|      setGapsLoading(false)
    51|    }
    52|  }
    53|
    54|  return (
    55|    <div className="px-4 pt-6">
    56|      <h1 className="text-2xl font-extrabold mb-6">{t.settings.title}</h1>
    57|
    58|      <section className="mb-8">
    59|        <h2 className="text-base font-bold mb-3">{t.settings.whoIsGardening}</h2>
    60|        <div className="grid grid-cols-2 gap-3">
    61|          {users.map((user) => (
    62|            <button
    63|              key={user.id}
    64|              onClick={() => setActiveUser(user.id)}
    65|              className={`card p-4 flex flex-col items-center gap-2 transition-all ${
    66|                user.id === activeUserId
    67|                  ? 'ring-2 ring-primary border-primary/20'
    68|                  : 'hover:border-primary/20'
    69|              }`}
    70|            >
    71|              <span className="text-3xl">{user.avatar}</span>
    72|              <span className={`font-semibold ${user.id === activeUserId ? 'text-primary' : 'text-text'}`}>
    73|                {user.name}
    74|              </span>
    75|              {user.id === activeUserId && (
    76|                <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
    77|                  {t.settings.active}
    78|                </span>
    79|              )}
    80|            </button>
    81|          ))}
    82|        </div>
    83|      </section>
    84|
    85|      <section className="mb-8">
    86|        <h2 className="text-base font-bold mb-3">{t.settings.language}</h2>
    87|        <div className="grid grid-cols-2 gap-3">
    88|          {(['nl', 'en'] as const).map((lang) => {
    89|            const activeUser = users.find((u) => u.id === activeUserId)
    90|            const isSelected = (activeUser?.language ?? 'nl') === lang
    91|            return (
    92|              <button
    93|                key={lang}
    94|                onClick={async () => {
    95|                  if (activeUserId) await updateUserLanguageFn(activeUserId, lang)
    96|                }}
    97|                className={`card p-4 flex flex-col items-center gap-2 transition-all ${
    98|                  isSelected ? 'ring-2 ring-primary border-primary/20' : 'hover:border-primary/20'
    99|                }`}
   100|              >
   101|                <span className="text-2xl">{lang === 'nl' ? '🇳🇱' : '🇬🇧'}</span>
   102|                <span className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-text'}`}>
   103|                  {lang === 'nl' ? t.settings.languageNl : t.settings.languageEn}
   104|                </span>
   105|                {isSelected && (
   106|                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
   107|                    {t.settings.active}
   108|                  </span>
   109|                )}
   110|              </button>
   111|            )
   112|          })}
   113|        </div>
   114|      </section>
   115|
   116|      <section className="mb-8">
   117|        <h2 className="text-base font-bold mb-3">{t.settings.locations}</h2>
   118|        <div className="card divide-y divide-border/50">
   119|          {locations.map((loc) => (
   120|            <div key={loc.id} className="flex items-center gap-3 px-4 py-3">
   121|              <span className="text-xl">{loc.icon}</span>
   122|              <span className="font-medium text-sm">{loc.name}</span>
   123|            </div>
   124|          ))}
   125|        </div>
   126|      </section>
   127|
   128|      <section className="mb-8">
   129|        <h2 className="text-base font-bold mb-3">{t.settings.icons.title}</h2>
   130|        <div className="card p-4 space-y-3">
   131|          <p className="text-sm text-text-muted">
   132|            {t.settings.icons.description}
   133|          </p>
   134|          <button
   135|            onClick={handleSyncIcons}
   136|            disabled={syncing}
   137|            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
   138|          >
   139|            {syncing ? (
   140|              <>
   141|                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
   142|                {t.settings.icons.syncing}
   143|              </>
   144|            ) : (
   145|              <>{t.settings.icons.syncButton}</>
   146|            )}
   147|          </button>
   148|
   149|          {syncError && (
   150|            <p className="text-sm text-fiery-red">{syncError}</p>
   151|          )}
   152|
   153|          {syncResult && (
   154|            <div className="text-sm space-y-2">
   155|              <p className="font-medium text-text">{t.settings.icons.result}</p>
   156|              <p className="text-text-muted">
   157|                {t.settings.icons.totalIcons(syncResult.total_icons)}
   158|                {syncResult.new_icons > 0 && (
   159|                  <> — <span className="text-primary font-medium">{t.settings.icons.newIcons(syncResult.new_icons)}</span>{' '}
   160|                  <span className="text-xs">({syncResult.new_icon_ids.join(', ')})</span></>
   161|                )}
   162|              </p>
   163|              {syncResult.matched_plants > 0 && (
   164|                <p className="text-text-muted">
   165|                  {t.settings.icons.linked} {syncResult.matches.map((m) => (
   166|                    <span key={m.plant_id} className="inline-block mr-1">
   167|                      <span className="font-medium text-text">{m.plant_name}</span>
   168|                      <span className="text-xs"> → {m.icon_key}</span>
   169|                    </span>
   170|                  ))}
   171|                </p>
   172|              )}
   173|              {syncResult.unmatched_plants > 0 && (
   174|                <p className="text-text-muted">
   175|                  {t.settings.icons.noIconFor}{' '}
   176|                  <span className="font-medium text-text">
   177|                    {syncResult.unmatched.map((u) => u.plant_name).join(', ')}
   178|                  </span>
   179|                  <span className="block text-xs mt-0.5">{t.settings.icons.setManually}</span>
   180|                </p>
   181|              )}
   182|              {syncResult.new_icons === 0 && syncResult.matched_plants === 0 && syncResult.unmatched_plants === 0 && (
   183|                <p className="text-text-muted italic">{t.settings.icons.upToDate}</p>
   184|              )}
   185|            </div>
   186|          )}
   187|        </div>
   188|      </section>
   189|
   190|      <section className="mb-8">
   191|        <h2 className="text-base font-bold mb-3">{t.settings.icons.gapsTitle}</h2>
   192|        <div className="card p-4 space-y-3">
   193|          <p className="text-sm text-text-muted">
   194|            {t.settings.icons.gapsDescription}
   195|          </p>
   196|          <button
   197|            onClick={handleLoadGaps}
   198|            disabled={gapsLoading}
   199|            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-surface border border-border text-text font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
   200|          >
   201|            {gapsLoading ? (
   202|              <>
   203|                <span className="w-4 h-4 border-2 border-text/20 border-t-text rounded-full animate-spin" />
   204|                {t.settings.icons.loadingGaps}
   205|              </>
   206|            ) : (
   207|              t.settings.icons.loadGaps
   208|            )}
   209|          </button>
   210|
   211|          {gapsError && (
   212|            <p className="text-sm text-fiery-red">{gapsError}</p>
   213|          )}
   214|
   215|          {gapReport && (
   216|            <div className="space-y-4 text-sm">
   217|              <div>
   218|                <p className="font-medium text-text mb-1">
   219|                  Aangevraagde iconen ({gapReport.requested.length})
   220|                </p>
   221|                {gapReport.requested.length === 0 ? (
   222|                  <p className="text-text-muted italic text-xs">Geen aanvragen</p>
   223|                ) : (
   224|                  <ul className="space-y-1">
   225|                    {gapReport.requested.map((p) => (
   226|                      <li key={p.id} className="text-text-muted">
   227|                        <span className="font-medium text-text">{p.name}</span>
   228|                        {p.species && <span className="text-xs ml-1">— {p.species}</span>}
   229|                      </li>
   230|                    ))}
   231|                  </ul>
   232|                )}
   233|              </div>
   234|
   235|              <div>
   236|                <p className="font-medium text-text mb-1">
   237|                  Soorten zonder icoon ({gapReport.species_without_icon.length})
   238|                </p>
   239|                {gapReport.species_without_icon.length === 0 ? (
   240|                  <p className="text-text-muted italic text-xs">Alle soorten hebben een icoon</p>
   241|                ) : (
   242|                  <ul className="space-y-1 max-h-40 overflow-y-auto">
   243|                    {gapReport.species_without_icon.map((s) => (
   244|                      <li key={s.id} className="text-text-muted">
   245|                        <span className="font-medium text-text">{s.name}</span>
   246|                        {s.latin && <span className="text-xs ml-1 italic">— {s.latin}</span>}
   247|                      </li>
   248|                    ))}
   249|                  </ul>
   250|                )}
   251|              </div>
   252|
   253|              <div>
   254|                <p className="font-medium text-text mb-1">
   255|                  Iconen zonder soort ({gapReport.icons_without_species.length})
   256|                </p>
   257|                {gapReport.icons_without_species.length === 0 ? (
   258|                  <p className="text-text-muted italic text-xs">Alle iconen hebben een soort</p>
   259|                ) : (
   260|                  <ul className="space-y-1 max-h-40 overflow-y-auto">
   261|                    {gapReport.icons_without_species.map((e) => (
   262|                      <li key={e.id} className="text-text-muted font-mono text-xs">
   263|                        {e.id}
   264|                        {e.sci && <span className="font-sans italic ml-1">— {e.sci}</span>}
   265|                      </li>
   266|                    ))}
   267|                  </ul>
   268|                )}
   269|              </div>
   270|            </div>
   271|          )}
   272|        </div>
   273|      </section>
   274|
   275|      {adminAccounts && adminAccounts.length > 0 && (
   276|        <section className="mb-8">
   277|          <h2 className="text-base font-bold mb-3">Accounts ({adminAccounts.length})</h2>
   278|          <div className="card divide-y divide-border/50">
   279|            {adminAccounts.map((acct) => (
   280|              <div key={acct.id} className="px-4 py-3">
   281|                <div className="flex items-center justify-between">
   282|                  <span className="font-medium text-sm">{acct.name}</span>
   283|                  <span className="text-[10px] text-text-muted">{acct.created_at?.slice(0, 10)}</span>
   284|                </div>
   285|                <p className="text-xs text-text-muted mt-0.5">{acct.email}</p>
   286|                <p className="text-[10px] text-primary/60 mt-0.5">{acct.household_name}</p>
   287|              </div>
   288|            ))}
   289|          </div>
   290|        </section>
   291|      )}
   292|
   293|      <section>
   294|        <h2 className="text-base font-bold mb-3">About</h2>
   295|        <div className="card p-4">
   296|          <p className="text-sm text-text-muted">
   297|            <span className="font-bold text-primary text-base">Floreren</span> v0.1
   298|          </p>
   299|          <p className="text-xs text-text-muted mt-1">
   300|            Plant care for Leon & Lisbeth 🌱
   301|          </p>
   302|        </div>
   303|      </section>
   304|
   305|      <section className="mt-8 mb-4">
   306|        <button
   307|          onClick={() => { clearToken(); navigate('/login') }}
   308|          className="w-full py-3 rounded-xl border border-red-400/30 text-red-400 font-semibold text-sm active:scale-[0.98] transition-transform"
   309|        >
   310|          Log uit
   311|        </button>
   312|      </section>
   313|    </div>
   314|  )
   315|}
   316|
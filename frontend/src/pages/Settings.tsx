import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import { syncIcons, fetchIconGaps, fetchAdminAccounts, type AdminAccount } from '../api/client'
import { clearToken } from '../api/auth'
import type { IconSyncResult, IconGapReport } from '../types'

export default function Settings() {
  const { users, locations, activeUserId, setActiveUser, updateUserLanguage: updateUserLanguageFn } = useFloreren()
  const t = useT()
  const navigate = useNavigate()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<IconSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [gapReport, setGapReport] = useState<IconGapReport | null>(null)
  const [gapsLoading, setGapsLoading] = useState(false)
  const [gapsError, setGapsError] = useState<string | null>(null)
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[] | null>(null)

  useEffect(() => {
    fetchAdminAccounts()
      .then(setAdminAccounts)
      .catch(() => setAdminAccounts(null))
  }, [])

  async function handleSyncIcons() {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      const result = await syncIcons()
      setSyncResult(result)
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : t.common.error)
    } finally {
      setSyncing(false)
    }
  }

  async function handleLoadGaps() {
    setGapsLoading(true)
    setGapsError(null)
    try {
      const report = await fetchIconGaps()
      setGapReport(report)
    } catch (e) {
      setGapsError(e instanceof Error ? e.message : t.common.error)
    } finally {
      setGapsLoading(false)
    }
  }

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-extrabold mb-6">{t.settings.title}</h1>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.whoIsGardening}</h2>
        <div className="grid grid-cols-2 gap-3">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => setActiveUser(user.id)}
              className={`card p-4 flex flex-col items-center gap-2 transition-all ${
                user.id === activeUserId
                  ? 'ring-2 ring-primary border-primary/20'
                  : 'hover:border-primary/20'
              }`}
            >
              <span className="text-3xl">{user.avatar}</span>
              <span className={`font-semibold ${user.id === activeUserId ? 'text-primary' : 'text-text'}`}>
                {user.name}
              </span>
              {user.id === activeUserId && (
                <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {t.settings.active}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.language}</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['nl', 'en'] as const).map((lang) => {
            const activeUser = users.find((u) => u.id === activeUserId)
            const isSelected = (activeUser?.language ?? 'nl') === lang
            return (
              <button
                key={lang}
                onClick={async () => {
                  if (activeUserId) await updateUserLanguageFn(activeUserId, lang)
                }}
                className={`card p-4 flex flex-col items-center gap-2 transition-all ${
                  isSelected ? 'ring-2 ring-primary border-primary/20' : 'hover:border-primary/20'
                }`}
              >
                <span className="text-2xl">{lang === 'nl' ? '🇳🇱' : '🇬🇧'}</span>
                <span className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-text'}`}>
                  {lang === 'nl' ? t.settings.languageNl : t.settings.languageEn}
                </span>
                {isSelected && (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {t.settings.active}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.locations}</h2>
        <div className="card divide-y divide-border/50">
          {locations.map((loc) => (
            <div key={loc.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl">{loc.icon}</span>
              <span className="font-medium text-sm">{loc.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.icons.title}</h2>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-text-muted">
            {t.settings.icons.description}
          </p>
          <button
            onClick={handleSyncIcons}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {syncing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.settings.icons.syncing}
              </>
            ) : (
              <>{t.settings.icons.syncButton}</>
            )}
          </button>

          {syncError && (
            <p className="text-sm text-fiery-red">{syncError}</p>
          )}

          {syncResult && (
            <div className="text-sm space-y-2">
              <p className="font-medium text-text">{t.settings.icons.result}</p>
              <p className="text-text-muted">
                {t.settings.icons.totalIcons(syncResult.total_icons)}
                {syncResult.new_icons > 0 && (
                  <> — <span className="text-primary font-medium">{t.settings.icons.newIcons(syncResult.new_icons)}</span>{' '}
                  <span className="text-xs">({syncResult.new_icon_ids.join(', ')})</span></>
                )}
              </p>
              {syncResult.matched_plants > 0 && (
                <p className="text-text-muted">
                  {t.settings.icons.linked} {syncResult.matches.map((m) => (
                    <span key={m.plant_id} className="inline-block mr-1">
                      <span className="font-medium text-text">{m.plant_name}</span>
                      <span className="text-xs"> → {m.icon_key}</span>
                    </span>
                  ))}
                </p>
              )}
              {syncResult.unmatched_plants > 0 && (
                <p className="text-text-muted">
                  {t.settings.icons.noIconFor}{' '}
                  <span className="font-medium text-text">
                    {syncResult.unmatched.map((u) => u.plant_name).join(', ')}
                  </span>
                  <span className="block text-xs mt-0.5">{t.settings.icons.setManually}</span>
                </p>
              )}
              {syncResult.new_icons === 0 && syncResult.matched_plants === 0 && syncResult.unmatched_plants === 0 && (
                <p className="text-text-muted italic">{t.settings.icons.upToDate}</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.icons.gapsTitle}</h2>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-text-muted">
            {t.settings.icons.gapsDescription}
          </p>
          <button
            onClick={handleLoadGaps}
            disabled={gapsLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-surface border border-border text-text font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {gapsLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-text/20 border-t-text rounded-full animate-spin" />
                {t.settings.icons.loadingGaps}
              </>
            ) : (
              t.settings.icons.loadGaps
            )}
          </button>

          {gapsError && (
            <p className="text-sm text-fiery-red">{gapsError}</p>
          )}

          {gapReport && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-text mb-1">
                  Aangevraagde iconen ({gapReport.requested.length})
                </p>
                {gapReport.requested.length === 0 ? (
                  <p className="text-text-muted italic text-xs">Geen aanvragen</p>
                ) : (
                  <ul className="space-y-1">
                    {gapReport.requested.map((p) => (
                      <li key={p.id} className="text-text-muted">
                        <span className="font-medium text-text">{p.name}</span>
                        {p.species && <span className="text-xs ml-1">— {p.species}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="font-medium text-text mb-1">
                  Soorten zonder icoon ({gapReport.species_without_icon.length})
                </p>
                {gapReport.species_without_icon.length === 0 ? (
                  <p className="text-text-muted italic text-xs">Alle soorten hebben een icoon</p>
                ) : (
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {gapReport.species_without_icon.map((s) => (
                      <li key={s.id} className="text-text-muted">
                        <span className="font-medium text-text">{s.name}</span>
                        {s.latin && <span className="text-xs ml-1 italic">— {s.latin}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="font-medium text-text mb-1">
                  Iconen zonder soort ({gapReport.icons_without_species.length})
                </p>
                {gapReport.icons_without_species.length === 0 ? (
                  <p className="text-text-muted italic text-xs">Alle iconen hebben een soort</p>
                ) : (
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {gapReport.icons_without_species.map((e) => (
                      <li key={e.name} className="text-text-muted font-mono text-xs">
                        {e.name}
                        {e.sci && <span className="font-sans italic ml-1">— {e.sci}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {adminAccounts && adminAccounts.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-bold mb-3">Accounts ({adminAccounts.length})</h2>
          <div className="card divide-y divide-border/50">
            {adminAccounts.map((acct) => (
              <div key={acct.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{acct.name}</span>
                  <span className="text-[10px] text-text-muted">{acct.created_at?.slice(0, 10)}</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">{acct.email}</p>
                <p className="text-[10px] text-primary/60 mt-0.5">{acct.household_name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-base font-bold mb-3">About</h2>
        <div className="card p-4">
          <p className="text-sm text-text-muted">
            <span className="font-bold text-primary text-base">Floreren</span> v0.1
          </p>
          <p className="text-xs text-text-muted mt-1">
            Plant care for Leon & Lisbeth 🌱
          </p>
        </div>
      </section>

      <section className="mt-8 mb-4">
        <button
          onClick={() => { clearToken(); navigate('/login') }}
          className="w-full py-3 rounded-xl border border-red-400/30 text-red-400 font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          Log uit
        </button>
      </section>
    </div>
  )
}

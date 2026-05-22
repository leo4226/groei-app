import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import { icons, admin, type AdminAccount, household } from '../api/client'
import { clearToken } from '../api/auth'
import type { IconSyncResult, IconGapReport } from '../types'

export default function Settings() {
  const { users, locations, activeUserId, setActiveUser, updateUserLanguage: updateUserLanguageFn } = useFloreren()
  const activeUser = users.find((u) => u.id === activeUserId)
  const t = useT()
  const navigate = useNavigate()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<IconSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [gapReport, setGapReport] = useState<IconGapReport | null>(null)
  const [gapsLoading, setGapsLoading] = useState(false)
  const [gapsError, setGapsError] = useState<string | null>(null)
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[] | null>(null)
  const [trollClicked, setTrollClicked] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function InviteSection() {
    async function generateCode() {
      setInviteLoading(true)
      setInviteError(null)
      setInviteCode(null)
      try {
        const result = await household.invite()
        setInviteCode(result.code)
      } catch (e) {
        setInviteError(e instanceof Error ? e.message : 'Fout bij genereren code')
      } finally {
        setInviteLoading(false)
      }
    }

    async function copyCode() {
      if (inviteCode) {
        await navigator.clipboard.writeText(inviteCode)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }

    return (
      <div className="space-y-3">
        {!inviteCode && !inviteLoading && (
          <button
            onClick={generateCode}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform"
          >
            Genereer uitnodigingscode
          </button>
        )}

        {inviteLoading && (
          <div className="flex items-center justify-center gap-2 py-2.5">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm text-text-muted">Code genereren...</span>
          </div>
        )}

        {inviteCode && (
          <div className="text-center space-y-3">
            <p className="text-xs text-text-muted">Deel deze code met wie je wilt uitnodigen:</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl font-bold tracking-[0.3em] text-primary bg-primary/10 px-4 py-2 rounded-xl font-mono select-all">
                {inviteCode}
              </span>
              <button
                onClick={copyCode}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-border text-text active:scale-[0.95] transition-transform"
                title="Kopieer code"
              >
                {copied ? (
                  <span className="text-sm text-primary font-bold">✓</span>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={generateCode}
              disabled={inviteLoading}
              className="text-xs text-text-muted underline active:text-text transition-colors"
            >
              Nieuwe code genereren (oude vervalt)
            </button>
          </div>
        )}

        {inviteError && (
          <p className="text-sm text-fiery-red">{inviteError}</p>
        )}
      </div>
    )
  }

  useEffect(() => {
    admin.accounts()
      .then(setAdminAccounts)
      .catch(() => setAdminAccounts(null))
  }, [])

  async function handleSyncIcons() {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      const result = await icons.sync()
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
      const report = await icons.gaps()
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <h2 className="text-base font-bold mb-3">Nodig iemand uit</h2>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-text-muted">
            Genereer een code waarmee iemand jouw tuin kan joinen. De code is 7 dagen geldig.
          </p>
          <InviteSection />
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
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted">{acct.created_at?.slice(0, 10)}</span>
                    <button
                      onClick={async () => {
                        if (window.confirm(`Delete account "${acct.name}" (${acct.email})?\n\nAll plants, locations and data will be permanently removed.`)) {
                          try {
                            await admin.deleteAccount(acct.id)
                            setAdminAccounts(prev => prev ? prev.filter(a => a.id !== acct.id) : prev)
                          } catch (e) {
                            alert('Failed to delete: ' + (e instanceof Error ? e.message : 'Unknown error'))
                          }
                        }
                      }}
                      className="text-red-400/60 hover:text-red-400 text-xs ml-2 p-1"
                      title={`Delete ${acct.name}`}
                    >
                      ✕
                    </button>
                  </div>
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
            <span className="font-bold text-primary text-base">Floreren</span> v1.0
          </p>
          <p className="text-xs text-text-muted mt-1">
            Plant care for {activeUser?.name ?? 'your'}'s garden 🌱
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">Assistent</h2>
        <div className="card p-4 space-y-3">
          <button
            onClick={() => setTrollClicked(true)}
            disabled={trollClicked}
            className="w-full py-2.5 rounded-xl border border-border text-text font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-70"
          >
            Knappe assistent uitzetten
          </button>
          {trollClicked && (
            <p className="text-center text-sm font-bold text-primary animate-pulse">
              Dacht het niet 👹
            </p>
          )}
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

      {adminAccounts !== null && (
        <div className="mt-4 mb-8 text-center">
          <a
            href="/admin"
            className="font-mono text-[10px] uppercase tracking-widest text-text-muted no-underline"
          >
            Admin panel →
          </a>
        </div>
      )}
    </div>
  )
}

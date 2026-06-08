import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import { icons, admin, type AdminAccount, household } from '../api/client'
import { clearToken } from '../api/auth'
import type { IconSyncResult } from '../types'

const GROUP_OUTDOOR_KEY = 'floreren-group-outdoor-warnings'

export default function Settings() {
  const { users, locations, activeUserId, setActiveUser, updateUserLanguage: updateUserLanguageFn } = useFloreren()
  const [groupOutdoor, setGroupOutdoor] = useState(() => localStorage.getItem(GROUP_OUTDOOR_KEY) !== 'false')
  const activeUser = users.find((u) => u.id === activeUserId)
  const t = useT()
  const navigate = useNavigate()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<IconSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[] | null>(null)
  const [stekkieReset, setStekkieReset] = useState(false)
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
            {t.settings.generateCode}
          </button>
        )}

        {inviteLoading && (
          <div className="flex items-center justify-center gap-2 py-2.5">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm text-text-muted">{t.settings.generatingCode}</span>
          </div>
        )}

        {inviteCode && (
          <div className="text-center space-y-3">
            <p className="text-xs text-text-muted">{t.settings.shareCode}</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl font-bold tracking-[0.3em] text-primary bg-primary/10 px-4 py-2 rounded-xl font-mono select-all">
                {inviteCode}
              </span>
              <button
                onClick={copyCode}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-border text-text active:scale-[0.95] transition-transform"
                title={t.settings.copyCode}
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
              {t.settings.newCode}
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

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-extrabold mb-6">{t.settings.title}</h1>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.display}</h2>
        <div className="card p-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm">{t.settings.groupOutdoorWarnings}</div>
            <div className="text-xs text-text-muted mt-0.5">{t.settings.groupOutdoorWarningsDesc}</div>
          </div>
          <button
            onClick={() => {
              const next = !groupOutdoor
              setGroupOutdoor(next)
              localStorage.setItem(GROUP_OUTDOOR_KEY, String(next))
            }}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${groupOutdoor ? 'bg-primary' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${groupOutdoor ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.whoIsGardening}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {users.map((user) => (
            <div key={user.id} className="relative group">
              <button
                onClick={() => setActiveUser(user.id)}
                className={`card p-4 flex flex-col items-center gap-2 transition-all w-full ${
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
              {user.id !== activeUserId && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!window.confirm(`${t.settings.removeConfirm} ${user.name}?`)) return
                    try {
                      await household.removeMember(user.id)
                      useFloreren.getState().load()
                    } catch (e) {
                      alert(e instanceof Error ? e.message : t.settings.removeError)
                    }
                  }}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 active:scale-90 transition-all text-xs font-bold opacity-0 group-hover:opacity-100"
                  title={t.settings.removeMember}
                >
                  ✕
                </button>
              )}
            </div>
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
        <h2 className="text-base font-bold mb-3">{t.settings.inviteTitle}</h2>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-text-muted">
            {t.settings.inviteDescription}
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

      {adminAccounts !== null && (
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
            <div className="text-sm space-y-1">
              {syncResult.matched_plants > 0 ? (
                <p>{t.settings.icons.linked} {syncResult.matches.map((m) => m.plant_name).join(', ')}</p>
              ) : (
                <p>{t.settings.icons.noChanges}</p>
              )}
              {syncResult.unmatched_plants > 0 && (
                <p className="text-fiery-red">
                  {t.settings.icons.stillMissing}: {syncResult.unmatched.map((u) => u.plant_name).join(', ')}
                </p>
              )}
            </div>
          )}
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
        <h2 className="text-base font-bold mb-3">{t.settings.assistantTitle}</h2>
        <div className="card p-4 space-y-3">
          <button
            onClick={() => {
              localStorage.removeItem('floreren_stekkie_pos')
              localStorage.removeItem('floreren_help_dismissed')
              setStekkieReset(true)
              setTimeout(() => setStekkieReset(false), 2500)
            }}
            className="w-full py-2.5 rounded-xl border border-border text-text font-semibold text-sm active:scale-[0.98] transition-transform"
          >
            {t.settings.resetAssistant}
          </button>
          {stekkieReset && (
            <p className="text-center text-sm font-bold text-primary animate-pulse">
              {t.settings.resetAssistantDone} 🌱
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

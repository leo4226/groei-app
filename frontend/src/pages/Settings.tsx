import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import { apiRequest, icons, auth, type AccountMe, household, notifications, type NotificationPrefs, users as usersApi } from '../api/client'
import type { Location } from '../types'
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
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [stekkieReset, setStekkieReset] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationIcon, setNewLocationIcon] = useState('')
  const [locationError, setLocationError] = useState<string | null>(null)
  const [digestPrefs, setDigestPrefs] = useState<NotificationPrefs | null>(null)
  const [digestError, setDigestError] = useState<string | null>(null)

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
    auth.me()
      .then((me) => setIsAdmin(me.is_admin))
      .catch(() => setIsAdmin(false))
  }, [])
  useEffect(() => {
    notifications.getPrefs()
      .then(setDigestPrefs)
      .catch(() => setDigestError(t.settings.digestLoadError))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDigestPrefs(next: NotificationPrefs) {
    const prev = digestPrefs
    setDigestPrefs(next)  // optimistic
    setDigestError(null)
    try {
      const saved = await notifications.updatePrefs(next)
      setDigestPrefs(saved)
    } catch {
      setDigestPrefs(prev)
      setDigestError(t.settings.digestSaveError)
    }
  }

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

  function startEditing(loc: Location) {
    setEditingLocationId(loc.id)
    setEditName(loc.name)
    setEditIcon(loc.icon ?? '')
    setLocationError(null)
  }

  async function handleUpdateLocation(id: number) {
    if (!editName.trim()) return
    setLocationError(null)
    try {
      const body: Record<string, string> = { name: editName.trim() }
      if (editIcon.trim()) body.icon = editIcon.trim()
      await usersApi.updateLocation(id, body)
      setEditingLocationId(null)
      useFloreren.getState().load()
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : t.common.error)
    }
  }

  async function handleAddLocation() {
    if (!newLocationName.trim()) return
    setLocationError(null)
    try {
      const body: Record<string, string> = { name: newLocationName.trim() }
      if (newLocationIcon.trim()) body.icon = newLocationIcon.trim()
      setShowAddLocation(false)
      setNewLocationName('')
      setNewLocationIcon('')
      await apiRequest('POST', '/locations', { body })
      useFloreren.getState().load()
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : t.common.error)
    }
  }

  async function handleDeleteClick(loc: Location) {
    if (!window.confirm(t.settings.confirmDeleteLocation)) return
    setLocationError(null)
    try {
      await usersApi.deleteLocation(loc.id)
      useFloreren.getState().load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.common.error
      if (msg.includes('planten')) {
        setLocationError(t.settings.locationHasPlants)
      } else {
        setLocationError(msg)
      }
    }
  }

  async function handleReorder(loc: Location, direction: 'up' | 'down') {
    const sorted = [...locations].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((l) => l.id === loc.id)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx >= sorted.length - 1) return
    const newOrder = direction === 'up' ? sorted[idx].sort_order - 1 : sorted[idx].sort_order + 1
    try {
      await usersApi.updateLocation(loc.id, { sort_order: newOrder })
      useFloreren.getState().load()
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : t.common.error)
    }
  }

  function LocationOrderButtons({ loc, locations, onReorder }: { loc: Location; locations: Location[]; onReorder: (loc: Location, dir: 'up' | 'down') => void }) {
    const sorted = [...locations].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((l) => l.id === loc.id)
    const isFirst = idx === 0
    const isLast = idx === sorted.length - 1
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={() => onReorder(loc, 'up')}
          disabled={isFirst}
          className="w-6 h-4 flex items-center justify-center text-text-muted hover:text-text active:scale-90 transition-all disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none"
          title={t.settings.moveUp}
        >
          &#9650;
        </button>
        <button
          onClick={() => onReorder(loc, 'down')}
          disabled={isLast}
          className="w-6 h-4 flex items-center justify-center text-text-muted hover:text-text active:scale-90 transition-all disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none"
          title={t.settings.moveDown}
        >
          &#9660;
        </button>
      </div>
    )
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
        <h2 className="text-base font-bold mb-3">{t.settings.digestTitle}</h2>
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-sm">{t.settings.digestToggle}</div>
              <div className="text-xs text-text-muted mt-0.5">{t.settings.digestToggleDesc}</div>
            </div>
            <button
              onClick={() => digestPrefs && saveDigestPrefs({ ...digestPrefs, digest_enabled: !digestPrefs.digest_enabled })}
              disabled={!digestPrefs}
              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${digestPrefs?.digest_enabled ? 'bg-primary' : 'bg-border'} ${!digestPrefs ? 'opacity-50' : ''}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${digestPrefs?.digest_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {digestPrefs?.digest_enabled && (
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
              <div>
                <div className="font-semibold text-sm">{t.settings.digestTimeLabel}</div>
                <div className="text-xs text-text-muted mt-0.5">{t.settings.digestTimeDesc}</div>
              </div>
              <select
                value={`${digestPrefs.digest_time.slice(0, 2)}:00`}
                onChange={(e) => saveDigestPrefs({ ...digestPrefs, digest_time: e.target.value })}
                className="flex-shrink-0 bg-surface border border-border rounded-xl px-3 py-2 text-sm font-semibold text-text"
              >
                {Array.from({ length: 24 }, (_, h) => {
                  const value = `${String(h).padStart(2, '0')}:00`
                  return <option key={value} value={value}>{value}</option>
                })}
              </select>
            </div>
          )}
          {digestError && <p className="text-sm text-fiery-red">{digestError}</p>}
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
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 active:scale-90 transition-all text-xs font-bold opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
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
          {locations.map((loc) => {
            const isEditing = editingLocationId === loc.id
            return (
              <div key={loc.id} className="flex items-center gap-2 px-4 py-2.5">
                {isEditing ? (
                  <>
                    <input
                      className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium outline-none focus:border-primary/50"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t.settings.locationNamePlaceholder}
                    />
                    <input
                      className="w-10 h-10 rounded-lg border border-border bg-surface text-center text-xl outline-none focus:border-primary/50"
                      value={editIcon}
                      onChange={(e) => setEditIcon(e.target.value)}
                      maxLength={2}
                    />
                    <button
                      onClick={() => handleUpdateLocation(loc.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-white text-sm font-bold active:scale-90 transition-transform"
                      title={t.settings.save}
                    >
                      &#10003;
                    </button>
                    <button
                      onClick={() => setEditingLocationId(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border text-text text-sm active:scale-90 transition-transform"
                      title={t.settings.cancel}
                    >
                      &#10005;
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-shrink-0 w-8 text-center text-xl">{loc.icon}</span>
                    <span className="flex-1 min-w-0 font-medium text-sm truncate">{loc.name}</span>
                    <button
                      onClick={() => startEditing(loc)}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface active:scale-90 transition-all text-xs"
                      title={t.settings.rename}
                    >
                      &#9998;
                    </button>
                    <LocationOrderButtons loc={loc} locations={locations} onReorder={handleReorder} />
                    <button
                      onClick={() => handleDeleteClick(loc)}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:bg-red-50 active:scale-90 transition-all text-xs"
                      title={t.settings.deleteLocation}
                    >
                      &#128465;
                    </button>
                  </>
                )}
              </div>
            )
          })}
          {showAddLocation && (
            <div className="flex items-center gap-2 px-4 py-2.5">
              <input
                className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium outline-none focus:border-primary/50"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder={t.settings.locationNamePlaceholder}
                autoFocus
              />
              <input
                className="w-10 h-10 rounded-lg border border-border bg-surface text-center text-xl outline-none focus:border-primary/50"
                value={newLocationIcon}
                onChange={(e) => setNewLocationIcon(e.target.value)}
                maxLength={2}
                placeholder="&#127793;"
              />
              <button
                onClick={handleAddLocation}
                disabled={!newLocationName.trim()}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-white text-sm font-bold active:scale-90 transition-transform disabled:opacity-40"
                title={t.settings.save}
              >
                &#10003;
              </button>
              <button
                onClick={() => setShowAddLocation(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border text-text text-sm active:scale-90 transition-transform"
                title={t.settings.cancel}
              >
                &#10005;
              </button>
            </div>
          )}
          {!showAddLocation && (
            <button
              onClick={() => setShowAddLocation(true)}
              className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-primary active:bg-surface/50 transition-colors"
            >
              <span className="text-lg">+</span>
              {t.settings.addLocation}
            </button>
          )}
        </div>
        {locationError && (
          <p className="mt-2 text-sm text-fiery-red">{locationError}</p>
        )}
      </section>

      {isAdmin && (
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
      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">{t.settings.about}</h2>
        <div className="card p-4">
          <p className="text-sm text-text-muted">
            <span className="font-bold text-primary text-base">Floreren</span> v{__APP_VERSION__} · {__BUILD_HASH__}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Plant care for {activeUser?.name ?? 'your'}'s garden 🌱
          </p>
        </div>
      </section>

      <section className="mt-8 mb-4">
        <button
          onClick={() => { clearToken(); navigate('/login') }}
          className="w-full py-3 rounded-xl border border-red-400/30 text-red-400 font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          {t.settings.logout}
        </button>
      </section>

      {isAdmin && (
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

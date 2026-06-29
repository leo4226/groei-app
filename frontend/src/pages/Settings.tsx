import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import { apiRequest, icons, auth, household, notifications, dataExport, type NotificationPrefs, users as usersApi } from '../api/client'
import type { Location } from '../types'
import { clearToken } from '../api/auth'
import type { HouseholdMember } from '../api/client'
import type { IconSyncResult } from '../types'
import { enablePush, disablePush, pushSupported, iosNeedsInstall } from '../utils/push'
import PageMasthead from '../components/ui/PageMasthead'
import Glyph from '../components/ui/Glyph'
import Avatar from '../components/ui/Avatar'
import type { PlantIcon } from '../types'

const GROUP_OUTDOOR_KEY = 'floreren-group-outdoor-warnings'
// Must match the boot script in index.html, which applies the theme before
// React loads to avoid a flash of the wrong theme.
const THEME_KEY = 'floreren-theme'

export default function Settings() {
  const { users, locations, activeUserId, setActiveUser, updateUserLanguage: updateUserLanguageFn } = useFloreren()
  const [groupOutdoor, setGroupOutdoor] = useState(() => localStorage.getItem(GROUP_OUTDOOR_KEY) !== 'false')
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return (stored as 'light' | 'dark' | 'system' | null) ?? 'system'
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
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
  const [pushBusy, setPushBusy] = useState(false)
  const [pushTestBusy, setPushTestBusy] = useState(false)
  const [pushTestMsg, setPushTestMsg] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState<'json' | 'csv' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportReady, setExportReady] = useState(false)

  // Profile state
  const [profileName, setProfileName] = useState('')
  const [profileAvatar, setProfileAvatar] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [passwordChanging, setPasswordChanging] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState('')
  const [householdSaving, setHouseholdSaving] = useState(false)
  const [householdSaved, setHouseholdSaved] = useState(false)
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([])
  const [householdLoadError, setHouseholdLoadError] = useState<string | null>(null)

  const [iconCatalog, setIconCatalog] = useState<PlantIcon[]>([])
  const [catalogError, setCatalogError] = useState(false)

  useEffect(() => {
    icons.catalog().then(setIconCatalog).catch(() => setCatalogError(true))
  }, [])

  async function handleSaveProfile() {
    if (!activeUserId || !profileName.trim()) return
    setProfileSaving(true)
    setProfileSaved(false)
    try {
      await usersApi.updateUser(activeUserId, { name: profileName.trim(), avatar: profileAvatar || undefined })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
      useFloreren.getState().load()
    } catch (e) {
      console.error('Failed to save profile', e)
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleChangePassword() {
    setPasswordError(null)
    setPasswordChanged(false)
    if (newPasswordVal.length < 8) {
      setPasswordError(t.settings.passwordMinLength)
      return
    }
    setPasswordChanging(true)
    try {
      await auth.changePassword({ current_password: currentPassword, new_password: newPasswordVal })
      setPasswordChanged(true)
      setCurrentPassword('')
      setNewPasswordVal('')
      setTimeout(() => setPasswordChanged(false), 2500)
    } catch (e) {
      setPasswordError(t.settings.passwordError)
    } finally {
      setPasswordChanging(false)
    }
  }

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
                  <span className="text-primary"><Glyph name="check" size={18} /></span>
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
    auth.me()
      .then((me) => {
        setProfileName(me.name)
        setProfileAvatar(me.avatar ?? '')
        setProfileEmail(me.email)
        setHouseholdName(me.household_name)
      })
      .catch(() => setProfileLoadError('Failed to load profile'))
  }, [])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function applyTheme(t: 'light' | 'dark' | 'system') {
    const resolved = t === 'system' ? (systemDark ? 'dark' : 'light') : t
    document.documentElement.setAttribute('data-theme', resolved)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', resolved === 'dark' ? '#1A1D1A' : '#2D6A4F')
    }
  }

  useEffect(() => {
    applyTheme(theme)
  }, [theme, systemDark])

  function setTheme(next: 'light' | 'dark' | 'system') {
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
  }

  useEffect(() => {
    household.members()
      .then(setHouseholdMembers)
      .catch(() => setHouseholdLoadError('Failed to load members'))
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

  async function handlePushToggle() {
    if (!digestPrefs || pushBusy) return
    setPushBusy(true)
    setDigestError(null)
    try {
      if (digestPrefs.push_enabled) {
        await disablePush()
        await saveDigestPrefs({ ...digestPrefs, push_enabled: false })
      } else {
        await enablePush()
        await saveDigestPrefs({ ...digestPrefs, push_enabled: true })
      }
    } catch (e) {
      setDigestError(
        e instanceof Error && e.message === 'permission-denied'
          ? t.settings.pushDenied
          : t.settings.digestSaveError,
      )
    } finally {
      setPushBusy(false)
    }
  }

  async function handleTestPush() {
    if (pushTestBusy) return
    setPushTestBusy(true)
    setPushTestMsg(null)
    try {
      const r = await notifications.pushTest()
      const messages: Record<typeof r.result, string> = {
        ok: t.settings.pushTestOk,
        no_subscription: t.settings.pushTestNoSub,
        vapid_unconfigured: t.settings.pushTestVapid,
        all_gone: t.settings.pushTestGone,
        all_failed: t.settings.pushTestFailed,
      }
      setPushTestMsg(messages[r.result] ?? t.settings.pushTestFailed)
    } catch {
      setPushTestMsg(t.settings.pushTestFailed)
    } finally {
      setPushTestBusy(false)
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

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function handleDownloadExport(kind: 'json' | 'csv') {
    setExportBusy(kind)
    setExportError(null)
    setExportReady(false)
    try {
      const blob = kind === 'json'
        ? await dataExport.bundle()
        : await dataExport.careLogCsv()
      const day = new Date().toISOString().slice(0, 10)
      downloadBlob(
        blob,
        kind === 'json'
          ? `floreren-export-${day}.json`
          : `floreren-care-log-${day}.csv`,
      )
      setExportReady(true)
      setTimeout(() => setExportReady(false), 2500)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : t.settings.downloadError)
    } finally {
      setExportBusy(null)
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
          className="w-6 h-4 flex items-center justify-center text-text-muted hover:text-text active:scale-90 transition-all disabled:opacity-20 disabled:cursor-not-allowed leading-none"
          title={t.settings.moveUp}
        >
          <Glyph name="chevron-up" size={12} />
        </button>
        <button
          onClick={() => onReorder(loc, 'down')}
          disabled={isLast}
          className="w-6 h-4 flex items-center justify-center text-text-muted hover:text-text active:scale-90 transition-all disabled:opacity-20 disabled:cursor-not-allowed leading-none"
          title={t.settings.moveDown}
        >
          <Glyph name="chevron-down" size={12} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <PageMasthead
        eyebrow={t.settings.mastheadEyebrow}
        title={t.settings.mastheadTitle}
        accent={t.settings.mastheadAccent}
        lede={t.settings.mastheadLede}
      />
      <div className="px-4 pt-6 md:px-8 md:max-w-[900px] lg:max-w-[1100px] mx-auto">

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.profile}</h2>
        <div className="card p-4 space-y-4">
          {profileLoadError && (
            <p className="text-sm text-fiery-red">{profileLoadError}</p>
          )}

          {/* Avatar + Name row (side by side on desktop) */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            {/* Avatar — pick from the plant-icon catalog */}
            <div className="sm:min-w-[4.5rem]">
              <label className="block text-sm font-semibold mb-1.5">{t.settings.profileAvatar}</label>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20 active:scale-90 transition-transform overflow-hidden"
              >
                <Avatar value={profileAvatar} size={40} />
              </button>
              {showEmojiPicker && (
                <div className="mt-2 p-3 bg-surface border border-border rounded-xl grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                  {iconCatalog.length === 0 && (
                    <p className="col-span-6 text-xs text-text-muted py-2 text-center">
                      {catalogError ? t.common.error : t.common.loading}
                    </p>
                  )}
                  {iconCatalog.map((icon) => (
                    <button
                      key={icon.id}
                      onClick={() => { setProfileAvatar(icon.id); setShowEmojiPicker(false) }}
                      title={icon.name}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all active:scale-90 ${
                        profileAvatar === icon.id ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-primary/10'
                      }`}
                    >
                      <Avatar value={icon.id} size={34} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Name */}
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-1.5">{t.settings.profileName}</label>
              <input
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder={t.settings.profileName}
              />
            </div>
          </div>

          {/* Email (display-only) */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">{t.settings.profileEmail}</label>
            <div className="w-full rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm font-medium text-text-muted">
              {profileEmail}
            </div>
          </div>

          {/* Save profile button */}
          <button
            onClick={handleSaveProfile}
            disabled={profileSaving || !profileName.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {profileSaving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t.common.saving}</>
            ) : profileSaved ? (
              <>{t.settings.profileSaved}</>
            ) : (
              <>{t.settings.save}</>
            )}
          </button>

          {/* Change password */}
          <div className="pt-3 border-t border-border">
            <button
              onClick={() => setShowChangePassword(!showChangePassword)}
              className="w-full py-2.5 rounded-xl border border-border text-text font-semibold text-sm active:scale-[0.98] transition-transform"
            >
              {t.settings.changePassword}
            </button>
            {showChangePassword && (
              <div className="mt-3 space-y-3">
                <input
                  type="password"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t.settings.currentPassword}
                />
                <input
                  type="password"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder={t.settings.newPassword}
                />
                <p className="text-[11px] text-text-muted">{t.settings.passwordMinLength}</p>
                <button
                  onClick={handleChangePassword}
                  disabled={passwordChanging || !currentPassword || !newPasswordVal}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {passwordChanging ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t.common.saving}</>
                  ) : passwordChanged ? (
                    <>{t.settings.passwordChanged}</>
                  ) : (
                    <>{t.settings.changePassword}</>
                  )}
                </button>
                {passwordError && (
                  <p className="text-sm text-fiery-red">{passwordError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.display}</h2>
        <div className="card p-4 space-y-4">
          {/* Theme toggle */}
          <div>
            <div className="font-semibold text-sm mb-2">{t.settings.themeLabel}</div>
            <div className="grid grid-cols-3 gap-2">
              {([['light', t.settings.themeLight, 'sun'], ['dark', t.settings.themeDark, 'moon'], ['system', t.settings.themeSystem, 'monitor']] as const).map(([value, label, glyph]) => {
                const isActive = theme === value
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`py-2 px-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-surface border border-border text-text hover:border-primary/30'
                    }`}
                  >
                    <Glyph name={glyph} size={15} /> {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Group warnings toggle */}
          <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
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
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.digestTitle}</h2>
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
          <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
            <div>
              <div className="font-semibold text-sm">{t.settings.pushToggle}</div>
              <div className="text-xs text-text-muted mt-0.5">
                {iosNeedsInstall() ? t.settings.pushIosHint
                  : !pushSupported() ? t.settings.pushUnsupported
                  : t.settings.pushToggleDesc}
              </div>
            </div>
            <button
              onClick={handlePushToggle}
              disabled={!digestPrefs || pushBusy || !pushSupported() || iosNeedsInstall()}
              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${digestPrefs?.push_enabled ? 'bg-primary' : 'bg-border'} ${(!digestPrefs || pushBusy || !pushSupported() || iosNeedsInstall()) ? 'opacity-50' : ''}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${digestPrefs?.push_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {digestPrefs?.push_enabled && pushSupported() && (
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
              <div className="min-w-0">
                <div className="font-semibold text-sm">{t.settings.pushTestButton}</div>
                {pushTestMsg && <div className="text-xs text-text-muted mt-0.5">{pushTestMsg}</div>}
              </div>
              <button
                onClick={handleTestPush}
                disabled={pushTestBusy}
                className={`flex-shrink-0 px-3 py-2 rounded-xl border border-border text-sm font-semibold text-text bg-surface hover:border-primary/50 transition-colors ${pushTestBusy ? 'opacity-50' : ''}`}
              >
                {pushTestBusy ? t.settings.pushTestSending : t.settings.pushTestButton}
              </button>
            </div>
          )}
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
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.dataSectionTitle}</h2>
        <div className="card p-4 space-y-4 border border-primary/15 bg-gradient-to-br from-primary/5 via-surface to-surface">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Glyph name="check" size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-heading text-lg font-bold text-text">{t.settings.dataTitle}</h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">{t.settings.dataDescription}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => handleDownloadExport('json')}
              disabled={exportBusy !== null}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {exportBusy === 'json' ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t.settings.downloading}</>
              ) : (
                <>{t.settings.downloadData}</>
              )}
            </button>
            <button
              onClick={() => handleDownloadExport('csv')}
              disabled={exportBusy !== null}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full border border-border bg-surface text-text font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {exportBusy === 'csv' ? (
                <><span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> {t.settings.downloading}</>
              ) : (
                <>{t.settings.downloadCareLogCsv}</>
              )}
            </button>
          </div>
          {exportReady && <p className="text-sm text-primary">{t.settings.downloadReady}</p>}
          {exportError && <p className="text-sm text-fiery-red">{exportError}</p>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.householdTitle}</h2>
        <div className="card p-4 space-y-4">
          {/* Editable household name */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">{t.settings.householdName}</label>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder={t.settings.householdNamePlaceholder}
              />
              <button
                onClick={async () => {
                  if (!householdName.trim()) return
                  setHouseholdSaving(true)
                  setHouseholdSaved(false)
                  try {
                    await household.rename(householdName.trim())
                    setHouseholdSaved(true)
                    setTimeout(() => setHouseholdSaved(false), 2000)
                  } catch (e) {
                    console.error('Failed to rename household', e)
                  } finally {
                    setHouseholdSaving(false)
                  }
                }}
                disabled={householdSaving || !householdName.trim()}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary text-white text-sm font-bold active:scale-90 transition-transform disabled:opacity-40"
              >
                {householdSaving ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : householdSaved ? (
                  <Glyph name="check" size={15} />
                ) : (
                  <span className="text-sm">{t.settings.save}</span>
                )}
              </button>
            </div>
          </div>

          {/* Member cards with email + join date */}
          <div className="pt-2 border-t border-border">
            <label className="block text-sm font-semibold mb-2">{t.settings.whoIsGardening}</label>
            {householdLoadError && (
              <p className="text-sm text-fiery-red mb-2">{householdLoadError}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {householdMembers.length > 0
                ? householdMembers.map((member) => {
                    const localUser = users.find((u) => u.name === member.name)
                    const userId = localUser?.id
                    return (
                      <div key={member.id} className="relative group">
                        <button
                          onClick={() => userId && setActiveUser(userId)}
                          className={`card p-4 flex flex-col items-center gap-2 transition-all w-full ${
                            userId === activeUserId
                              ? 'ring-2 ring-primary border-primary/20'
                              : 'hover:border-primary/20'
                          }`}
                        >
                          <Avatar value={member.avatar || users.find(u => u.name === member.name)?.avatar} size={44} />
                          <span className={`font-semibold ${userId === activeUserId ? "text-primary" : "text-text"}`}>
                            {member.name}
                          </span>
                          <span className="text-[11px] text-text-muted">{member.email}</span>
                          <span className="text-[10px] text-text-muted">
                            {t.settings.memberJoined} {new Date(member.created_at).toLocaleDateString()}
                          </span>
                          {userId === activeUserId && (
                            <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                              {t.settings.active}
                            </span>
                          )}
                        </button>
                        {userId && userId !== activeUserId && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (!window.confirm(t.settings.removeConfirm + ' ' + member.name + '?')) return
                              try {
                                await household.removeMember(userId)
                                useFloreren.getState().load()
                                setHouseholdMembers(prev => prev.filter(m => m.id !== member.id))
                              } catch (e) {
                                alert(e instanceof Error ? e.message : t.settings.removeError)
                              }
                            }}
                            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 active:scale-90 transition-all text-xs font-bold opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            title={t.settings.removeMember}
                          >
                            <Glyph name="x" size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })
                : users.map((user) => (
                    <div key={user.id} className="relative group">
                      <button
                        onClick={() => setActiveUser(user.id)}
                        className={`card p-4 flex flex-col items-center gap-2 transition-all w-full ${
                          user.id === activeUserId
                            ? 'ring-2 ring-primary border-primary/20'
                            : 'hover:border-primary/20'
                        }`}
                      >
                        <Avatar value={user.avatar} size={44} />
                        <span className={`font-semibold ${user.id === activeUserId ? "text-primary" : "text-text"}`}>
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
                            if (!window.confirm(t.settings.removeConfirm + ' ' + user.name + '?')) return
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
                          {String.fromCharCode(10005)}
                        </button>
                      )}
                    </div>
                  ))}
            </div>
          </div>

          {/* Invite section */}
          <div className="pt-2 border-t border-border">
            <label className="block text-sm font-semibold mb-1.5">{t.settings.inviteTitle}</label>
            <p className="text-xs text-text-muted mb-3">{t.settings.inviteDescription}</p>
            <InviteSection />
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.language}</h2>
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
                <span className="w-9 h-9 flex items-center justify-center rounded-full bg-primary/10 text-primary font-mono text-xs font-bold tracking-wider">{lang === 'nl' ? 'NL' : 'EN'}</span>
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
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.locations}</h2>
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
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-white active:scale-90 transition-transform"
                      title={t.settings.save}
                    >
                      <Glyph name="check" size={16} />
                    </button>
                    <button
                      onClick={() => setEditingLocationId(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border text-text active:scale-90 transition-transform"
                      title={t.settings.cancel}
                    >
                      <Glyph name="x" size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-shrink-0 w-8 text-center text-xl">{loc.icon}</span>
                    <span className="flex-1 min-w-0 font-medium text-sm truncate">{loc.name}</span>
                    <button
                      onClick={() => startEditing(loc)}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:bg-surface active:scale-90 transition-all"
                      title={t.settings.rename}
                    >
                      <Glyph name="edit" size={14} />
                    </button>
                    <LocationOrderButtons loc={loc} locations={locations} onReorder={handleReorder} />
                    <button
                      onClick={() => handleDeleteClick(loc)}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:bg-red-50 active:scale-90 transition-all"
                      title={t.settings.deleteLocation}
                    >
                      <Glyph name="trash" size={15} />
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
                className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-white active:scale-90 transition-transform disabled:opacity-40"
                title={t.settings.save}
              >
                <Glyph name="check" size={16} />
              </button>
              <button
                onClick={() => setShowAddLocation(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border text-text active:scale-90 transition-transform"
                title={t.settings.cancel}
              >
                <Glyph name="x" size={15} />
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
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.icons.title}</h2>
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
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.assistantTitle}</h2>
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
              {t.settings.resetAssistantDone}
            </p>
          )}
        </div>
      </section>
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"><span className="text-primary">§</span>{t.settings.about}</h2>
        <div className="card p-4">
          <p className="text-sm text-text-muted">
            <span className="font-bold text-primary text-base">Floreren</span> v{__APP_VERSION__} · {__BUILD_HASH__}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Plant care for {activeUser?.name ?? 'your'}'s garden
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
    </div>
  )
}

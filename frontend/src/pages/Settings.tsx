import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import { icons, type HouseholdMember, type NotificationPrefs } from '../api/client'
import type { IconSyncResult } from '../types'
import { clearToken } from '../api/auth'
import PageMasthead from '../components/ui/PageMasthead'
import Glyph from '../components/ui/Glyph'
import SettingsGroup from '../components/settings/SettingsGroup'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ReadOnlyBanner from '../components/ui/ReadOnlyBanner'
import { useCapabilities } from '../hooks/useCapabilities'
import InstallPromptSheet from '../components/install/InstallPromptSheet'
import YouPanel, { type Theme } from './settings/YouPanel'
import HouseholdPanel from './settings/HouseholdPanel'
import NotificationsPanel from './settings/NotificationsPanel'
import PlacesPanel from './settings/PlacesPanel'
import AppDataPanel from './settings/AppDataPanel'
import CalendarGroupingSettings from './settings/CalendarGroupingSettings'
import CareRhythmSettings from './settings/CareRhythmSettings'
import CalendarSubscriptionSettings from './settings/CalendarSubscriptionSettings'

// Must match the boot script in index.html, which applies the theme before
// React loads to avoid a flash of the wrong theme.
const THEME_KEY = 'floreren-theme'

/**
 * Settings, as six collapsible groups plus an admin one.
 *
 * This page had grown to eleven flat sections rendered fully expanded, laid out
 * in two desktop columns split by DOM position rather than meaning, with
 * placement driven by implementation detail (install-the-app filed under
 * notifications, because push depends on it). It read as a changelog of
 * everything ever added rather than something a person could navigate.
 *
 * The grouping is by what someone is trying to *do*: change something about
 * me; manage who else gardens here; tune care planning; control what
 * interrupts me; name my places; deal with the app itself. Each group carries
 * a one-line summary of its current state so the whole configuration is
 * readable without opening anything.
 */
export default function Settings() {
  const t = useT()
  const navigate = useNavigate()
  const { users, locations, activeUserId } = useFloreren()
  // The signed-in account now lives in the store (fetched by load() /
  // refreshAll()), so every capability-gated page reads the same source
  // instead of firing its own /auth/me.
  const me = useFloreren((s) => s.me)
  const loadMe = useFloreren((s) => s.loadMe)
  const { isViewer } = useCapabilities()
  // Panels gate their write controls on these server-derived flags; the safe
  // default while the account is still loading is not-allowed.
  const canEdit = me?.capabilities.can_edit ?? false
  const canManageHousehold = me?.capabilities.can_manage_household ?? false

  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return (stored as Theme | null) ?? 'system'
  })
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const [showInstall, setShowInstall] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  // Summary state, lifted so collapsed groups can describe themselves.
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [householdName, setHouseholdName] = useState('')
  const [profileName, setProfileName] = useState('')
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [pushOnHere, setPushOnHere] = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<IconSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Seed the page summaries from the store's account; fetch it only if the
  // app-wide load hasn't reached us yet (deep link / slow first load). The
  // panels take what they need as props rather than firing their own /auth/me.
  useEffect(() => {
    if (me) {
      setProfileName(me.name)
      setHouseholdName(me.household_name)
      return
    }
    loadMe()
  }, [me, loadMe])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
    document.documentElement.setAttribute('data-theme', resolved)
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#1A1D1A' : '#2D6A4F')
  }, [theme, systemDark])

  function setTheme(next: Theme) {
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
  }

  async function handleSyncIcons() {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      setSyncResult(await icons.sync())
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : t.common.error)
    } finally {
      setSyncing(false)
    }
  }

  const language = users.find((u) => u.id === activeUserId)?.language ?? 'nl'

  // ── Collapsed summaries ───────────────────────────────────────────────────
  const themeLabel = theme === 'light' ? t.settings.themeLight
    : theme === 'dark' ? t.settings.themeDark
      : t.settings.themeSystem

  const youSummary = [profileName, language === 'en' ? 'English' : 'Nederlands', themeLabel]
    .filter(Boolean).join(' · ')

  const householdSummary = useMemo(() => {
    const count = members.length
    const people = count === 1
      ? t.settings.memberCountOne
      : t.settings.memberCountMany.replace('{count}', String(count))
    return [householdName, count > 0 ? people : null].filter(Boolean).join(' · ')
  }, [householdName, members.length, t])

  const notificationsSummary = useMemo(() => {
    if (!prefs) return undefined
    const parts: string[] = []
    parts.push(prefs.digest_enabled
      ? t.settings.digestOnAt.replace('{time}', prefs.digest_time.slice(0, 5))
      : t.settings.digestOff)
    parts.push(pushOnHere ? t.settings.pushOn : t.settings.pushOff)
    return parts.join(' · ')
  }, [prefs, pushOnHere, t])

  const placesSummary = locations.length === 1
    ? t.settings.locationCountOne
    : t.settings.locationCountMany.replace('{count}', String(locations.length))

  return (
    <div>
      <PageMasthead
        eyebrow={t.settings.mastheadEyebrow}
        title={t.settings.mastheadTitle}
        accent={t.settings.mastheadAccent}
        lede={t.settings.mastheadLede}
        className="mx-auto w-full max-w-[900px] !px-[clamp(24px,3vw,56px)]"
      />

      {/* A single readable column: settings are a list you scan top to bottom,
          not a dashboard. The old two-column desktop grid split the sections by
          DOM position, so reading order jumped between columns mid-topic. */}
      <div className="mx-auto w-full max-w-[900px] space-y-3 px-4 pb-12 pt-6 md:px-[clamp(24px,3vw,56px)]">
        {isViewer && <ReadOnlyBanner />}

        <SettingsGroup
          id="you"
          icon="users"
          title={t.settings.groupYou}
          description={t.settings.groupYouDesc}
          summary={youSummary}
        >
          <YouPanel me={me} theme={theme} onThemeChange={setTheme} onProfileSaved={setProfileName} />
        </SettingsGroup>

        <SettingsGroup
          id="household"
          icon="home"
          title={t.settings.groupHousehold}
          description={t.settings.groupHouseholdDesc}
          summary={householdSummary}
        >
          <HouseholdPanel
            initialName={householdName}
            onMembersChange={setMembers}
            onHouseholdNameChange={setHouseholdName}
            canEdit={canEdit}
            canManageHousehold={canManageHousehold}
          />
        </SettingsGroup>

        <SettingsGroup
          id="care"
          icon="droplet"
          title={t.settings.groupCare}
          description={t.settings.groupCareDesc}
          summary={t.settings.groupCareSummary}
        >
          <div className="space-y-3">
            <CareRhythmSettings canEdit={canEdit} />
            <CalendarGroupingSettings embedded canEdit={canEdit} />
            <CalendarSubscriptionSettings canEdit={canEdit} />
          </div>
        </SettingsGroup>

        <SettingsGroup
          id="notifications"
          icon="alert"
          title={t.settings.groupNotifications}
          description={t.settings.groupNotificationsDesc}
          summary={notificationsSummary}
        >
          <NotificationsPanel
            canEdit={canEdit}
            onPrefsChange={(p, push) => { setPrefs(p); setPushOnHere(push) }}
          />
        </SettingsGroup>

        <SettingsGroup
          id="places"
          icon="pin"
          title={t.settings.groupPlaces}
          description={t.settings.groupPlacesDesc}
          summary={placesSummary}
        >
          <PlacesPanel canEdit={canEdit} />
        </SettingsGroup>

        <SettingsGroup
          id="app"
          icon="monitor"
          title={t.settings.groupApp}
          description={t.settings.groupAppDesc}
          summary={`v${__APP_VERSION__}`}
        >
          <AppDataPanel onInstallClick={() => setShowInstall(true)} />
        </SettingsGroup>

        {/* Admin tools are grouped and badged rather than interleaved with the
            user's own settings, where they used to sit between Locations and
            the assistant reset. */}
        {me?.is_admin && (
          <SettingsGroup
            id="admin"
            icon="wrench"
            title={t.settings.groupAdmin}
            description={t.settings.groupAdminDesc}
            badge={t.settings.adminBadge}
          >
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold">{t.settings.icons.title}</div>
                <p className="mt-1 text-xs text-text-muted">{t.settings.icons.description}</p>
                <button
                  onClick={handleSyncIcons}
                  disabled={syncing}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {syncing ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t.settings.icons.syncing}</>
                  ) : (
                    <><Glyph name="refresh" size={15} /> {t.settings.icons.syncButton}</>
                  )}
                </button>

                {syncError && (
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-fiery-red">
                    <Glyph name="alert" size={14} className="mt-0.5 shrink-0" />
                    {syncError}
                  </p>
                )}

                {/* The result used to be two bare sentences with the plant names
                    comma-joined into them, which read as a wall of text and gave
                    no sense of scale. Lead with the counts. */}
                {syncResult && (
                  <div className="mt-3 space-y-2 rounded-xl border border-border bg-bg p-3">
                    {syncResult.matched_plants > 0 ? (
                      <div>
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                          <Glyph name="check" size={14} />
                          {t.settings.icons.linkedCount.replace(
                            '{count}', String(syncResult.matched_plants),
                          )}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          {syncResult.matches.map((m) => m.plant_name).join(' · ')}
                        </p>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-sm text-text-muted">
                        <Glyph name="check" size={14} />
                        {syncResult.unmatched_plants > 0
                          ? t.settings.icons.noChanges
                          : t.settings.icons.upToDate}
                      </p>
                    )}

                    {syncResult.unmatched_plants > 0 && (
                      <div className="border-t border-border pt-2">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-500">
                          <Glyph name="alert" size={14} />
                          {t.settings.icons.stillMissingCount.replace(
                            '{count}', String(syncResult.unmatched_plants),
                          )}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          {syncResult.unmatched.map((u) => u.plant_name).join(' · ')}
                        </p>
                        <p className="mt-1.5 text-xs text-text-muted">
                          {t.settings.icons.setManually}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <a
                href="/admin"
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-text no-underline transition-colors hover:border-primary/50"
              >
                {t.settings.adminPanel}
                <Glyph name="chevron-right" size={15} />
              </a>
            </div>
          </SettingsGroup>
        )}

        {/* Sign out sits outside the groups: it is an exit, not a setting. */}
        <button
          onClick={() => setConfirmLogout(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 py-3 text-sm font-semibold text-red-400 transition-transform active:scale-[0.98]"
        >
          <Glyph name="lock" size={15} />
          {t.settings.logout}
        </button>
      </div>

      {showInstall && <InstallPromptSheet onClose={() => setShowInstall(false)} />}

      {confirmLogout && (
        <ConfirmDialog
          title={t.settings.logout}
          message={t.settings.logoutConfirm}
          confirmLabel={t.settings.logout}
          cancelLabel={t.settings.cancel}
          destructive
          onConfirm={() => { clearToken(); navigate('/login') }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  )
}

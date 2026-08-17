import { useEffect, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import { notifications, type NotificationPrefs } from '../../api/client'
import {
  enablePush, disablePush, pushSupported, pushAvailabilityInfo, isPushSubscribedHere,
} from '../../utils/push'

// Backend care_type keys a user can mute for scheduled care push reminders.
const PUSH_CARE_TYPES = [
  'water', 'fertilize', 'prune', 'mist', 'rotate', 'repot', 'pest_check', 'dust',
] as const

interface Props {
  onPrefsChange?: (prefs: NotificationPrefs | null, pushOnHere: boolean) => void
  /** Viewer mode: every notification write (prefs, push, test) renders
   * disabled; the current state stays visible. */
  canEdit?: boolean
}

function Row({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {description && <div className="mt-0.5 text-xs text-text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, disabled, onClick, label }: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-border'} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

/**
 * Digest and push settings.
 *
 * "Install the app" used to live in this section, because push needs the PWA
 * installed — a build reason, not a user reason. It now sits under App & data
 * where someone would look for it, and the push row explains the dependency
 * itself when the platform needs it.
 */
export default function NotificationsPanel({ onPrefsChange, canEdit = true }: Props) {
  const t = useT()
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pushOnHere, setPushOnHere] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const writeDisabled = !canEdit

  useEffect(() => {
    notifications.getPrefs()
      .then(setPrefs)
      .catch(() => setError(t.settings.digestLoadError))
    isPushSubscribedHere().then(setPushOnHere)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Report upward from the rendered state rather than from inside the fetches.
  // Doing it in the `.then()` callbacks meant each one sent the *other* value
  // as captured at mount, so whichever request resolved second overwrote the
  // first with a stale null — the collapsed summary would come up blank.
  useEffect(() => {
    onPrefsChange?.(prefs, pushOnHere)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, pushOnHere])

  async function save(next: NotificationPrefs) {
    const prev = prefs
    setPrefs(next)  // optimistic
    setError(null)
    try {
      const saved = await notifications.updatePrefs(next)
      setPrefs(saved)
      onPrefsChange?.(saved, pushOnHere)
    } catch {
      setPrefs(prev)
      setError(t.settings.digestSaveError)
    }
  }

  async function togglePush() {
    if (!prefs || pushBusy) return
    setPushBusy(true)
    setError(null)
    try {
      // Only *this* device's subscription. Delivery is driven by the presence
      // of push_subscriptions rows, so unsubscribing here can't silence another
      // device — there is no account-wide flag to write.
      if (pushOnHere) {
        await disablePush()
        setPushOnHere(false)
        onPrefsChange?.(prefs, false)
      } else {
        await enablePush()
        setPushOnHere(true)
        onPrefsChange?.(prefs, true)
      }
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'permission-denied'
          ? t.settings.pushDenied
          : t.settings.digestSaveError,
      )
    } finally {
      setPushBusy(false)
    }
  }

  async function sendTest() {
    if (testBusy) return
    setTestBusy(true)
    setTestMsg(null)
    try {
      const r = await notifications.pushTest()
      const messages: Record<typeof r.result, string> = {
        ok: t.settings.pushTestOk,
        no_subscription: t.settings.pushTestNoSub,
        vapid_unconfigured: t.settings.pushTestVapid,
        all_gone: t.settings.pushTestGone,
        all_failed: t.settings.pushTestFailed,
      }
      setTestMsg(messages[r.result] ?? t.settings.pushTestFailed)
    } catch {
      setTestMsg(t.settings.pushTestFailed)
    } finally {
      setTestBusy(false)
    }
  }

  const availability = pushAvailabilityInfo().state
  const pushHint =
    availability === 'ios-not-standalone' ? t.settings.pushIosHint
      : availability === 'ios-standalone-unsupported' ? t.settings.pushIosReinstallHint
        : availability === 'unsupported' ? t.settings.pushUnsupported
          : t.settings.pushToggleDesc

  return (
    <div className="space-y-3">
      <Row label={t.settings.digestToggle} description={t.settings.digestToggleDesc}>
        <Toggle
          on={Boolean(prefs?.digest_enabled)}
          disabled={!prefs || writeDisabled}
          label={t.settings.digestToggle}
          onClick={() => prefs && save({ ...prefs, digest_enabled: !prefs.digest_enabled })}
        />
      </Row>

      {prefs?.digest_enabled && (
        <Row label={t.settings.digestTimeLabel} description={t.settings.digestTimeDesc}>
          <select
            aria-label={t.settings.digestTimeLabel}
            disabled={writeDisabled}
            value={`${prefs.digest_time.slice(0, 2)}:00`}
            onChange={(e) => save({ ...prefs, digest_time: e.target.value })}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-text disabled:opacity-50"
          >
            {HOURS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Row>
      )}

      <Row label={t.settings.pushToggle} description={pushHint}>
        <Toggle
          on={pushOnHere}
          disabled={!prefs || pushBusy || writeDisabled || availability !== 'supported'}
          label={t.settings.pushToggle}
          onClick={togglePush}
        />
      </Row>

      {pushOnHere && pushSupported() && prefs && (
        <>
          <Row label={t.settings.quietHoursLabel} description={t.settings.quietHoursDesc}>
            <div className="flex items-center gap-1.5">
              <select
                aria-label={t.settings.quietHoursStart}
                disabled={writeDisabled}
                value={`${(prefs.quiet_start ?? '21:00').slice(0, 2)}:00`}
                onChange={(e) => save({ ...prefs, quiet_start: e.target.value })}
                className="rounded-xl border border-border bg-surface px-2.5 py-2 text-sm font-semibold text-text disabled:opacity-50"
              >
                {HOURS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <span className="text-xs text-text-muted">–</span>
              <select
                aria-label={t.settings.quietHoursEnd}
                disabled={writeDisabled}
                value={`${(prefs.quiet_end ?? '08:00').slice(0, 2)}:00`}
                onChange={(e) => save({ ...prefs, quiet_end: e.target.value })}
                className="rounded-xl border border-border bg-surface px-2.5 py-2 text-sm font-semibold text-text disabled:opacity-50"
              >
                {HOURS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </Row>

          <div className="border-t border-border pt-3">
            <div className="text-sm font-semibold">{t.settings.mutedTypesLabel}</div>
            <div className="mb-2 mt-0.5 text-xs text-text-muted">{t.settings.mutedTypesDesc}</div>
            <div className="flex flex-wrap gap-2">
              {PUSH_CARE_TYPES.map((ct) => {
                const muted = prefs.muted_care_types.includes(ct)
                return (
                  <button
                    key={ct}
                    aria-pressed={!muted}
                    disabled={writeDisabled}
                    onClick={() => save({
                      ...prefs,
                      muted_care_types: muted
                        ? prefs.muted_care_types.filter((c) => c !== ct)
                        : [...prefs.muted_care_types, ct],
                    })}
                    className={`rounded-full border px-3 py-1.5 font-heading text-sm transition-colors ${
                      muted
                        ? 'border-border bg-paper text-text-muted line-through'
                        : 'border-primary bg-primary/10 font-medium text-primary'
                    }`}
                  >
                    {t.careTypes[ct as keyof typeof t.careTypes] ?? ct}
                  </button>
                )
              })}
            </div>
          </div>

          <Row label={t.settings.pushTestButton} description={testMsg ?? undefined}>
            <button
              onClick={sendTest}
              disabled={testBusy || writeDisabled}
              className={`rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary/50 ${
                testBusy || writeDisabled ? 'opacity-50' : ''
              }`}
            >
              {testBusy ? t.settings.pushTestSending : t.settings.pushTestButton}
            </button>
          </Row>
        </>
      )}

      {error && <p className="text-sm text-fiery-red">{error}</p>}
    </div>
  )
}

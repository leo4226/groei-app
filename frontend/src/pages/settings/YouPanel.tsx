import { useEffect, useState } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import { auth, household, icons, type AccountMe } from '../../api/client'
import type { PlantIcon } from '../../types'
import Glyph from '../../components/ui/Glyph'
import Avatar from '../../components/ui/Avatar'

export type Theme = 'light' | 'dark' | 'system'

interface Props {
  /** The signed-in account, fetched once by the page. */
  me: AccountMe | null
  theme: Theme
  onThemeChange: (next: Theme) => void
  /** Called after a successful save so the page summary stays in step. */
  onProfileSaved?: (name: string) => void
}

/**
 * Everything that is about *you*: your name and avatar, your password, and the
 * two preferences that follow you around the app (language and theme).
 *
 * Theme and language used to be separate top-level sections holding three and
 * two buttons respectively, while your profile sat somewhere else entirely.
 * They belong together — they are all "how the app is for me".
 *
 * Note this panel only ever edits the signed-in account. Editing another
 * household member is a deliberate action from the Household group, which says
 * whose profile it is opening; previously selecting a member card there
 * silently re-pointed this form at them with no visible change of heading.
 */
export default function YouPanel({ me, theme, onThemeChange, onProfileSaved }: Props) {
  const t = useT()
  const { users, activeUserId, updateUserLanguage } = useFloreren()

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [catalog, setCatalog] = useState<PlantIcon[]>([])
  const [catalogError, setCatalogError] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changing, setChanging] = useState(false)
  const [changed, setChanged] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Seeded from the page's single account fetch — this panel no longer makes
  // its own request, which is what turned one call on mount into three.
  useEffect(() => {
    if (!me) return
    setName(me.name)
    setAvatar(me.avatar ?? '')
  }, [me])

  // The icon catalog is only needed once the picker is opened.
  useEffect(() => {
    if (!pickerOpen || catalog.length > 0) return
    icons.catalog().then(setCatalog).catch(() => setCatalogError(true))
  }, [pickerOpen, catalog.length])

  async function handleSave() {
    if (!me || !name.trim()) return
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      const updated = await household.updateMember(me.id, {
        name: name.trim(),
        avatar: avatar || null,
      })
      setName(updated.name)
      setAvatar(updated.avatar ?? '')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onProfileSaved?.(updated.name)
      void useFloreren.getState().load()
    } catch (e) {
      // 409 is the one case worth naming: someone else already has this name.
      const status = (e as { status?: number }).status
      setSaveError(status === 409 ? t.settings.nameTakenError : t.settings.profileSaveError)
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    setPasswordError(null)
    setChanged(false)
    if (newPassword.length < 8) {
      setPasswordError(t.settings.passwordMinLength)
      return
    }
    setChanging(true)
    try {
      await auth.changePassword({ current_password: currentPassword, new_password: newPassword })
      setChanged(true)
      setCurrentPassword('')
      setNewPassword('')
      setTimeout(() => { setChanged(false); setShowPassword(false) }, 2000)
    } catch {
      setPasswordError(t.settings.passwordError)
    } finally {
      setChanging(false)
    }
  }

  const language = users.find((u) => u.id === activeUserId)?.language ?? 'nl'

  return (
    <div className="space-y-6">
      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">{t.settings.profileAvatar}</label>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-primary/10 transition-transform active:scale-90"
            >
              <Avatar value={avatar} size={40} />
            </button>
          </div>

          <div className="flex-1">
            <label htmlFor="profile-name" className="mb-1.5 block text-sm font-semibold">
              {t.settings.profileName}
            </label>
            <input
              id="profile-name"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.settings.profileName}
            />
          </div>
        </div>

        {pickerOpen && (
          <div className="grid max-h-56 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-border bg-surface p-3">
            {catalog.length === 0 && (
              <p className="col-span-6 py-2 text-center text-xs text-text-muted">
                {catalogError ? t.common.error : t.common.loading}
              </p>
            )}
            {catalog.map((icon) => (
              <button
                key={icon.id}
                onClick={() => { setAvatar(icon.id); setPickerOpen(false) }}
                title={icon.name}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all active:scale-90 ${
                  avatar === icon.id ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-primary/10'
                }`}
              >
                <Avatar value={icon.id} size={34} />
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold">{t.settings.profileEmail}</label>
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm font-medium text-text-muted">
            {me?.email ?? ''}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t.common.saving}</>
          ) : saved ? t.settings.profileSaved : t.settings.save}
        </button>
        {saveError && <p className="text-sm text-fiery-red">{saveError}</p>}
      </div>

      {/* ── Language ─────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <div className="mb-2 text-sm font-semibold">{t.settings.language}</div>
        <div className="grid grid-cols-2 gap-2">
          {(['nl', 'en'] as const).map((lang) => {
            const selected = language === lang
            return (
              <button
                key={lang}
                onClick={() => activeUserId && updateUserLanguage(activeUserId, lang)}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-[0.97] ${
                  selected
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-border bg-surface text-text hover:border-primary/30'
                }`}
              >
                <span className="font-mono text-[11px] tracking-wider">
                  {lang === 'nl' ? 'NL' : 'EN'}
                </span>
                {lang === 'nl' ? t.settings.languageNl : t.settings.languageEn}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Theme ────────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <div className="mb-2 text-sm font-semibold">{t.settings.themeLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['light', t.settings.themeLight, 'sun'],
            ['dark', t.settings.themeDark, 'moon'],
            ['system', t.settings.themeSystem, 'monitor'],
          ] as const).map(([value, label, glyph]) => (
            <button
              key={value}
              onClick={() => onThemeChange(value)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all active:scale-[0.97] ${
                theme === value
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border bg-surface text-text hover:border-primary/30'
              }`}
            >
              <Glyph name={glyph} size={15} /> {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-muted">{t.settings.themeDeviceHint}</p>
      </div>

      {/* ── Password ─────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <button
          onClick={() => setShowPassword((v) => !v)}
          aria-expanded={showPassword}
          className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-text transition-transform active:scale-[0.98]"
        >
          {t.settings.changePassword}
        </button>
        {showPassword && (
          <div className="mt-3 space-y-3">
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t.settings.currentPassword}
            />
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.settings.newPassword}
            />
            <p className="text-[11px] text-text-muted">{t.settings.passwordMinLength}</p>
            <button
              onClick={handleChangePassword}
              disabled={changing || !currentPassword || !newPassword}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {changing ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t.common.saving}</>
              ) : changed ? t.settings.passwordChanged : t.settings.changePassword}
            </button>
            {passwordError && <p className="text-sm text-fiery-red">{passwordError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

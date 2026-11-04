import { useEffect, useState } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import { auth, household, icons, type AccountMe } from '../../api/client'
import { clearToken } from '../../api/auth'
import type { PlantIcon } from '../../types'
import Glyph from '../../components/ui/Glyph'
import Avatar from '../../components/ui/Avatar'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

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
 * Everything that is about *you*: your name and avatar, your password, the two
 * preferences that follow you around the app (language and theme), and the
 * account itself (signing out everywhere, deleting it).
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
  // Name and avatar are what the rest of the household sees, so the backend
  // gates them by can_edit (PATCH /household/members/{id}). Language, theme,
  // password and the account itself are the caller's own, so viewers keep them.
  const canEdit = me?.capabilities.can_edit ?? false
  const onlyEditorsTitle = t.settings.onlyEditorsCanChange

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
  const [repeatPassword, setRepeatPassword] = useState('')
  const [revealPasswords, setRevealPasswords] = useState(false)
  const [changing, setChanging] = useState(false)
  const [changed, setChanged] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  // Only an owner can be blocked (others still in the household), so only an
  // owner's open needs the member count.
  const [otherMembers, setOtherMembers] = useState<number | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    if (newPassword !== repeatPassword) {
      setPasswordError(t.settings.passwordMismatch)
      return
    }
    setChanging(true)
    try {
      await auth.changePassword({ current_password: currentPassword, new_password: newPassword })
      setChanged(true)
      setCurrentPassword('')
      setNewPassword('')
      setRepeatPassword('')
      setTimeout(() => { setChanged(false); setShowPassword(false) }, 4000)
    } catch (e) {
      const status = (e as { status?: number }).status
      setPasswordError(
        status === 400 ? t.settings.passwordError
          : status === 429 ? t.settings.tooManyAttempts
            : t.common.error,
      )
    } finally {
      setChanging(false)
    }
  }

  async function handleLogoutAll() {
    setConfirmLogoutAll(false)
    setAccountError(null)
    try {
      await auth.logoutAll()
    } catch {
      setAccountError(t.settings.logoutAllError)
      return
    }
    // This token died with the rest; a full reload drops every cached store.
    clearToken()
    window.location.href = '/login'
  }

  function toggleDelete() {
    const next = !showDelete
    setShowDelete(next)
    setDeleteError(null)
    setDeletePassword('')
    if (next && me?.role === 'owner' && otherMembers === null) {
      household.members()
        .then((members) => setOtherMembers(members.filter((m) => !m.is_self).length))
        .catch(() => setOtherMembers(0))
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await auth.deleteAccount(deletePassword)
    } catch (e) {
      const status = (e as { status?: number }).status
      setDeleteError(
        status === 400 ? t.settings.deleteAccountWrongPassword
          : status === 409 ? t.settings.deleteAccountOwnerHasMembers
            : status === 429 ? t.settings.tooManyAttempts
              : t.settings.deleteAccountError,
      )
      setDeleting(false)
      return
    }
    clearToken()
    window.location.href = '/login'
  }

  const language = users.find((u) => u.id === activeUserId)?.language ?? 'nl'
  const isOwner = me?.role === 'owner'
  const ownerBlocked = isOwner && (otherMembers ?? 0) > 0
  const passwordInputType = revealPasswords ? 'text' : 'password'

  return (
    <div className="space-y-6">
      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">{t.settings.profileAvatar}</label>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              disabled={!canEdit}
              aria-expanded={pickerOpen}
              title={canEdit ? undefined : onlyEditorsTitle}
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-primary/10 transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
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
              disabled={!canEdit}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={saving || !name.trim() || !canEdit}
          title={canEdit ? undefined : onlyEditorsTitle}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
              type={passwordInputType}
              autoComplete="current-password"
              aria-label={t.settings.currentPassword}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t.settings.currentPassword}
            />
            <input
              type={passwordInputType}
              autoComplete="new-password"
              aria-label={t.settings.newPassword}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.settings.newPassword}
            />
            <input
              type={passwordInputType}
              autoComplete="new-password"
              aria-label={t.settings.newPasswordRepeat}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              placeholder={t.settings.newPasswordRepeat}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-text-muted">{t.settings.passwordMinLength}</p>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-text-muted">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={revealPasswords}
                  onChange={(e) => setRevealPasswords(e.target.checked)}
                />
                {t.settings.showPasswords}
              </label>
            </div>
            <button
              onClick={handleChangePassword}
              disabled={changing || !currentPassword || !newPassword || !repeatPassword}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {changing ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t.common.saving}</>
              ) : changed ? t.settings.passwordChanged : t.settings.changePassword}
            </button>
            {passwordError && <p className="text-sm text-fiery-red">{passwordError}</p>}
            {changed && <p className="text-sm text-text-muted">{t.settings.passwordSignedOutElsewhere}</p>}
          </div>
        )}
      </div>

      {/* ── Sessions & account ───────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <div className="mb-3 text-sm font-semibold">{t.settings.accountTitle}</div>

        {/* The button says what it does; the text beside it says when you'd want it. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="min-w-0 text-xs text-text-muted">{t.settings.logoutAllDesc}</p>
          <button
            onClick={() => setConfirmLogoutAll(true)}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary/50"
          >
            <Glyph name="lock" size={14} />
            {t.settings.logoutAll}
          </button>
        </div>
        {accountError && <p className="mt-2 text-sm text-fiery-red">{accountError}</p>}

        <div className="mt-4 rounded-xl border border-red-400/30 p-3" data-delete-account>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="min-w-0 text-xs text-text-muted">{t.settings.deleteAccountDesc}</p>
            <button
              onClick={toggleDelete}
              aria-expanded={showDelete}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/20"
            >
              <Glyph name="trash" size={14} />
              {t.settings.deleteAccount}
            </button>
          </div>

          {showDelete && (
            <div className="mt-3 space-y-3 border-t border-red-400/20 pt-3">
              {isOwner && otherMembers === null ? (
                <p className="text-xs text-text-muted">{t.common.loading}</p>
              ) : ownerBlocked ? (
                <p className="text-xs leading-relaxed text-text-soft" data-delete-account-blocked>
                  {t.settings.deleteAccountOwnerHasMembers}
                </p>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-text-soft" data-delete-account-warning>
                    {isOwner
                      ? t.settings.deleteAccountLastMemberWarning
                      : t.settings.deleteAccountMemberWarning(me?.household_name ?? '')}
                  </p>
                  {isOwner && (
                    <a href="#app" className="inline-block text-xs font-semibold text-primary underline">
                      {t.settings.deleteAccountExportFirst}
                    </a>
                  )}
                  <div>
                    <label htmlFor="delete-account-password" className="mb-1.5 block text-xs font-medium text-text-muted">
                      {t.settings.deleteAccountPasswordLabel}
                    </label>
                    <input
                      id="delete-account-password"
                      type="password"
                      autoComplete="current-password"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-red-400/60"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting || !deletePassword}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    {deleting ? (
                      <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t.common.saving}</>
                    ) : t.settings.deleteAccountConfirm}
                  </button>
                </>
              )}
              {deleteError && <p className="text-sm text-fiery-red" role="alert">{deleteError}</p>}
            </div>
          )}
        </div>
      </div>

      {confirmLogoutAll && (
        <ConfirmDialog
          title={t.settings.logoutAll}
          message={t.settings.logoutAllConfirm}
          confirmLabel={t.settings.logoutAll}
          cancelLabel={t.settings.cancel}
          destructive
          onConfirm={() => void handleLogoutAll()}
          onCancel={() => setConfirmLogoutAll(false)}
        />
      )}
    </div>
  )
}

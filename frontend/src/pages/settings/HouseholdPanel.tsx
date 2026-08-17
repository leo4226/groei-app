import { useEffect, useState } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import { household, icons, type HouseholdMember } from '../../api/client'
import type { PlantIcon } from '../../types'
import Glyph from '../../components/ui/Glyph'
import Avatar from '../../components/ui/Avatar'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

interface Props {
  /** Household name from the page's single account fetch. */
  initialName: string
  onMembersChange?: (members: HouseholdMember[]) => void
  onHouseholdNameChange?: (name: string) => void
  /** Server-derived write capability — gates the edit button (self-only for
   * editors, absent for viewers). Defaults to true for non-gated call sites. */
  canEdit?: boolean
  /** Server-derived household-admin capability — gates rename, invite (with
   * role choice), the role picker, remove and edit-other. Only the owner has
   * it. Defaults to true for non-gated call sites. */
  canManageHousehold?: boolean
}

function roleBadge(role: HouseholdMember['role'], t: ReturnType<typeof useT>): string {
  switch (role) {
    case 'owner': return t.settings.roleOwner
    case 'editor': return t.settings.roleEditor
    case 'viewer': return t.settings.roleViewer
  }
}

/**
 * The household: its name, who is in it, and how to invite someone.
 *
 * Editing another member is explicit here. It used to happen by side effect —
 * tapping a member card re-pointed the (separate, far-away) Profile section at
 * them, with nothing on screen saying so, and Save would silently rename that
 * person. Now their card has an edit button that opens a sheet naming exactly
 * whose profile is open.
 *
 * Read-only viewer mode (#935): the member list always shows every member with
 * their role badge. Everything that changes the household — rename, invite,
 * role picker, remove, editing another member — is hidden unless
 * `canManageHousehold` (owner-only). An editor keeps the edit button on their
 * own row only, matching the backend rule in household.py:303.
 */
export default function HouseholdPanel({
  initialName,
  onMembersChange,
  onHouseholdNameChange,
  canEdit = true,
  canManageHousehold = true,
}: Props) {
  const t = useT()
  const [name, setName] = useState(initialName)
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editing, setEditing] = useState<HouseholdMember | null>(null)
  const [removing, setRemoving] = useState<HouseholdMember | null>(null)

  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [roleChangingId, setRoleChangingId] = useState<number | null>(null)

  const isOwner = canManageHousehold
  const canEditAny = canEdit

  useEffect(() => {
    household.members()
      .then((m) => { setMembers(m); onMembersChange?.(m) })
      .catch(() => setLoadError(t.settings.membersLoadError))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arrives with the page's account fetch, which may resolve after this mounts.
  useEffect(() => {
    if (initialName) setName(initialName)
  }, [initialName])

  async function handleRename() {
    if (!name.trim()) return
    setSavingName(true)
    setSavedName(false)
    setActionError(null)
    try {
      await household.rename(name.trim())
      setSavedName(true)
      onHouseholdNameChange?.(name.trim())
      setTimeout(() => setSavedName(false), 2000)
    } catch {
      setActionError(t.settings.householdRenameError)
    } finally {
      setSavingName(false)
    }
  }

  async function handleRemove(member: HouseholdMember) {
    setActionError(null)
    // user_id comes from the server, which resolves the accounts↔users join.
    // Without it there is nothing safe to delete, so removal isn't offered.
    if (member.user_id == null) return
    try {
      await household.removeMember(member.user_id)
      const next = members.filter((m) => m.id !== member.id)
      setMembers(next)
      onMembersChange?.(next)
      void useFloreren.getState().load()
    } catch {
      setActionError(t.settings.removeError)
    } finally {
      setRemoving(null)
    }
  }

  async function handleChangeRole(member: HouseholdMember, role: 'editor' | 'viewer') {
    if (roleChangingId !== null || member.role === role) return
    setActionError(null)
    setRoleChangingId(member.id)
    try {
      const updated = await household.changeRole(member.id, role)
      const next = members.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
      setMembers(next)
      onMembersChange?.(next)
      void useFloreren.getState().load()
    } catch {
      setActionError(t.settings.roleChangeError)
    } finally {
      setRoleChangingId(null)
    }
  }

  async function generateCode() {
    setInviteLoading(true)
    setInviteError(null)
    setInviteCode(null)
    try {
      const result = await household.invite(inviteRole)
      setInviteCode(result.code)
    } catch {
      setInviteError(t.settings.inviteError)
    } finally {
      setInviteLoading(false)
    }
  }

  function handleMemberUpdated(updated: HouseholdMember) {
    const next = members.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
    setMembers(next)
    onMembersChange?.(next)
    setEditing(null)
    void useFloreren.getState().load()
  }

  // A member can be re-rol'd only if the owner is looking at someone else who
  // is not themselves the owner — the backend rejects both of those cases.
  function canPickRole(member: HouseholdMember): boolean {
    return isOwner && !member.is_self && member.role !== 'owner'
  }

  // Edit buttons: owner edits anyone; editor edits only their own row; a
  // viewer edits nobody.
  function canEditMember(member: HouseholdMember): boolean {
    if (!canEditAny) return false
    if (isOwner) return true
    return member.is_self
  }

  return (
    <div className="space-y-6">
      {/* ── Household name ───────────────────────────────────────────────── */}
      <div>
        <label htmlFor="household-name" className="mb-1.5 block text-sm font-semibold">
          {t.settings.householdName}
        </label>
        {isOwner ? (
          <div className="flex items-center gap-2">
            <input
              id="household-name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.settings.householdNamePlaceholder}
            />
            <button
              onClick={handleRename}
              disabled={savingName || !name.trim()}
              className="flex h-9 min-w-[5.5rem] shrink-0 items-center justify-center rounded-full bg-primary px-3 text-sm font-bold text-white transition-transform active:scale-90 disabled:opacity-40"
            >
              {savingName ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : savedName ? <Glyph name="check" size={15} /> : t.settings.save}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm font-medium text-text-muted">
            {initialName || name}
          </div>
        )}
      </div>

      {/* ── Members ──────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <div className="mb-2 text-sm font-semibold">{t.settings.whoIsGardening}</div>
        {loadError && <p className="mb-2 text-sm text-fiery-red">{loadError}</p>}
        <div className="space-y-2">
          {members.length === 0 && !loadError && (
            <p className="text-sm text-text-muted">{t.common.loading}</p>
          )}
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <Avatar value={member.avatar} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-text">{member.name}</span>
                  {member.is_self && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {t.settings.you}
                    </span>
                  )}
                  <span className="shrink-0 rounded-full border border-border bg-paper px-2 py-0.5 text-[10px] font-medium text-text-muted">
                    {roleBadge(member.role, t)}
                  </span>
                </div>
                <div className="truncate text-[11px] text-text-muted">{member.email}</div>
              </div>

              {/* Owner-only role picker — never for self or the owner row. */}
              {canPickRole(member) && (
                <div
                  className="flex shrink-0 items-center overflow-hidden rounded-full border border-border bg-paper"
                  role="group"
                  aria-label={`${t.settings.memberRoleLabel}: ${member.name}`}
                  title={t.settings.rolePickerLabel}
                >
                  {(['editor', 'viewer'] as const).map((role) => {
                    const selected = member.role === role
                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={selected}
                        disabled={roleChangingId === member.id}
                        onClick={() => handleChangeRole(member, role)}
                        className={`px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                          selected ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {role === 'editor' ? t.settings.roleEditor : t.settings.roleViewer}
                      </button>
                    )
                  })}
                </div>
              )}

              {canEditMember(member) && (
                <button
                  onClick={() => setEditing(member)}
                  title={t.settings.editMember.replace('{name}', member.name)}
                  aria-label={t.settings.editMember.replace('{name}', member.name)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-all hover:bg-bg active:scale-90"
                >
                  <Glyph name="edit" size={14} />
                </button>
              )}

              {/* Owner-only removal. You cannot remove yourself, and an
                  account with no legacy users row has no id the delete
                  endpoint would accept. */}
              {isOwner && !member.is_self && member.user_id != null && (
                <button
                  onClick={() => setRemoving(member)}
                  title={t.settings.removeMember}
                  aria-label={t.settings.removeMemberNamed.replace('{name}', member.name)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-400 transition-all hover:bg-red-50 active:scale-90 dark:hover:bg-red-500/10"
                >
                  <Glyph name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {actionError && <p className="mt-2 text-sm text-fiery-red">{actionError}</p>}
      </div>

      {/* ── Invite (owner-only) ──────────────────────────────────────────── */}
      {isOwner && (
        <div className="border-t border-border pt-4">
          <div className="mb-1 text-sm font-semibold">{t.settings.inviteTitle}</div>
          <p className="mb-3 text-xs text-text-muted">{t.settings.inviteDescription}</p>

          {!inviteCode && !inviteLoading && (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-xs font-medium text-text-muted">{t.settings.inviteRoleLabel}</div>
                <div
                  className="flex w-fit items-center overflow-hidden rounded-full border border-border bg-paper"
                  role="group"
                  aria-label={t.settings.inviteRoleLabel}
                >
                  {(['editor', 'viewer'] as const).map((role) => {
                    const selected = inviteRole === role
                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setInviteRole(role)}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                          selected ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {role === 'editor' ? t.settings.roleEditor : t.settings.roleViewer}
                      </button>
                    )
                  })}
                </div>
              </div>
              <button
                onClick={generateCode}
                className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              >
                {t.settings.generateCode}
              </button>
            </div>
          )}

          {inviteLoading && (
            <div className="flex items-center justify-center gap-2 py-2.5">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <span className="text-sm text-text-muted">{t.settings.generatingCode}</span>
            </div>
          )}

          {inviteCode && (
            <div className="space-y-3 text-center">
              <p className="text-xs text-text-muted">{t.settings.shareCode}</p>
              <div className="flex items-center justify-center gap-3">
                <span className="select-all rounded-xl bg-primary/10 px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em] text-primary">
                  {inviteCode}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteCode).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }).catch(() => {})
                  }}
                  title={t.settings.copyCode}
                  aria-label={t.settings.copyCode}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text transition-transform active:scale-95"
                >
                  <Glyph name={copied ? 'check' : 'clipboard'} size={17} />
                </button>
              </div>
              <button
                onClick={generateCode}
                disabled={inviteLoading}
                className="text-xs text-text-muted underline transition-colors active:text-text"
              >
                {t.settings.newCode}
              </button>
            </div>
          )}

          {inviteError && <p className="mt-2 text-sm text-fiery-red">{inviteError}</p>}
        </div>
      )}

      {editing && (
        <EditMemberSheet
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={handleMemberUpdated}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={t.settings.removeMember}
          message={t.settings.removeConfirmNamed.replace('{name}', removing.name)}
          confirmLabel={t.settings.removeMember}
          cancelLabel={t.settings.cancel}
          destructive
          onConfirm={() => handleRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

/**
 * Editing someone else's profile — deliberately a sheet with their name in the
 * heading, so it is never ambiguous whose details are being changed.
 */
function EditMemberSheet({
  member,
  onClose,
  onSaved,
}: {
  member: HouseholdMember
  onClose: () => void
  onSaved: (updated: HouseholdMember) => void
}) {
  const t = useT()
  const [name, setName] = useState(member.name)
  const [avatar, setAvatar] = useState(member.avatar ?? '')
  const [catalog, setCatalog] = useState<PlantIcon[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    icons.catalog().then(setCatalog).catch(() => {})
  }, [])

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await household.updateMember(member.id, {
        name: name.trim(),
        avatar: avatar || null,
      }))
    } catch (e) {
      const status = (e as { status?: number }).status
      setError(status === 409 ? t.settings.nameTakenError : t.settings.profileSaveError)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="mt-auto max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold text-text">
              {t.settings.editMemberTitle}
            </h3>
            {/* Naming the person is the whole point of this sheet. */}
            <p className="mt-0.5 truncate text-sm text-text-muted">{member.email}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t.settings.cancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted hover:text-text"
          >
            <Glyph name="x" size={16} />
          </button>
        </div>

        <label htmlFor="member-name" className="mb-1.5 block text-sm font-semibold">
          {t.settings.profileName}
        </label>
        <input
          id="member-name"
          className="mb-4 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-primary/50"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="mb-1.5 text-sm font-semibold">{t.settings.profileAvatar}</div>
        <div className="mb-4 grid max-h-48 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-border bg-bg p-3">
          {catalog.length === 0 && (
            <p className="col-span-6 py-2 text-center text-xs text-text-muted">{t.common.loading}</p>
          )}
          {catalog.map((icon) => (
            <button
              key={icon.id}
              onClick={() => setAvatar(icon.id)}
              title={icon.name}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all active:scale-90 ${
                avatar === icon.id ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-primary/10'
              }`}
            >
              <Avatar value={icon.id} size={34} />
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-fiery-red">{error}</p>}

        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? t.common.saving : t.settings.save}
        </button>
      </div>
    </div>
  )
}

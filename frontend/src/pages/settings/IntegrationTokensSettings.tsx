import { useEffect, useState } from 'react'
import {
  integrations,
  type IntegrationToken,
  type IntegrationTokenCreated,
} from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { isoToDisplay } from '../../utils/dateFormat'

const PRIMARY_BUTTON_CLASS = 'inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50'
const SECONDARY_BUTTON_CLASS = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary/50 disabled:opacity-50'

/**
 * Read-only tokens for a personal dashboard (LAveren) that pulls
 * GET /api/integrations/snapshot. The raw token is shown once, right after it
 * is made; the list only shows its last four characters.
 *
 * Making or revoking one needs editor rights (like the calendar feed link);
 * a viewer sees the section read-only.
 */
export default function IntegrationTokensSettings({ canEdit = true }: { canEdit?: boolean }) {
  const t = useT()
  const [tokens, setTokens] = useState<IntegrationToken[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('LAveren')
  const [created, setCreated] = useState<IntegrationTokenCreated | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'limit' | 'action' | null>(null)
  const [copied, setCopied] = useState<'token' | 'url' | null>(null)

  useEffect(() => {
    let cancelled = false
    integrations.list()
      .then((list) => { if (!cancelled) setTokens(list) })
      .catch(() => { if (!cancelled) setError('action') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function createToken() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    setCopied(null)
    try {
      const result = await integrations.create(name.trim())
      setCreated(result)
      setTokens((current) => [result, ...current])
    } catch (e) {
      setError((e as { status?: number }).status === 409 ? 'limit' : 'action')
    } finally {
      setBusy(false)
    }
  }

  async function revokeToken(id: number) {
    setBusy(true)
    setError(null)
    try {
      await integrations.revoke(id)
      setTokens((current) => current.filter((token) => token.id !== id))
      if (created?.id === id) setCreated(null)
    } catch {
      setError('action')
    } finally {
      setBusy(false)
    }
  }

  async function copy(kind: 'token' | 'url', value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
    } catch {
      setError('action')
    }
  }

  return (
    <div className="border-t border-border pt-4" data-integration-tokens>
      <div className="text-sm font-semibold">{t.settings.integrationsTitle}</div>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.settings.integrationsDescription}</p>
      <div className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-text-soft" role="note">
        {t.settings.integrationsSecurity}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="integration-token-name">{t.settings.integrationsNameLabel}</label>
        <input
          id="integration-token-name"
          value={name}
          maxLength={60}
          disabled={!canEdit}
          placeholder={t.settings.integrationsNamePlaceholder}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-text"
        />
        <button
          type="button"
          disabled={busy || !canEdit || !name.trim()}
          className={PRIMARY_BUTTON_CLASS}
          onClick={() => void createToken()}
        >
          {t.settings.integrationsCreate}
        </button>
      </div>

      {created && (
        <div className="mt-3 rounded-2xl border border-primary/25 bg-primary/10 p-3" data-integration-token-created>
          <p className="text-xs font-semibold text-primary">{t.settings.integrationsSaveNow}</p>
          {([
            ['token', t.settings.integrationsTokenLabel, created.token],
            ['url', t.settings.integrationsEndpointLabel, created.snapshot_url],
          ] as const).map(([kind, label, value]) => (
            <div key={kind} className="mt-2">
              <p className="text-[11px] font-medium text-text-muted">{label}</p>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={value}
                  aria-label={label}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-xs text-text"
                />
                <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => void copy(kind, value)}>
                  {copied === kind ? t.settings.integrationsCopied : t.settings.integrationsCopy}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && <p className="mt-3 text-xs text-text-muted">{t.common.loading}</p>}
      {!loading && tokens.length === 0 && (
        <p className="mt-3 text-xs text-text-muted">{t.settings.integrationsNone}</p>
      )}
      {tokens.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text">
                  {token.name} <span className="font-mono text-xs font-normal text-text-muted">…{token.token_hint}</span>
                </div>
                <div className="text-xs text-text-muted">
                  {token.last_used_at
                    ? t.settings.integrationsLastUsed(isoToDisplay(token.last_used_at.slice(0, 10)))
                    : t.settings.integrationsNeverUsed}
                </div>
              </div>
              <button
                type="button"
                disabled={busy || !canEdit}
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => void revokeToken(token.id)}
              >
                {t.settings.integrationsRevoke}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 text-sm text-fiery-red" role="alert">
          {error === 'limit' ? t.settings.integrationsLimit : t.settings.integrationsError}
        </p>
      )}
    </div>
  )
}

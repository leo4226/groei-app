import { useEffect, useMemo, useState } from 'react'
import {
  calendarSubscription,
  household,
  type CalendarGroupingCareType,
  type CalendarGroupingMap,
  type CalendarSubscriptionConfig,
  type CalendarSubscriptionCreated,
  type CalendarSubscriptionEnvironment,
} from '../../api/client'
import { useT } from '../../context/LanguageContext'

const CARE_TYPES: readonly CalendarGroupingCareType[] = [
  'water',
  'fertilize',
  'prune',
  'repot',
  'mist',
  'rotate',
  'pest_check',
  'dust',
]

const DEFAULT_CONFIG: CalendarSubscriptionConfig = {
  environment: 'all',
  map_ids: [],
  care_types: [],
  include_context: false,
  privacy: true,
}

export default function CalendarSubscriptionSettings() {
  const t = useT()
  const [active, setActive] = useState(false)
  const [config, setConfig] = useState<CalendarSubscriptionConfig>(DEFAULT_CONFIG)
  const [maps, setMaps] = useState<CalendarGroupingMap[]>([])
  const [created, setCreated] = useState<CalendarSubscriptionCreated | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'create' | 'revoke' | 'download' | null>(null)
  const [error, setError] = useState<'load' | 'action' | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      calendarSubscription.status(),
      household.calendarGrouping(),
    ]).then(([status, grouping]) => {
      if (cancelled) return
      setActive(status.active)
      if (status.config) setConfig(status.config)
      setMaps(grouping.maps)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) {
        setError('load')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const visibleMaps = useMemo(() => maps.filter((map) => (
    config.environment === 'all'
      || (config.environment === 'indoor' ? map.map_type === 'indoor' : map.map_type !== 'indoor')
  )), [maps, config.environment])

  function updateConfig(update: (current: CalendarSubscriptionConfig) => CalendarSubscriptionConfig) {
    setCreated(null)
    setCopied(false)
    setConfig(update)
  }

  function setEnvironment(environment: CalendarSubscriptionEnvironment) {
    updateConfig((current) => ({ ...current, environment, map_ids: [] }))
  }

  function toggleMap(mapId: number) {
    updateConfig((current) => ({
      ...current,
      map_ids: current.map_ids.includes(mapId)
        ? current.map_ids.filter((id) => id !== mapId)
        : [...current.map_ids, mapId],
    }))
  }

  function toggleCareType(careType: CalendarGroupingCareType) {
    updateConfig((current) => ({
      ...current,
      care_types: current.care_types.includes(careType)
        ? current.care_types.filter((value) => value !== careType)
        : [...current.care_types, careType],
    }))
  }

  async function createSubscription() {
    setBusy('create')
    setError(null)
    setCopied(false)
    try {
      const result = await calendarSubscription.create(config)
      setCreated(result)
      setConfig(result.config)
      setActive(true)
    } catch {
      setError('action')
    } finally {
      setBusy(null)
    }
  }

  async function revokeSubscription() {
    setBusy('revoke')
    setError(null)
    try {
      await calendarSubscription.revoke()
      setActive(false)
      setCreated(null)
      setCopied(false)
    } catch {
      setError('action')
    } finally {
      setBusy(null)
    }
  }

  async function copyLink() {
    if (!created) return
    setError(null)
    try {
      await navigator.clipboard.writeText(created.feed_url)
      setCopied(true)
    } catch {
      setError('action')
    }
  }

  async function downloadSnapshot() {
    setBusy('download')
    setError(null)
    try {
      const blob = await calendarSubscription.downloadSnapshot(config)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'floreren-care.ics'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('action')
    } finally {
      setBusy(null)
    }
  }

  const pillClass = (selected: boolean) => `min-h-11 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
    selected
      ? 'border-primary bg-primary/10 font-semibold text-primary'
      : 'border-border bg-surface text-text-soft'
  }`

  return (
    <article className="card p-4" data-calendar-subscription>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h3
            className="font-heading text-base font-medium text-text"
            data-calendar-subscription-title
          >
            {t.settings.calendarSubscriptionTitle}
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
            {t.settings.calendarSubscriptionDescription}
          </p>
        </div>
        {active && (
          <span className="inline-flex self-start items-center gap-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            {t.settings.calendarSubscriptionActive}
          </span>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-text-soft" role="note">
        {t.settings.calendarSubscriptionSecurity}
      </div>

      {loading && <div className="mt-4 text-xs text-text-muted">{t.common.loading}</div>}

      {!loading && (
        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="text-xs font-medium text-text-muted">{t.settings.calendarSubscriptionEnvironment}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['all', t.settings.calendarSubscriptionEnvironmentAll],
                ['outdoor', t.settings.calendarSubscriptionEnvironmentOutdoor],
                ['indoor', t.settings.calendarSubscriptionEnvironmentIndoor],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={config.environment === value}
                  className={pillClass(config.environment === value)}
                  onClick={() => setEnvironment(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset aria-label={t.settings.calendarSubscriptionSpaces}>
            <legend className="text-xs font-medium text-text-muted">{t.settings.calendarSubscriptionSpaces}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={config.map_ids.length === 0}
                className={pillClass(config.map_ids.length === 0)}
                onClick={() => updateConfig((current) => ({ ...current, map_ids: [] }))}
              >
                {t.settings.calendarSubscriptionAllSpaces}
              </button>
              {visibleMaps.map((map) => (
                <button
                  key={map.id}
                  type="button"
                  aria-pressed={config.map_ids.includes(map.id)}
                  className={pillClass(config.map_ids.includes(map.id))}
                  onClick={() => toggleMap(map.id)}
                >
                  {map.name}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset aria-label={t.settings.calendarSubscriptionCareTypes}>
            <legend className="text-xs font-medium text-text-muted">{t.settings.calendarSubscriptionCareTypes}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={config.care_types.length === 0}
                className={pillClass(config.care_types.length === 0)}
                onClick={() => updateConfig((current) => ({ ...current, care_types: [] }))}
              >
                {t.settings.calendarSubscriptionAllCareTypes}
              </button>
              {CARE_TYPES.map((careType) => (
                <button
                  key={careType}
                  type="button"
                  aria-pressed={config.care_types.includes(careType)}
                  className={pillClass(config.care_types.includes(careType))}
                  onClick={() => toggleCareType(careType)}
                >
                  {t.careTypes[careType]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-paper p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={config.include_context}
                onChange={(event) => updateConfig((current) => ({ ...current, include_context: event.target.checked }))}
              />
              <span>
                <span className="block text-sm font-semibold text-text">{t.settings.calendarSubscriptionContext}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{t.settings.calendarSubscriptionContextDescription}</span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-paper p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={config.privacy}
                onChange={(event) => updateConfig((current) => ({ ...current, privacy: event.target.checked }))}
              />
              <span>
                <span className="block text-sm font-semibold text-text">{t.settings.calendarSubscriptionPrivacy}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{t.settings.calendarSubscriptionPrivacyDescription}</span>
              </span>
            </label>
          </div>

          {created && (
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
              <p className="text-xs font-semibold text-primary">{t.settings.calendarSubscriptionSaveNow}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={created.feed_url}
                  aria-label={t.settings.calendarSubscriptionCopy}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-xs text-text"
                />
                <button type="button" className="btn-secondary min-h-11" onClick={() => void copyLink()}>
                  {copied ? t.settings.calendarSubscriptionCopied : t.settings.calendarSubscriptionCopy}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={busy !== null}
              className="btn-primary min-h-11"
              onClick={() => void createSubscription()}
            >
              {busy === 'create'
                ? t.settings.calendarSubscriptionCreating
                : active
                  ? t.settings.calendarSubscriptionRegenerate
                  : t.settings.calendarSubscriptionCreate}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              className="btn-secondary min-h-11"
              onClick={() => void downloadSnapshot()}
            >
              {t.settings.calendarSubscriptionDownload}
            </button>
            {active && (
              <button
                type="button"
                disabled={busy !== null}
                className="min-h-11 rounded-xl border border-red-400/40 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/20"
                onClick={() => void revokeSubscription()}
              >
                {t.settings.calendarSubscriptionRevoke}
              </button>
            )}
          </div>
          <p className="text-xs text-text-muted">{t.settings.calendarSubscriptionDownloadDescription}</p>

          <div className="rounded-2xl border border-border bg-paper p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-heading text-sm font-semibold text-text">
              <span>{t.settings.calendarSubscriptionGoogle}</span>
              <span>{t.settings.calendarSubscriptionOutlook}</span>
              <span>{t.settings.calendarSubscriptionApple}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text-soft">{t.settings.calendarSubscriptionProviderHint}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.settings.calendarSubscriptionRefreshHint}</p>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 text-xs text-red-600">
          {error === 'load'
            ? t.settings.calendarSubscriptionLoadError
            : t.settings.calendarSubscriptionActionError}
        </div>
      )}
    </article>
  )
}

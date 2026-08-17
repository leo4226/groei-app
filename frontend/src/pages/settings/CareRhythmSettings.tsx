import { useEffect, useRef, useState } from 'react'
import { careRhythm } from '../../api/client'
import type {
  CareRhythmConfig,
  CareRhythmOperation,
  CareRhythmPreview,
  CareRhythmPreviewItem,
  CareRhythmSettings as CareRhythmSettingsData,
} from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { isoToDisplay } from '../../utils/dateFormat'
import { notifyCareRhythmChanged } from '../../utils/careRhythmEvents'

const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

type ErrorState = 'load' | 'preview' | 'apply' | 'stale' | 'undo' | null

function cloneConfig(config: CareRhythmConfig): CareRhythmConfig {
  return {
    indoor_weekdays: [...config.indoor_weekdays],
    outdoor_weekdays: [...config.outdoor_weekdays],
    map_overrides: config.map_overrides.map((override) => ({
      map_id: override.map_id,
      weekdays: [...override.weekdays],
    })),
  }
}

function toggleWeekday(selected: number[], weekday: number): number[] {
  if (selected.includes(weekday)) {
    return selected.length > 1 ? selected.filter((day) => day !== weekday) : selected
  }
  if (selected.length >= 2) return selected
  return [...selected, weekday].sort((left, right) => left - right)
}

function statusCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined
}

export default function CareRhythmSettings({ canEdit = true }: { canEdit?: boolean }) {
  const t = useT()
  const [settings, setSettings] = useState<CareRhythmSettingsData | null>(null)
  const [config, setConfig] = useState<CareRhythmConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<CareRhythmPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [appliedOperation, setAppliedOperation] = useState<CareRhythmOperation | null>(null)
  const [error, setError] = useState<ErrorState>(null)
  const [refreshPreview, setRefreshPreview] = useState(0)
  const previewRequest = useRef(0)

  useEffect(() => {
    let cancelled = false
    careRhythm.settings()
      .then((loaded) => {
        if (cancelled) return
        setSettings(loaded)
        setConfig(cloneConfig(loaded.config))
      })
      .catch(() => {
        if (!cancelled) setError('load')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!open || !config) return
    const requestId = ++previewRequest.current
    setPreviewing(true)
    if (error === 'preview') setError(null)
    careRhythm.preview(config)
      .then((nextPreview) => {
        if (requestId !== previewRequest.current) return
        setPreview(nextPreview)
      })
      .catch(() => {
        if (requestId === previewRequest.current) setError('preview')
      })
      .finally(() => {
        if (requestId === previewRequest.current) setPreviewing(false)
      })
  }, [open, config, refreshPreview])

  function setEnvironmentWeekday(environment: 'indoor' | 'outdoor', weekday: number) {
    setAppliedOperation(null)
    setConfig((current) => {
      if (!current) return current
      const key = environment === 'indoor' ? 'indoor_weekdays' : 'outdoor_weekdays'
      return { ...current, [key]: toggleWeekday(current[key], weekday) }
    })
  }

  function effectiveWeekdays(mapId: number, mapType: 'indoor' | 'outdoor'): number[] {
    if (!config) return []
    return config.map_overrides.find((override) => override.map_id === mapId)?.weekdays
      ?? (mapType === 'indoor' ? config.indoor_weekdays : config.outdoor_weekdays)
  }

  function toggleMapOverride(mapId: number, mapType: 'indoor' | 'outdoor') {
    setAppliedOperation(null)
    setConfig((current) => {
      if (!current) return current
      const existing = current.map_overrides.find((override) => override.map_id === mapId)
      if (existing) {
        return {
          ...current,
          map_overrides: current.map_overrides.filter((override) => override.map_id !== mapId),
        }
      }
      const inherited = mapType === 'indoor'
        ? current.indoor_weekdays
        : current.outdoor_weekdays
      if (inherited.length === 0) return current
      return {
        ...current,
        map_overrides: [
          ...current.map_overrides,
          { map_id: mapId, weekdays: [...inherited] },
        ].sort((left, right) => left.map_id - right.map_id),
      }
    })
  }

  function setMapWeekday(mapId: number, weekday: number) {
    setAppliedOperation(null)
    setConfig((current) => {
      if (!current) return current
      return {
        ...current,
        map_overrides: current.map_overrides.map((override) => (
          override.map_id === mapId
            ? { ...override, weekdays: toggleWeekday(override.weekdays, weekday) }
            : override
        )),
      }
    })
  }

  async function applyRhythm() {
    if (!config || !preview || previewing) return
    setApplying(true)
    setError(null)
    try {
      const operation = await careRhythm.apply({
        config,
        preview_hash: preview.preview_hash,
      })
      setAppliedOperation(operation)
      setSettings((current) => current ? { ...current, saved: true, config: cloneConfig(config) } : current)
      notifyCareRhythmChanged()
    } catch (caught) {
      if (statusCode(caught) === 409) {
        setError('stale')
        setRefreshPreview((value) => value + 1)
      } else {
        setError('apply')
      }
    } finally {
      setApplying(false)
    }
  }

  async function undoRhythm() {
    if (!appliedOperation) return
    setUndoing(true)
    setError(null)
    try {
      await careRhythm.undo(appliedOperation.operation_id)
      setAppliedOperation(null)
      const loaded = await careRhythm.settings()
      setSettings(loaded)
      setConfig(cloneConfig(loaded.config))
      setRefreshPreview((value) => value + 1)
      notifyCareRhythmChanged()
    } catch (caught) {
      setError(statusCode(caught) === 409 ? 'undo' : 'apply')
    } finally {
      setUndoing(false)
    }
  }

  function reasonLabel(item: CareRhythmPreviewItem): string {
    switch (item.reason) {
      case 'routine':
        return item.status === 'moved'
          ? t.settings.careRhythmReasonRoutineProjected
          : t.settings.careRhythmReasonRoutineAligned
      case 'too_frequent': return t.settings.careRhythmReasonTooFrequent
      case 'moved_earlier': return t.settings.careRhythmReasonMoved
      case 'aligned': return t.settings.careRhythmReasonAligned
      case 'outside_window': return t.settings.careRhythmReasonOutside
      case 'opted_out': return t.settings.careRhythmReasonOptedOut
      case 'not_future': return t.settings.careRhythmReasonNotFuture
      case 'no_routine': return t.settings.careRhythmReasonNoRoutine
      default: {
        const exhaustiveReason: never = item.reason
        void exhaustiveReason
        return t.settings.careRhythmReasonNoRoutine
      }
    }
  }

  const errorMessage = error === 'load'
    ? t.settings.careRhythmLoadError
    : error === 'preview'
      ? t.settings.careRhythmPreviewError
      : error === 'apply'
        ? t.settings.careRhythmApplyError
        : error === 'stale'
          ? t.settings.careRhythmStaleError
          : error === 'undo'
            ? t.settings.careRhythmUndoConflict
            : null

  return (
    <div className="card p-4" data-care-rhythm-settings>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="font-heading text-base font-medium text-text"
              data-care-rhythm-title
            >
              {t.settings.careRhythmTitle}
            </h3>
            {settings && (
              <span
                className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                data-care-rhythm-status
              >
                {settings.saved ? t.settings.careRhythmSaved : t.settings.careRhythmProposed}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-xs text-text-muted">
            {t.settings.careRhythmDescription}
          </p>
        </div>
        {/* Viewers read the current rhythm but cannot change it: the editor is
            a write surface (apply/undo), so the entry button is omitted. */}
        {settings && !open && canEdit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-11 shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {settings.saved ? t.settings.careRhythmChange : t.settings.careRhythmOrganize}
          </button>
        )}
      </div>

      {!settings && !errorMessage && (
        <div className="mt-4 text-xs text-text-muted">{t.common.loading}</div>
      )}

      {open && config && settings && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-text-soft">
            {t.settings.careRhythmSafety}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(['outdoor', 'indoor'] as const).map((environment) => {
              const weekdays = environment === 'indoor'
                ? config.indoor_weekdays
                : config.outdoor_weekdays
              return (
                <fieldset
                  key={environment}
                  data-care-rhythm-environment={environment}
                  className="rounded-2xl border border-border bg-paper p-3.5"
                >
                  <legend className="px-1 font-heading text-sm font-semibold text-text">
                    {environment === 'indoor'
                      ? t.settings.careRhythmIndoorDays
                      : t.settings.careRhythmOutdoorDays}
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ISO_WEEKDAYS.map((weekday) => {
                      const selected = weekdays.includes(weekday)
                      const atMaximum = weekdays.length >= 2 && !selected
                      return (
                        <button
                          key={weekday}
                          type="button"
                          aria-pressed={selected}
                          disabled={atMaximum}
                          onClick={() => setEnvironmentWeekday(environment, weekday)}
                          className={`min-h-11 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-35 ${selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface text-text-soft'}`}
                        >
                          {t.settings.careRhythmWeekdays[weekday - 1]}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )
            })}
          </div>

          {settings.maps.length > 0 && (
            <div className="space-y-2">
              {settings.maps.map((map) => {
                const override = config.map_overrides.find((item) => item.map_id === map.id)
                const weekdays = effectiveWeekdays(map.id, map.map_type)
                return (
                  <article
                    key={map.id}
                    data-care-rhythm-map={map.id}
                    className="rounded-2xl border border-border bg-paper p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-heading text-sm font-semibold text-text">{map.name}</div>
                        <div className="mt-0.5 text-xs text-text-muted">
                          {t.settings.careRhythmPreferredDays}: {' '}
                          {weekdays.length > 0
                            ? weekdays.map((weekday) => t.settings.careRhythmWeekdays[weekday - 1]).join(', ')
                            : t.settings.careRhythmNoPreferredDays}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!override && weekdays.length === 0}
                        onClick={() => toggleMapOverride(map.id, map.map_type)}
                        className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {override ? t.settings.careRhythmInherit : t.settings.careRhythmOverride}
                      </button>
                    </div>
                    {override && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ISO_WEEKDAYS.map((weekday) => {
                          const selected = override.weekdays.includes(weekday)
                          return (
                            <button
                              key={weekday}
                              type="button"
                              aria-pressed={selected}
                              disabled={override.weekdays.length >= 2 && !selected}
                              onClick={() => setMapWeekday(map.id, weekday)}
                              className={`min-h-11 rounded-full border px-3 py-1.5 text-xs disabled:opacity-35 ${selected
                                ? 'border-primary bg-primary/10 font-semibold text-primary'
                                : 'border-border text-text-soft'}`}
                            >
                              {t.settings.careRhythmWeekdays[weekday - 1]}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface p-3.5" aria-live="polite">
            <div className="font-heading text-sm font-semibold text-text">
              {t.settings.careRhythmPreviewTitle}
            </div>
            {previewing && <div className="mt-2 text-xs text-text-muted">{t.common.loading}</div>}
            {!previewing && preview && (
              <>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{t.settings.careRhythmMovedCount(preview.summary.moved)}</span>
                  <span className="rounded-full bg-paper px-2.5 py-1 text-text-soft">{t.settings.careRhythmUnchangedCount(preview.summary.unchanged)}</span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{t.settings.careRhythmExceptionCount(preview.summary.exceptions)}</span>
                  <span className="rounded-full bg-paper px-2.5 py-1 text-text-soft">{t.settings.careRhythmGroupCount(preview.summary.group_count)}</span>
                </div>
                {preview.items.length === 0 ? (
                  <p className="mt-3 text-xs text-text-muted">{t.settings.careRhythmNoSchedules}</p>
                ) : (
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {preview.items.map((item) => (
                      <div key={item.schedule_id} className="flex flex-col gap-1 rounded-xl bg-paper px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-text">{item.plant_name}</div>
                          <div className="text-xs text-text-muted">{item.map_name}</div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="font-mono text-xs text-text-soft">
                            {t.settings.careRhythmPreviewTiming(
                              isoToDisplay(item.old_date),
                              isoToDisplay(item.new_date),
                            )}
                          </div>
                          <div className={`text-[11px] ${item.status === 'exception' ? 'text-amber-700' : 'text-primary'}`}>
                            {reasonLabel(item)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {errorMessage && <div role="alert" className="text-xs text-red-600">{errorMessage}</div>}
          {appliedOperation && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/10 px-3 py-2">
              <span className="text-sm font-semibold text-primary">
                {t.settings.careRhythmApplied}
              </span>
              <button
                type="button"
                disabled={undoing}
                onClick={() => void undoRhythm()}
                className="min-h-11 rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
              >
                {undoing ? t.settings.careRhythmUndoing : t.settings.careRhythmUndo}
              </button>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-soft"
            >
              {t.settings.careRhythmClose}
            </button>
            <button
              type="button"
              disabled={!preview || previewing || applying}
              onClick={() => void applyRhythm()}
              className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {applying ? t.settings.careRhythmApplying : t.settings.careRhythmApply}
            </button>
          </div>
        </div>
      )}

      {errorMessage && !open && <div role="alert" className="mt-3 text-xs text-red-600">{errorMessage}</div>}
    </div>
  )
}

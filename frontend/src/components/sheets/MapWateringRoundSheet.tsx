import { useEffect, useRef, useState } from 'react'
import type { MapWateringRoundData } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { isoToDisplay, localIsoDate } from '../../utils/dateFormat'
import WateringRoundMemberList from './WateringRoundMemberList'

interface Props {
  data: MapWateringRoundData | null
  completedAt: string
  loading: boolean
  saving: boolean
  error: string | null
  onCompletedAtChange(date: string): void
  onConfirm(completedAt: string, scheduleIds: number[]): void | Promise<void>
  onUndo(operationId: number): void | Promise<void>
  onRetry(): void | Promise<void>
  onCancel(): void
}

export default function MapWateringRoundSheet({
  data,
  completedAt,
  loading,
  saving,
  error,
  onCompletedAtChange,
  onConfirm,
  onUndo,
  onRetry,
  onCancel,
}: Props) {
  const t = useT()
  const dialogRef = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(data?.members.map((member) => member.schedule_id) ?? []),
  )
  const selectedIds = (data?.members ?? [])
    .map((member) => member.schedule_id)
    .filter((scheduleId) => selected.has(scheduleId))
  const latest = data?.history[0] ?? null
  const today = localIsoDate()
  const busy = loading || saving

  useEffect(() => {
    setSelected(new Set(data?.members.map((member) => member.schedule_id) ?? []))
  }, [data])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      const dialog = dialogRef.current
      if (keyEvent.key === 'Escape' && !saving) {
        keyEvent.preventDefault()
        onCancel()
        return
      }
      if (keyEvent.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('*'))
        .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled'))
      if (focusable.length === 0) {
        keyEvent.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (keyEvent.shiftKey && (active === first || !dialog.contains(active))) {
        keyEvent.preventDefault()
        last.focus()
      } else if (!keyEvent.shiftKey && (active === last || !dialog.contains(active))) {
        keyEvent.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, saving])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="map-watering-round-title"
        className="flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-paper shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <header className="border-b border-border px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="map-watering-round-title"
                className="font-heading text-xl font-bold text-text"
              >
                {t.calendar.wateringRoundTitle}
              </h2>
              {data && (
                <div className="mt-0.5 truncate text-xs font-semibold uppercase tracking-wide text-primary">
                  {data.map_name}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              aria-label={t.calendar.wateringRoundCancel}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border text-xl text-text-muted disabled:opacity-50"
            >
              ×
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text-soft">
            {t.mapPage.mapWateringDescription}
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mx-4 mt-3 rounded-xl bg-overdue/10 px-3 py-2 text-sm text-overdue sm:mx-5"
          >
            {error === 'load_failed'
              ? t.mapPage.mapWateringLoadError
              : t.mapPage.mapWateringError}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {loading && !data && (
            <div role="status" className="py-10 text-center text-sm text-text-soft">
              {t.mapPage.mapWateringLoading}
            </div>
          )}

          {!loading && !data && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <button
                type="button"
                onClick={() => void onRetry()}
                className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-primary"
              >
                {t.maps.retry}
              </button>
            </div>
          )}

          {data && latest && (
            <div className="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
                {t.mapPage.mapWateringLastRound}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-text">
                {t.mapPage.mapWateringRoundMeta(
                  isoToDisplay(latest.completed_at),
                  latest.completed_by_name ?? t.mapPage.mapWateringUnknownMember,
                  t.calendar.affectedPlants(latest.affected_count),
                )}
              </div>
            </div>
          )}

          {data && <label className="mt-3 block text-xs font-semibold text-text-soft">
            {t.mapPage.gardenActionDateLabel}
            <input
              type="date"
              value={completedAt}
              max={today}
              disabled={busy}
              onChange={(event) => onCompletedAtChange(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text disabled:opacity-50"
            />
          </label>}

          {data && <div className="mt-3">
            <WateringRoundMemberList
              members={data.members}
              selected={selected}
              disabled={busy}
              onSelectedChange={setSelected}
            />
          </div>}

          {data && data.history.length > 0 && (
            <details className="mt-4 rounded-2xl border border-border bg-surface px-3 py-2">
              <summary className="min-h-11 cursor-pointer list-none py-3 text-sm font-semibold text-text-soft marker:hidden">
                {t.mapPage.mapWateringHistory} · {data.history.length}
              </summary>
              <div className="divide-y divide-border border-t border-border">
                {data.history.slice(0, 3).map((entry) => (
                  <div
                    key={entry.operation_id}
                    data-watering-history-row
                    className="flex min-h-14 items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 text-xs leading-relaxed text-text-soft">
                      {t.mapPage.mapWateringRoundMeta(
                        isoToDisplay(entry.completed_at),
                        entry.completed_by_name ?? t.mapPage.mapWateringUnknownMember,
                        t.calendar.affectedPlants(entry.affected_count),
                      )}
                    </div>
                    {entry.can_undo && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onUndo(entry.operation_id)}
                        className="min-h-11 shrink-0 rounded-full border border-border px-3 text-xs font-semibold text-primary disabled:opacity-50"
                      >
                        {t.mapPage.mapWateringUndo}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {data && <footer className="grid grid-cols-1 gap-2 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:grid-cols-2 sm:px-5 sm:pb-4">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="min-h-12 rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-soft disabled:opacity-50"
          >
            {t.calendar.wateringRoundCancel}
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0 || !completedAt}
            onClick={() => void onConfirm(completedAt, selectedIds)}
            className="min-h-12 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            {selectedIds.length === 0
              ? t.calendar.wateringRoundSelectAtLeastOne
              : t.calendar.wateringRoundConfirm(selectedIds.length)}
          </button>
        </footer>}
      </section>
    </div>
  )
}

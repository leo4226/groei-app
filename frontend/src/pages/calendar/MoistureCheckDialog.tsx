import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import type { CalendarEvent } from './calendarTypes'

export type MoistureCheckOutcome = 'still_moist' | 'watered'

interface Props {
  event: CalendarEvent
  saving: boolean
  onResolve(scheduleIds: number[], outcome: MoistureCheckOutcome): void | Promise<void>
  onCancel(): void
}

export default function MoistureCheckDialog({ event, saving, onResolve, onCancel }: Props) {
  const t = useT()
  const members = event.group_members ?? []
  const dialogRef = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(members.map(member => member.schedule_id)),
  )

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
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled'))
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

  function toggle(scheduleId: number) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(scheduleId)) next.delete(scheduleId)
      else next.add(scheduleId)
      return next
    })
  }

  const selectedIds = members
    .map(member => member.schedule_id)
    .filter(scheduleId => selected.has(scheduleId))
  const localeIsEnglish = t.locale.startsWith('en')

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
        aria-labelledby="moisture-check-title"
        className="flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-paper shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <header className="border-b border-border px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="moisture-check-title" className="font-heading text-xl font-bold text-text">
                {t.calendar.moistureCheckTitle}
              </h2>
              {event.map_name && (
                <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  {event.map_name}
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
            {t.calendar.moistureCheckDescription}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setSelected(new Set(members.map(member => member.schedule_id)))}
              className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
            >
              {t.calendar.wateringRoundSelectAll}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setSelected(new Set())}
              className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-soft disabled:opacity-50"
            >
              {t.calendar.wateringRoundSelectNone}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:px-5">
          {members.map(member => {
            const reason = localeIsEnglish ? member.reason_en : member.reason_nl
            return (
              <label
                key={member.schedule_id}
                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition-colors ${selected.has(member.schedule_id)
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-surface'}`}
              >
                <input
                  type="checkbox"
                  value={member.schedule_id}
                  checked={selected.has(member.schedule_id)}
                  disabled={saving}
                  onChange={() => toggle(member.schedule_id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-primary"
                />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-bold text-primary">
                  {member.plant_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block break-words font-heading text-sm font-semibold text-text">
                    {member.plant_name}
                  </span>
                  {reason && (
                    <span className="mt-1 block text-xs leading-relaxed text-text-soft">
                      {reason}
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>

        <footer className="grid grid-cols-1 gap-2 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:grid-cols-3 sm:px-5 sm:pb-4">
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
            disabled={saving || selectedIds.length === 0}
            onClick={() => void onResolve(selectedIds, 'still_moist')}
            className="min-h-12 rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-45"
          >
            {t.calendar.moistureCheckStillMoist(selectedIds.length)}
          </button>
          <button
            type="button"
            disabled={saving || selectedIds.length === 0}
            onClick={() => void onResolve(selectedIds, 'watered')}
            className="min-h-12 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            {selectedIds.length === 0
              ? t.calendar.wateringRoundSelectAtLeastOne
              : t.calendar.moistureCheckWatered(selectedIds.length)}
          </button>
        </footer>
      </section>
    </div>
  )
}

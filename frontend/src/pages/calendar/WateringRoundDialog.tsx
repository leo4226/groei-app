import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import WateringRoundMemberList from '../../components/sheets/WateringRoundMemberList'
import type { CalendarEvent } from './calendarTypes'

interface Props {
  event: CalendarEvent
  saving: boolean
  onConfirm(scheduleIds: number[]): void | Promise<void>
  onCancel(): void
}

export default function WateringRoundDialog({ event, saving, onConfirm, onCancel }: Props) {
  const t = useT()
  const members = event.group_members ?? []
  const dialogRef = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(members.map((member) => member.schedule_id)),
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

  const selectedIds = members
    .map((member) => member.schedule_id)
    .filter((scheduleId) => selected.has(scheduleId))

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
        aria-labelledby="watering-round-title"
        className="flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-paper shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <header className="border-b border-border px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="watering-round-title" className="font-heading text-xl font-bold text-text">
                {t.calendar.wateringRoundTitle}
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
            {t.calendar.wateringRoundDescription}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <WateringRoundMemberList
            members={members}
            selected={selected}
            disabled={saving}
            onSelectedChange={setSelected}
          />
        </div>

        <footer className="grid grid-cols-1 gap-2 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:grid-cols-2 sm:px-5 sm:pb-4">
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
            onClick={() => void onConfirm(selectedIds)}
            className="min-h-12 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            {selectedIds.length === 0
              ? t.calendar.wateringRoundSelectAtLeastOne
              : t.calendar.wateringRoundConfirm(selectedIds.length)}
          </button>
        </footer>
      </section>
    </div>
  )
}

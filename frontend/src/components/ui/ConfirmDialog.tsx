import { useEffect, useRef } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A styled confirmation dialog, replacing `window.confirm`.
 *
 * The browser dialog can't be themed, renders in the OS language regardless of
 * the account's, and reads as a system error rather than part of the app —
 * which is a poor last impression before a destructive action. This one is
 * focus-trapped to the confirm button and closes on Escape.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-6"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title" className="font-heading text-lg font-bold text-text">
          {title}
        </h3>
        <p id="confirm-message" className="mt-2 text-sm leading-relaxed text-text-muted">
          {message}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold text-text transition-transform active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 rounded-full py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] ${
              destructive ? 'bg-red-500' : 'bg-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

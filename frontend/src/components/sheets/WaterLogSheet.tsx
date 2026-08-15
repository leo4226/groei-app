import { useT } from '../../context/LanguageContext'
import { createPortal } from 'react-dom'
import CareIcon, { type CareIconType } from '../ui/CareIcon'

interface Props {
  /** 'water' or 'fertilize' — controls header icon and button labels */
  actionType: 'water' | 'fertilize'

  /**
   * Currently selected date string (YYYY-MM-DD) for the action.
   * Provided by the parent hook (useGardenWater or useGardenFertilize).
   */
  pickerDate: string

  /**
   * Callback when the user changes the date.
   */
  onPickerDateChange: (date: string) => void

  /**
   * Whether a save/delete operation is in progress.
   */
  busy: boolean

  /**
   * Whether a previous log entry exists (show "delete" button).
   */
  hasExistingLog: boolean

  /** Save handler */
  onSave: () => void

  /** Delete handler */
  onDelete: () => void

  /** Close/dismiss handler */
  onClose: () => void
}

/** Format ISO date (YYYY-MM-DD) to European display (DD/MM/YYYY). */
function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export default function GardenActionSheet({
  actionType,
  pickerDate,
  onPickerDateChange,
  busy,
  hasExistingLog,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const t = useT()
  const cfg = actionType === 'water'
    ? {
        title: t.mapPage.recordWatering,
        buttonLabel: t.mapPage.gardenWaterButton,
        deleteLabel: t.mapPage.gardenWaterDelete,
      }
    : {
        title: t.mapPage.recordFertilizing,
        buttonLabel: t.mapPage.gardenFertilizeButton,
        deleteLabel: t.mapPage.gardenFertilizeDelete,
      }
  const todayStr = new Date().toISOString().slice(0, 10)

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" style={{ touchAction: 'none' }} onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[calc(4rem+env(safe-area-inset-bottom))] animate-slide-up">
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label={t.mapPage.gardenActionClose}
          className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        <div className="px-5 pb-6">
          {/* Header */}
          <h2 className="text-base font-bold text-text mb-1 flex items-center gap-2">
            <CareIcon type={actionType as CareIconType} size={18} strokeWidth={1.9} /> {cfg.title}
          </h2>
          <p className="text-xs text-text-muted mb-5">
            {t.mapPage.gardenActionScope}
          </p>

          {/* Date picker row — the real <input type="date"> sits directly on
              top of the styled display box (opacity-0, full size) so a tap
              hits the native control itself. Relying on a hidden input's
              showPicker() instead is unreliable on mobile (no keyboard/picker
              appears), since the element isn't meaningfully rendered. */}
          <div className="flex items-center gap-2 mb-5">
            <label className="text-sm text-text-muted shrink-0">
              {t.mapPage.gardenActionDateLabel}
            </label>

            <div className="relative flex-1">
              {/* Styled display — shows DD/MM/YYYY */}
              <div className="text-sm bg-bg border border-border rounded-lg px-3 py-2 text-text">
                {isoToDisplay(pickerDate)}
              </div>

              {/* Real native date input, invisible but tappable, on top */}
              <input
                type="date"
                value={pickerDate}
                max={todayStr}
                onChange={(e) => onPickerDateChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={busy || !pickerDate}
              className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-40 disabled:active:scale-100"
            >
              {busy ? '…' : cfg.buttonLabel}
            </button>

            {hasExistingLog && (
              <button
                onClick={onDelete}
                disabled={busy}
                className="flex-1 bg-overdue/10 text-overdue rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-40 disabled:active:scale-100"
              >
                {cfg.deleteLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
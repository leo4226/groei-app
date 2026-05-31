import { useT } from '../../context/LanguageContext'

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

const CONFIG = {
  water: {
    icon: '💧',
    title: 'Water geven',
    buttonLabel: 'Alle planten water geven',
    deleteLabel: 'Wis waterbeurt',
  },
  fertilize: {
    icon: '🌿',
    title: 'Bemesten',
    buttonLabel: 'Alle planten bemesten',
    deleteLabel: 'Wis bemesting',
  },
} as const

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
  const cfg = CONFIG[actionType]
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[calc(4rem+env(safe-area-inset-bottom))] animate-slide-up">
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        <div className="px-5 pb-6">
          {/* Header */}
          <h2 className="text-base font-bold text-text mb-1">
            {cfg.icon} {cfg.title}
          </h2>
          <p className="text-xs text-text-muted mb-5">
            Dit werkt voor alle planten op deze kaart tegelijk.
          </p>

          {/* Date picker row */}
          <div className="flex items-center gap-2 mb-5">
            <label className="text-sm text-text-muted shrink-0">
              Datum
            </label>
            <input
              type="date"
              value={pickerDate}
              max={todayStr}
              onChange={(e) => onPickerDateChange(e.target.value)}
              className="flex-1 text-sm bg-bg border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
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
    </>
  )
}

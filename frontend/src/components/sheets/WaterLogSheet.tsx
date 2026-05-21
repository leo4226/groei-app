import { useState } from 'react'
import { useT } from '../../context/LanguageContext'

interface Props {
  /**
   * Currently selected date string (YYYY-MM-DD) for the watering.
   * Should be provided by the parent from useGardenWater().pickerDate.
   */
  pickerDate: string

  /**
   * Callback when the user changes the date.
   * Should map to useGardenWater().setPickerDate.
   */
  onPickerDateChange: (date: string) => void

  /**
   * Whether a save/delete operation is in progress.
   */
  busy: boolean

  /**
   * Whether a previous watering record exists (show "delete" button).
   */
  hasExistingWatering: boolean

  /** Save handler */
  onSave: () => void

  /** Delete handler */
  onDelete: () => void

  /** Close/dismiss handler */
  onClose: () => void
}

export default function WaterLogSheet({
  pickerDate,
  onPickerDateChange,
  busy,
  hasExistingWatering,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const t = useT()

  // ── Water amount state (ml) ───────────────────────────────────────────────
  const [waterAmount, setWaterAmount] = useState(100)

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWaterAmount(Number(e.target.value))
  }

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
          <h2 className="text-base font-bold text-text mb-4">
            {t.mapPage.recordWatering ?? 'Water geven'}
          </h2>

          {/* Date picker row */}
          <div className="flex items-center gap-2 mb-5">
            <label className="text-sm text-text-muted shrink-0">
              {t.mapPage.date ?? 'Datum'}
            </label>
            <input
              type="date"
              value={pickerDate}
              max={todayStr}
              onChange={(e) => onPickerDateChange(e.target.value)}
              className="flex-1 text-sm bg-bg border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Water amount slider */}
          <div className="mb-5">
            <label className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-muted">Hoeveelheid water (ml)</span>
              <span className="font-semibold text-text tabular-nums">{waterAmount} ml</span>
            </label>

            {/* Custom slider track */}
            <div className="relative">
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                value={waterAmount}
                onChange={handleSliderChange}
                className="
                  w-full h-2 rounded-full appearance-none cursor-pointer
                  bg-border
                  accent-primary
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-grab
                  [&::-webkit-slider-thumb]:active:cursor-grabbing
                  [&::-moz-range-thumb]:w-5
                  [&::-moz-range-thumb]:h-5
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-primary
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:shadow-md
                "
              />
              {/* Tick marks (min/max labels) */}
              <div className="flex justify-between text-[11px] text-text-muted mt-1 px-0.5">
                <span>0 ml</span>
                <span>2000 ml</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={busy || !pickerDate}
              className="flex-1 bg-primary text-white rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-40 disabled:active:scale-100"
            >
              {busy ? '…' : (t.mapPage.saveLabel ?? 'Opslaan')}
            </button>

            {hasExistingWatering && (
              <button
                onClick={onDelete}
                disabled={busy}
                className="flex-1 bg-overdue/10 text-overdue rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-40 disabled:active:scale-100"
              >
                {t.mapPage.deleteLabel ?? 'Wis'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

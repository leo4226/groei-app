import type { FixedPlant } from '../../constants/fixedPlants'
import { useT } from '../../context/LanguageContext'

interface Props {
  plant: FixedPlant
  onClose: () => void
}

export default function FixedPlantSheet({ plant, onClose }: Props) {
  const t = useT()
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[calc(4rem+env(safe-area-inset-bottom))] animate-slide-up">
        <button
        onClick={onClose}
        aria-label="Sluiten"
        className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
      >
        <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
      </button>

        <div className="px-5 pb-5">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            {/* Tree icon */}
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: `${plant.markerColor}22`, border: `2px solid ${plant.markerColor}66` }}
            >
              🌳
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-text truncate">{plant.name}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                {/* Lock badge */}
                <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted bg-bg rounded-full px-2 py-0.5">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <rect x="1.5" y="4.5" width="7" height="5" rx="1" fill="currentColor" opacity="0.7" />
                    <path d="M3,4.5 L3,3 A2,2,0,0,1,7,3 L7,4.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
                  </svg>
                  {t.plantQuickSheet.fixed}
                </span>
              </div>
            </div>
          </div>

          {/* Note */}
          {plant.note && (
            <div className="bg-bg rounded-xl px-4 py-3 mb-4 text-sm text-text-muted leading-relaxed">
              {plant.note}
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full bg-bg text-text rounded-xl py-3 font-medium text-sm active:scale-[0.97] transition-transform"
          >
            {t.plantQuickSheet.close}
          </button>
        </div>
      </div>
    </>
  )
}

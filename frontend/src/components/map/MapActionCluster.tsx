import { useT } from '../../context/LanguageContext'
import { WaterStatusIcon } from '../PlantStatusIcon'
import type { GardenWaterStatus } from '../../api/client'

interface Props {
  isOutdoor: boolean
  waterStatus: GardenWaterStatus['status']
  sunActive: boolean
  sunAvailable: boolean
  inspectorMode: boolean
  onWater: () => void
  onFertilize: () => void
  onToggleSun: () => void
  onToggleInspector: () => void
  onAddPlant: () => void
}

export default function MapActionCluster({
  isOutdoor, waterStatus,
  sunActive, sunAvailable, inspectorMode,
  onWater, onFertilize, onToggleSun, onToggleInspector,
  onAddPlant,
}: Props) {
  const t = useT()

  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-full transition-colors"

  return (
    <div className="flex items-center gap-0.5 bg-surface/92 rounded-full border border-border/60 shadow-sm p-1" style={{ backdropFilter: 'blur(6px)' }}>
      <button onClick={onWater} title={t.mapPage.water} className={`${iconBtn} text-blue-600 hover:bg-blue-500/15`}>
        <WaterStatusIcon status={waterStatus} size={14} />
      </button>
      <button onClick={onFertilize} title={t.mapPage.fertilize} className={`${iconBtn} text-emerald-600 hover:bg-emerald-500/15`}>
        <span className="text-sm leading-none">🌿</span>
      </button>

      {/* Sun — indoor maps skip */}
      {isOutdoor && (
        <button
          onClick={sunAvailable ? onToggleSun : undefined}
          title={t.mapPage.sun}
          className={`${iconBtn} ${
            sunActive ? 'bg-amber-400/30 text-amber-700'
            : sunAvailable ? 'text-amber-600 hover:bg-amber-400/15'
            : 'text-amber-600/40 cursor-not-allowed'
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </button>
      )}

      {/* Inspect */}
      <button
        onClick={onToggleInspector}
        title={t.mapPage.inspect}
        className={`${iconBtn} ${inspectorMode ? 'bg-orange-500/30 text-orange-600' : 'text-orange-500 hover:bg-orange-500/15'}`}
      >
        <span className="text-xs font-bold">🔍</span>
      </button>

      {/* Add plant — primary, always last */}
      <button onClick={onAddPlant} title={t.mapPage.plant} className={`${iconBtn} bg-primary text-white hover:opacity-90`}>
        <span className="text-base font-bold leading-none">+</span>
      </button>
    </div>
  )
}

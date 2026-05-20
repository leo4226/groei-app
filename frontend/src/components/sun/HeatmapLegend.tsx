import { sunHoursToColor, skyOpennessToColor } from '../../utils/heatmapCalc'
import { bucketColor, type HeatmapLayer } from '../../utils/lightQuality'
import type { LightBucket } from '../../utils/lightQuality'
import { useT } from '../../context/LanguageContext'

interface Props {
  layer: HeatmapLayer
}

const SUN_STOPS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const SVF_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
const BUCKETS: LightBucket[] = ['full', 'part', 'bright_shade', 'deep_shade']

export default function HeatmapLegend({ layer }: Props) {
  const t = useT()
  if (layer === 'sun_hours') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-text-muted">0u</span>
        <div className="flex h-2.5 rounded-full overflow-hidden flex-1">
          {SUN_STOPS.map(h => (
            <div key={h} className="flex-1" style={{ backgroundColor: sunHoursToColor(h) }} />
          ))}
        </div>
        <span className="text-[10px] text-text-muted">8u+</span>
      </div>
    )
  }

  if (layer === 'sky_openness') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-text-muted">0%</span>
        <div className="flex h-2.5 rounded-full overflow-hidden flex-1">
          {SVF_STOPS.map(v => (
            <div key={v} className="flex-1" style={{ backgroundColor: skyOpennessToColor(v) }} />
          ))}
        </div>
        <span className="text-[10px] text-text-muted">100%</span>
      </div>
    )
  }

  // light_quality — four labelled swatches
  return (
    <div className="flex gap-1.5">
      {BUCKETS.map(b => (
        <div key={b} className="flex items-center gap-1 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: bucketColor(b) }}
          />
          <span className="text-[9px] text-text-muted truncate">{t.sun[`bucket${b === 'full' ? 'Full' : b === 'part' ? 'Part' : b === 'bright_shade' ? 'BrightShade' : 'DeepShade'}`]}</span>
        </div>
      ))}
    </div>
  )
}

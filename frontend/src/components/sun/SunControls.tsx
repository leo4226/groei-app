import { PLANT_SUN_PROFILES } from '../../utils/plantSunRequirements'
import { bucketFor, bucketLabelNl, bucketColor, type HeatmapLayer } from '../../utils/lightQuality'
import HeatmapLegend from './HeatmapLegend'
import type { SunVisualization } from '../../hooks/useSunVisualization'

export type SunViewMode = 'live' | 'heatmap'
export type { HeatmapLayer }

interface Props {
  sun: SunVisualization
}

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']

const LAYERS: { id: HeatmapLayer; label: string }[] = [
  { id: 'sun_hours',     label: 'Directe zon' },
  { id: 'sky_openness',  label: 'Hemelzicht' },
  { id: 'light_quality', label: 'Lichttype' },
]

function formatTime(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function TappedCellInfo({
  cell, layer, month, onGrowHere,
}: {
  cell: HeatmapCell
  layer: HeatmapLayer
  month: number
  onGrowHere?: () => void
}) {
  const monthName = MONTHS[month - 1]

  let label: React.ReactNode
  if (layer === 'sun_hours') {
    label = (
      <>
        Dit punt krijgt{' '}
        <span className="text-text font-medium">~{cell.sunHours.toFixed(1)}u</span>{' '}
        directe zon in {monthName}
      </>
    )
  } else if (layer === 'sky_openness') {
    const pct = Math.round(cell.skyOpenness * 100)
    label = (
      <>
        Hemelzicht: <span className="text-text font-medium">{pct}%</span>
        {' · '}
        {cell.sunHours.toFixed(1)}u directe zon
      </>
    )
  } else {
    const bucket = bucketFor(cell.sunHours, cell.skyOpenness)
    const color  = bucketColor(bucket)
    label = (
      <span className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block" style={{ backgroundColor: color }} />
        <span className="font-medium" style={{ color }}>{bucketLabelNl(bucket)}</span>
        <span className="text-text-muted">·</span>
        <span>{cell.sunHours.toFixed(1)}u · {Math.round(cell.skyOpenness * 100)}% hemel</span>
      </span>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-text-muted">{label}</p>
      <button
        onClick={onGrowHere}
        className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
      >
        Wat kan hier? →
      </button>
    </div>
  )
}

export default function SunControls({ sun }: Props) {
  const { viewMode, setViewMode, month, hour, setMonth, setHour, setToNow,
          sunPosition, layer, setLayer, cells: _, isCalculating, tappedCell,
          profile, setProfile, closeGrowHere: _close } = sun

  return (
    <div className="shrink-0 mt-2 bg-surface rounded-xl border border-border p-3 space-y-2">
      {/* Live / Zonkaart toggle */}
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
        <button
          onClick={() => setViewMode('live')}
          className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            viewMode === 'live' ? 'bg-pumpkin-swirl/25 text-pumpkin-swirl' : 'text-text-muted'
          }`}
        >
          Live
        </button>
        <button
          onClick={() => setViewMode('heatmap')}
          className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            viewMode === 'heatmap' ? 'bg-pumpkin-swirl/25 text-pumpkin-swirl' : 'text-text-muted'
          }`}
        >
          Zonkaart
        </button>
      </div>

      {/* Month pills — shown in both modes */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {MONTHS.map((label, i) => {
          const m = i + 1
          const isActive = m === month
          return (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-pumpkin-swirl/30 text-pumpkin-swirl'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Live mode: time slider + sun info */}
      {viewMode === 'live' && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted w-10 shrink-0">04:00</span>
            <input
              type="range"
              min={4}
              max={22}
              step={0.25}
              value={hour}
              onChange={e => setHour(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-pumpkin-swirl cursor-pointer"
            />
            <span className="text-xs text-text-muted w-10 shrink-0 text-right">22:00</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">
              {formatTime(hour)}
              {sunPosition && (
                <span className="text-text-muted font-normal ml-2">
                  {sunPosition.isUp
                    ? `${sunPosition.altitudeDeg.toFixed(0)}° boven horizon`
                    : 'Onder horizon'}
                </span>
              )}
            </span>
            <button
              onClick={setToNow}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-pumpkin-swirl/20 text-pumpkin-swirl hover:bg-pumpkin-swirl/30 transition-colors"
            >
              Nu
            </button>
          </div>
        </>
      )}

      {/* Heatmap mode: layer toggle + legend + filters + tapped cell */}
      {viewMode === 'heatmap' && (
        <>
          {/* Layer sub-toggle */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
            {LAYERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setLayer(id)}
                className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  layer === id ? 'bg-white/30 text-white shadow-sm' : 'text-text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <HeatmapLegend layer={layer} />

          {/* Plant suitability filter chips — only meaningful for sun_hours layer */}
          {layer === 'sun_hours' && (
            <div className="flex gap-1.5 flex-wrap">
              {PLANT_SUN_PROFILES.map(p => {
                const isActive = profile?.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setProfile(isActive ? null : p)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      isActive ? 'text-white' : 'text-text-muted hover:bg-white/5'
                    }`}
                    style={isActive ? { backgroundColor: p.color + '55' } : undefined}
                  >
                    <span>{p.emoji}</span>
                    <span>{p.labelNl}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Tapped cell info + grow-here CTA */}
          {tappedCell && (
            <TappedCellInfo
              cell={tappedCell}
              layer={layer}
              month={month}
              onGrowHere={sun.openGrowHere}
            />
          )}

          {isCalculating && (
            <div className="text-xs text-pumpkin-swirl animate-pulse">Berekenen...</div>
          )}
        </>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MapView from '../components/map/MapView'
import SunControls from '../components/sun/SunControls'
import Glyph from '../components/ui/Glyph'
import { useSunVisualization } from '../hooks/useSunVisualization'
import { useT } from '../context/LanguageContext'
import { DEMO_BIODIVERSITY, DEMO_MAP, DEMO_OBJECTS, DEMO_PLANTS } from '../demo/demoGarden'
import type { CanvasData } from '../types'

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Compact, static biodiversity summary for the demo garden. The real app
 * computes this live per garden (GardenBiodiversityCard); the demo shows a
 * snapshot so the public page needs no backend. */
function DemoBiodiversityCard() {
  const t = useT()
  const bio = DEMO_BIODIVERSITY
  const max = Math.max(...bio.bloomMonths)
  return (
    <div className="w-[230px] rounded-2xl border border-border bg-surface/95 p-3.5 shadow-lg backdrop-blur max-sm:hidden">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-text">{t.garden.biodiversity.title}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary">{bio.score}</span>
      </div>
      <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-text-soft">
        {t.garden.biodiversity.speciesCount(bio.speciesCount)} · {t.garden.biodiversity.nativeCount(bio.nativeCount)}
      </p>
      <p className="m-0 text-[12px] leading-[1.5] text-text-soft">
        {t.garden.biodiversity.drachtplantCount(bio.drachtplantCount)}
      </p>
      <p className="m-0 mt-1 text-[12px] font-medium leading-[1.5] text-primary">
        {t.garden.bees.supportedCount(bio.beeSpecies)}
      </p>
      <div className="mt-2.5">
        <p className="m-0 mb-1 text-[10px] uppercase tracking-wide text-text-muted">
          {t.garden.biodiversity.pollinatorMonths}
        </p>
        <div className="flex h-8 items-end gap-[3px]">
          {bio.bloomMonths.map((v, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${v > 0 ? 'bg-primary/70' : 'bg-border'}`}
              style={{ height: `${Math.max(9, (v / max) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex gap-[3px]">
          {MONTH_LETTERS.map((m, i) => (
            <span key={i} className="flex-1 text-center text-[8px] leading-none text-text-muted">{m}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DemoGardenPage() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Recorder mode (?rec=1) hides all chrome so Playwright can capture clean
  // frames for the landing-page video.
  const rec = params.get('rec') === '1'

  const canvasData = useMemo(
    () => JSON.parse(DEMO_MAP.canvas_data!) as CanvasData,
    [],
  )

  const sun = useSunVisualization({
    isOutdoor: true,
    lat: DEMO_MAP.lat!,
    lon: DEMO_MAP.lon!,
    bearing: DEMO_MAP.bearing,
    canvasData,
    plants: DEMO_PLANTS,
    mapId: DEMO_MAP.id,
  })

  // Sun mode is the whole point of the demo: enable it on mount, honouring
  // optional ?view=&month=&hour= (used by the video recorder and deep links).
  const initialised = useRef(false)
  const { active, toggle, setViewMode, setMonth, setHour } = sun
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true
    if (!active) toggle()
    if (params.get('view') === 'heatmap') setViewMode('heatmap')
    const month = Number(params.get('month'))
    if (Number.isInteger(month) && month >= 1 && month <= 12) setMonth(month)
    const hour = params.get('hour')
    if (hour !== null && !Number.isNaN(Number(hour))) setHour(Number(hour))
  }, [active, toggle, setViewMode, setMonth, setHour, params])

  // Recorder hook: lets Playwright step time without reloading the page.
  useEffect(() => {
    const w = window as unknown as { __demoSun?: object }
    w.__demoSun = { setHour, setMonth, setView: setViewMode }
    return () => { delete w.__demoSun }
  }, [setHour, setMonth, setViewMode])

  return (
    <div className="relative h-full overflow-hidden">
      <div className={rec ? 'absolute inset-0 [&_.map-zoom-controls]:hidden' : 'absolute top-12 bottom-14 left-0 right-0'}>
        <MapView
          map={DEMO_MAP}
          plants={DEMO_PLANTS}
          objects={DEMO_OBJECTS}
          labelMode="smart"
          showWarnings={false}
          hideLockBadges
          sunModeActive={sun.active}
          shadows={sun.shadows}
          sunPosition={sun.sunPosition}
          heatmapCells={sun.cells}
          heatmapCalculating={sun.isCalculating}
          heatmapLayer="sun_hours"
          heatmapProfile={sun.isHeatmapActive ? sun.profile : undefined}
          onHeatmapCellTap={sun.isHeatmapActive ? sun.handleCellTap : undefined}
          gardenPerimeter={sun.gardenPerimeter}
          gardenBounds={sun.gardenBounds}
          gardenViewBox={sun.gardenViewBox}
        />
      </div>

      {/* Bottom: sun controls (kept in recorder mode — they're part of the story) */}
      <div className="absolute bottom-3 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 px-3">
        {!rec && (
          <p className="m-0 mb-1.5 text-center text-[11px] leading-snug text-text-soft [text-shadow:0_1px_2px_var(--color-bg)]">
            {t.demo.hint}
          </p>
        )}
        <div className="rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
          <SunControls
            viewMode={sun.viewMode}
            onViewModeChange={sun.setViewMode}
            selectedMonth={sun.month}
            selectedHour={sun.hour}
            sunPosition={sun.sunPosition}
            onMonthChange={sun.setMonth}
            onHourChange={sun.setHour}
            onNow={sun.setToNow}
            isCalculating={sun.isCalculating}
            tappedCell={sun.tappedCell}
            selectedProfile={sun.profile}
            onProfileChange={sun.setProfile}
            estimatePlantShade={sun.estimatePlantShade}
            onToggleEstimatePlantShade={sun.toggleEstimatePlantShade}
          />
        </div>
      </div>

      {!rec && (
        <>
          {/* Top-left: garden name + demo badge */}
          <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full border border-border bg-surface/95 py-1.5 pl-3.5 pr-2 shadow-lg backdrop-blur">
            <span className="text-sm font-semibold text-text">{t.demo.gardenName}</span>
            <span className="rounded-full bg-amber-400/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              {t.demo.badge}
            </span>
          </div>

          {/* Top-right: create-your-own CTA + biodiversity snapshot */}
          <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
            >
              {t.demo.cta}
              <Glyph name="chevron-right" size={14} />
            </button>
            <DemoBiodiversityCard />
          </div>
        </>
      )}
    </div>
  )
}

import { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HeatmapCell } from '../../utils/heatmapCalc'
import type { MapPlant } from '../../types'
import { PLANT_SUN_PROFILES, getSunFit } from '../../utils/plantSunRequirements'
import { LOCAL_PLANTS, type LocalPlant } from '../../data/plants-dataset'
import { fetchGrowHereSuggestions, type GrowHereResponse, type AISuggestion } from '../../api/client'
import { useGroeiStore } from '../../store/useGroeiStore'

const MONTHS_NL = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']

// Module-level cache — survives sheet open/close within the session
const _aiCache = new Map<string, GrowHereResponse>()

function cacheKey(sunHours: number, month: number) {
  return `${Math.round(sunHours * 10)}_${month}`
}

interface Props {
  tappedCell: HeatmapCell
  selectedMonth: number
  mapPlants: MapPlant[]
  mapId: number | null
  onClose: () => void
}

function sunCategoryLabel(hours: number): { label: string; emoji: string } {
  if (hours >= 6) return { label: 'Volle zon', emoji: '☀️' }
  if (hours >= 3) return { label: 'Half zon', emoji: '⛅' }
  return { label: 'Schaduw', emoji: '🌿' }
}

function sunReqId(hours: number): string {
  if (hours >= 6) return 'full_sun'
  if (hours >= 3) return 'partial_sun'
  return 'shade'
}

const SUN_FIT_BADGE: Record<string, { label: string; className: string }> = {
  perfect:    { label: 'Perfect',    className: 'bg-good/15 text-good' },
  good:       { label: 'Goed',       className: 'bg-good/15 text-good' },
  acceptable: { label: 'Acceptabel', className: 'bg-due/15 text-due' },
}

function AISuggestionCard({ s, onAdd, loading, disabled }: { s: AISuggestion; onAdd: () => void; loading?: boolean; disabled?: boolean }) {
  const badge = SUN_FIT_BADGE[s.sunFit]
  return (
    <div className="card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-text">{s.dutchName || s.commonName}</p>
            {badge && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.className}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted italic">{s.latinName}</p>
        </div>
        <button
          onClick={onAdd}
          disabled={disabled}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '+ Voeg toe'}
        </button>
      </div>
      <p className="text-xs text-text-muted leading-relaxed">{s.reasoning}</p>
      {s.caveat && (
        <p className="text-xs text-pumpkin-swirl/80 leading-relaxed">⚠ {s.caveat}</p>
      )}
      {s.companionNote && (
        <p className="text-xs text-text-muted/70 leading-relaxed">🌿 {s.companionNote}</p>
      )}
    </div>
  )
}

function AISkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="card p-3 space-y-2">
          <div className="flex justify-between gap-2">
            <div className="space-y-1.5 flex-1">
              <div className="skeleton h-4 w-2/5 rounded" />
              <div className="skeleton h-3 w-1/3 rounded" />
            </div>
            <div className="skeleton h-7 w-20 rounded-xl" />
          </div>
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function GrowHereSheet({ tappedCell, selectedMonth, mapPlants, mapId, onClose }: Props) {
  const navigate = useNavigate()
  const { addPlant } = useGroeiStore()
  const { sunHours } = tappedCell
  const { label: catLabel, emoji: catEmoji } = sunCategoryLabel(sunHours)
  const spotReqId = sunReqId(sunHours)
  const profile = PLANT_SUN_PROFILES.find(p => p.id === spotReqId)

  // AI state
  const [aiData, setAiData] = useState<GrowHereResponse | null>(() => _aiCache.get(cacheKey(sunHours, selectedMonth)) ?? null)
  const [aiLoading, setAiLoading] = useState(!_aiCache.has(cacheKey(sunHours, selectedMonth)))
  const [aiError, setAiError] = useState(false)

  // Adding state — tracks which plant name is being added
  const [addingName, setAddingName] = useState<string | null>(null)

  // User's own map plants that fit this spot
  const userMatches = useMemo(() =>
    mapPlants.filter(p => {
      if (!p.sun_requirement) return false
      const fit = getSunFit(p.sun_requirement, sunHours)
      return fit === 'good' || fit === 'partial'
    }),
    [mapPlants, sunHours]
  )

  // Species already in garden for deduplication
  const userSpecies = useMemo(() =>
    new Set(mapPlants.map(p => p.species?.toLowerCase()).filter(Boolean)),
    [mapPlants]
  )

  // LOCAL_PLANTS that fit and aren't already in garden
  const datasetMatches = useMemo((): LocalPlant[] =>
    LOCAL_PLANTS
      .filter(lp => {
        if (userSpecies.has(lp.latinName.toLowerCase())) return false
        const fit = getSunFit(lp.sunRequirement, sunHours)
        return fit === 'good' || fit === 'partial'
      })
      .slice(0, 12),
    [sunHours, userSpecies]
  )

  // Fetch AI suggestions on mount (unless already cached)
  useEffect(() => {
    const key = cacheKey(sunHours, selectedMonth)
    if (_aiCache.has(key)) return

    const existingPlantNames = mapPlants.map(p => p.species ?? p.name)

    fetchGrowHereSuggestions(sunHours, selectedMonth, existingPlantNames)
      .then(data => {
        _aiCache.set(key, data)
        setAiData(data)
        setAiLoading(false)
      })
      .catch(() => {
        setAiError(true)
        setAiLoading(false)
      })
  }, [sunHours, selectedMonth, mapPlants])

  async function handleAddToGarden(name: string, species: string, sunReq?: string) {
    if (addingName) return
    setAddingName(name)
    try {
      // Center of the tapped cell in SVG coordinates
      const mapX = Math.round((tappedCell.x + tappedCell.w / 2) * 10) / 10
      const mapY = Math.round((tappedCell.y + tappedCell.h / 2) * 10) / 10
      const plant = await addPlant({
        name,
        species: species || undefined,
        sun_requirement: sunReq ?? spotReqId,
        map_id: mapId ?? undefined,
        map_x: mapId != null ? mapX : undefined,
        map_y: mapId != null ? mapY : undefined,
        care_schedules: [{ care_type: 'water', interval_days: 3 }],
      })
      onClose()
      navigate(`/plants/${plant.id}`)
    } catch {
      setAddingName(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative pointer-events-auto bg-bg rounded-t-2xl border-t border-border max-h-[82vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-xs text-text-muted mb-0.5">
                {MONTHS_NL[selectedMonth - 1]} · {catEmoji} {catLabel}
              </p>
              <h2 className="text-lg font-bold text-text">Wat kan hier groeien?</h2>
              <p className="text-sm text-text-muted mt-0.5">
                {aiData?.spotSummary ?? (
                  <>
                    Dit punt krijgt{' '}
                    <span className="text-text font-medium">~{sunHours.toFixed(1)}u</span>{' '}
                    directe zon
                  </>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text transition-colors p-1 shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Sun bar */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (sunHours / 10) * 100)}%`,
                  backgroundColor: profile?.color ?? '#f0a020',
                }}
              />
            </div>
            <span className="text-xs text-text-muted shrink-0">{sunHours.toFixed(1)}u / dag</span>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-5">

          {/* User's own plants that fit */}
          {userMatches.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Al in uw tuin
              </h3>
              <div className="flex flex-wrap gap-2">
                {userMatches.map(p => (
                  <span
                    key={p.id}
                    className="px-3 py-1 rounded-full bg-surface border border-border text-sm text-text"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Local dataset matches */}
          {datasetMatches.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Suggesties
              </h3>
              <div className="space-y-2">
                {datasetMatches.map(lp => {
                  const fit = getSunFit(lp.sunRequirement, sunHours)
                  return (
                    <div key={lp.id} className="card p-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-text">{lp.dutchName}</p>
                          {fit === 'good' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-good/15 text-good">Perfect</span>
                          )}
                          {fit === 'partial' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-due/15 text-due">Acceptabel</span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted italic">{lp.latinName}</p>
                        {lp.amsterdamNotes && (
                          <p className="text-xs text-text-muted mt-1 leading-relaxed">{lp.amsterdamNotes}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddToGarden(lp.dutchName, lp.latinName, lp.sunRequirement)}
                        disabled={!!addingName}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
                      >
                        {addingName === lp.dutchName ? '...' : '+ Voeg toe'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* AI suggestions */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              AI Suggesties
            </h3>
            {aiLoading && <AISkeleton />}
            {!aiLoading && aiError && (
              <p className="text-xs text-text-muted">Kon geen AI suggesties laden.</p>
            )}
            {!aiLoading && !aiError && aiData && (
              <div className="space-y-2">
                {aiData.suggestions.map((s, i) => (
                  <AISuggestionCard
                    key={i}
                    s={s}
                    onAdd={() => handleAddToGarden(s.dutchName || s.commonName, s.latinName)}
                    loading={addingName === (s.dutchName || s.commonName)}
                    disabled={!!addingName}
                  />
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SpotInspectorResult, SpeciesSuggestion } from '../../hooks/useSpotInspector'
import { garden as gardenApi, type GrowHereResponse, type AISuggestion } from '../../api/client'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import type { PlantRecommendation, MapPlant } from '../../types'

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

interface Props {
  result: SpotInspectorResult
  loading: boolean
  onClose: () => void
  mapId: number | null
  month: number       // 1-12, selected month from sun controls
  mapPlants: MapPlant[]
}

export default function SpotInspectorSheet({ result, loading, onClose, mapId, month, mapPlants }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const { addPlant } = useFloreren()

  const sunHours = result.sunByMonth[month - 1] ?? 0
  const maxSun = Math.max(...result.sunByMonth, 1)
  const suitable = result.species.filter(s => s.tier === 'suitable')
  const marginal = result.species.filter(s => s.tier === 'marginal')

  const [dbRecs, setDbRecs] = useState<PlantRecommendation[] | null>(null)
  const [dbLoading, setDbLoading] = useState(false)
  const [aiData, setAiData] = useState<GrowHereResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [addingName, setAddingName] = useState<string | null>(null)

  useEffect(() => {
    if (mapId == null) return
    setDbLoading(true)
    setDbRecs(null)
    gardenApi.recommendations(mapId, sunHours, month)
      .then(d => { setDbRecs(d.recommendations); setDbLoading(false) })
      .catch(() => { setDbRecs([]); setDbLoading(false) })
  }, [mapId, month, sunHours])

  async function handleAdd(name: string, species: string) {
    if (addingName) return
    setAddingName(name)
    try {
      const plant = await addPlant({
        name,
        species: species || undefined,
        map_id: mapId ?? undefined,
        map_x: mapId != null ? Math.round(result.x) : undefined,
        map_y: mapId != null ? Math.round(result.y) : undefined,
        care_schedules: [{ care_type: 'water', interval_days: 3 }],
      })
      onClose()
      navigate(`/plants/${plant.id}`)
    } catch {
      setAddingName(null)
    }
  }

  function loadAI() {
    if (aiLoading || aiData) return
    setAiLoading(true)
    const existingNames = mapPlants.map(p => p.species ?? p.name)
    gardenApi.growHere(sunHours, month, existingNames)
      .then(d => { setAiData(d); setAiLoading(false) })
      .catch(() => setAiLoading(false))
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[calc(4rem+env(safe-area-inset-bottom))] animate-slide-up max-h-[82vh] overflow-y-auto">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 sticky top-0 bg-surface border-b border-border">
          <div>
            <h2 className="font-semibold text-text">{t.spotInspector.title}</h2>
            <p className="text-xs text-text-muted">
              {sunHours.toFixed(1)}u zon · {t.calendar.monthsShort[month - 1]}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none">✕</button>
        </div>

        <div className="px-5 pb-5 space-y-5">
          {/* Sun bar chart */}
          <div className="mt-3">
            <p className="text-xs font-medium text-text-muted mb-2">{t.spotInspector.sunPerMonth}</p>
            <div className="flex items-end gap-px h-14">
              {result.sunByMonth.map((sun, i) => {
                const maxPx = 48
                const barPx = Math.max((sun / maxSun) * maxPx, 2)
                const isSelected = i === month - 1
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className={`w-full rounded-sm flex items-center justify-center ${
                        isSelected ? 'bg-amber-400' : 'bg-amber-200/60'
                      }`}
                      style={{ height: `${barPx}px`, minHeight: sun >= 0.5 ? '14px' : '2px' }}
                      title={`${MONTH_LABELS[i]}: ${sun.toFixed(1)}u`}
                    >
                      {sun >= 0.5 && (
                        <span className="text-[7px] font-bold text-black/60 leading-none">
                          {sun.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-text-muted leading-none mt-0.5">{MONTH_LABELS[i]}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {loading && (
            <div className="text-center py-6 text-text-muted text-sm">{t.spotInspector.loading}</div>
          )}

          {!loading && result.error && (
            <p className="text-sm text-overdue text-center py-4">{result.error}</p>
          )}

          {!loading && !result.error && (
            <>
              {/* Existing plants that fit */}
              {suitable.length > 0 && (
                <section>
                  <p className="text-xs font-semibold text-good mb-2">{t.spotInspector.suitable} ({suitable.length})</p>
                  <div className="space-y-2">
                    {suitable.map(s => <SpeciesCard key={s.species_id} species={s} />)}
                  </div>
                </section>
              )}
              {marginal.length > 0 && (
                <section>
                  <p className="text-xs font-semibold text-due mb-2">{t.spotInspector.marginal} ({marginal.length})</p>
                  <div className="space-y-2">
                    {marginal.map(s => <SpeciesCard key={s.species_id} species={s} />)}
                  </div>
                </section>
              )}

              {/* DB recommendations */}
              {mapId != null && (
                <section>
                  <p className="text-xs font-semibold text-text-muted mb-2">{t.growHere.dbSuggestions}</p>
                  {dbLoading && (
                    <div className="space-y-2">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="bg-bg rounded-xl p-3">
                          <div className="skeleton h-4 w-3/5 rounded" />
                        </div>
                      ))}
                    </div>
                  )}
                  {!dbLoading && dbRecs && dbRecs.length === 0 && (
                    <p className="text-xs text-text-muted">{t.growHere.noDbResults}</p>
                  )}
                  {!dbLoading && dbRecs && dbRecs.length > 0 && (
                    <div className="space-y-2">
                      {dbRecs.map(rec => (
                        <div key={rec.species_id} className="bg-bg rounded-xl px-3 py-2.5 flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text">{rec.dutch_name}</p>
                            <p className="text-[10px] text-text-muted italic">{rec.latin_name}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${rec.sun_fit === 'perfect' ? 'bg-amber-400/20 text-amber-600' : 'bg-surface text-text-muted border border-border/50'}`}>
                                {rec.sun_fit === 'perfect' ? '☀️ ' + t.growHere.sunFitPerfect : '⛅ ' + t.growHere.sunFitAcceptable}
                              </span>
                              {(rec.pollinator_value ?? 0) >= 3 && (
                                <span className="text-[9px] bg-amber-400/15 text-amber-700 px-1.5 py-0.5 rounded-full">{t.growHere.ecologyPollinatorHigh}</span>
                              )}
                              {(rec.pollinator_value ?? 0) === 2 && (
                                <span className="text-[9px] bg-amber-400/10 text-amber-700 px-1.5 py-0.5 rounded-full">{t.growHere.ecologyPollinatorGood}</span>
                              )}
                              {rec.is_native && (
                                <span className="text-[9px] bg-green-500/15 text-green-700 px-1.5 py-0.5 rounded-full">{t.growHere.ecologyNative}</span>
                              )}
                              {rec.gap_months_covered.length > 0 && (
                                <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                  {t.growHere.ecologyFillsGap.replace('{months}', rec.gap_months_covered.map(m => ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][m-1]).join(', '))}
                                </span>
                              )}
                            </div>
                            {rec.reason && <p className="text-xs text-text-muted mt-1 leading-relaxed">{rec.reason}</p>}
                          </div>
                          <button
                            onClick={() => handleAdd(rec.dutch_name, rec.latin_name)}
                            disabled={!!addingName}
                            className="shrink-0 px-2.5 py-1 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
                          >
                            {addingName === rec.dutch_name ? t.growHere.addLoading : t.growHere.add}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* AI suggestions */}
              <section>
                <p className="text-xs font-semibold text-text-muted mb-2">{t.growHere.aiSuggestions}</p>
                {!aiData && !aiLoading && (
                  <button
                    onClick={loadAI}
                    className="w-full py-2.5 rounded-xl border border-border/60 text-xs text-text-muted hover:bg-bg transition-colors"
                  >
                    ✨ {t.growHere.aiSuggestions}
                  </button>
                )}
                {aiLoading && (
                  <div className="space-y-2">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="bg-bg rounded-xl p-3 space-y-2">
                        <div className="skeleton h-4 w-2/5 rounded" />
                        <div className="skeleton h-3 w-full rounded" />
                      </div>
                    ))}
                  </div>
                )}
                {aiData && aiData.suggestions.length > 0 && (
                  <div className="space-y-2">
                    {aiData.suggestions.map((s, i) => (
                      <AISuggestionCard
                        key={i}
                        s={s}
                        onAdd={() => handleAdd(s.dutchName || s.commonName, s.latinName)}
                        addingName={addingName}
                        t={t.growHere}
                      />
                    ))}
                  </div>
                )}
                {aiData && aiData.suggestions.length === 0 && (
                  <p className="text-xs text-text-muted">{t.growHere.aiError}</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function AISuggestionCard({ s, onAdd, addingName, t }: {
  s: AISuggestion
  onAdd: () => void
  addingName: string | null
  t: ReturnType<typeof import('../../context/LanguageContext').useT>['growHere']
}) {
  return (
    <div className="bg-bg rounded-xl px-3 py-2.5 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{s.dutchName || s.commonName}</p>
        <p className="text-[10px] text-text-muted italic">{s.latinName}</p>
        {s.reasoning && <p className="text-xs text-text-muted mt-1 leading-relaxed">{s.reasoning}</p>}
        {s.caveat && <p className="text-xs text-amber-400/80 mt-0.5">⚠ {s.caveat}</p>}
      </div>
      <button
        onClick={onAdd}
        disabled={!!addingName}
        className="shrink-0 px-2.5 py-1 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
      >
        {addingName === (s.dutchName || s.commonName) ? t.addLoading : t.add}
      </button>
    </div>
  )
}

function SpeciesCard({ species }: { species: SpeciesSuggestion }) {
  const t = useT()
  const fmt = (months: number[]) => months.map(m => MONTH_NAMES_NL[m - 1]).join(', ')

  return (
    <div className="bg-bg rounded-xl px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">{species.common_name_nl}</p>
          {species.latin_name && (
            <p className="text-[10px] text-text-muted italic">{species.latin_name}</p>
          )}
        </div>
        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full mt-0.5 ${
          species.tier === 'suitable'
            ? 'bg-amber-400/20 text-amber-600'
            : 'bg-surface border border-border/50 text-text-muted'
        }`}>
          {species.tier === 'suitable' ? '☀️ ' + t.growHere.sunFitPerfect : '⛅ ' + t.growHere.sunFitAcceptable}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {species.sow_window.length > 0 && (
          <span className="text-[9px] bg-green-500/15 text-green-700 px-1.5 py-0.5 rounded-full">
            {t.spotInspector.sow} {fmt(species.sow_window)}
          </span>
        )}
        {species.transplant_window.length > 0 && (
          <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
            {t.spotInspector.plant} {fmt(species.transplant_window)}
          </span>
        )}
        {species.harvest_window.length > 0 && (
          <span className="text-[9px] bg-amber-500/15 text-amber-700 px-1.5 py-0.5 rounded-full">
            {t.spotInspector.harvest} {fmt(species.harvest_window)}
          </span>
        )}
        {species.frost_sensitive && (
          <span className="text-[9px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded-full">
            {t.spotInspector.frostSensitive}
          </span>
        )}
      </div>
      {species.avg_shortfall_hours > 0 && (
        <p className="text-[9px] text-due mt-1">
          {t.spotInspector.deficitPerDay.replace('{hours}', species.avg_shortfall_hours.toFixed(1))}
        </p>
      )}
    </div>
  )
}

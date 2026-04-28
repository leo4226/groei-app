import { useParams, useNavigate } from 'react-router-dom'
import { usePlantCareInfo } from '../hooks/usePlantCareInfo'
import type { PlantNotesData } from '../hooks/usePlantCareInfo'
import { useRainContext } from '../hooks/useRainContext'

const MONTHS_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MONTHS_FULL  = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
]

const LIGHT_LABEL: Record<string, string> = {
  shade: 'Schaduw',
  partial: 'Halfschaduw',
  full_sun: 'Volle zon',
}

const RAIN_BADGE: Record<string, { label: string; className: string }> = {
  well_watered: { label: 'Goed bewaterd', className: 'bg-good/15 text-good' },
  moderate:     { label: 'Matig',         className: 'bg-due/15 text-due' },
  dry:          { label: 'Droog',         className: 'bg-secondary/15 text-secondary' },
  very_dry:     { label: 'Erg droog',     className: 'bg-overdue/15 text-overdue' },
}

// Amsterdam average precipitation: ~800mm/year
const AMS_PRECIP = 800

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <p className="text-[11px] font-bold tracking-widest uppercase text-text-muted mb-2">{title}</p>
      {children}
    </section>
  )
}

function SkeletonBlock({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-border rounded animate-pulse`} />
}

export default function PlantCareDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const plantId   = Number(id)

  const care = usePlantCareInfo(plantId)
  const rain = useRainContext()

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/plants/${plantId}`)
  }

  // Amsterdam water context
  const waterContext = (() => {
    const min = care.data?.precip_min_mm
    const max = care.data?.precip_max_mm
    if (min == null && max == null) return null
    if (min != null && max != null) {
      if (min <= AMS_PRECIP && AMS_PRECIP <= max)
        return { ok: true, text: '✓ Amsterdam (~800mm/jaar) is geschikt' }
      if (AMS_PRECIP < min)
        return { ok: false, text: '⚠ Heeft meer regen nodig dan Amsterdam geeft — regelmatig bijwateren' }
      return { ok: false, text: '⚠ Amsterdam kan te nat zijn — goede drainage nodig' }
    }
    return null
  })()

  const bloomSet = new Set((care.data?.bloom_months ?? []).map(m => m.toLowerCase()))

  const parsedNotes = (() => {
    if (!care.data?.plant_notes) return null
    try { return JSON.parse(care.data.plant_notes) as PlantNotesData }
    catch { return null }
  })()

  return (
    <div className="pb-10">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="w-8 h-8 rounded-full bg-bg flex items-center justify-center text-text shrink-0"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          {care.loading ? (
            <SkeletonBlock h="h-4" w="w-40" />
          ) : (
            <>
              <p className="text-sm font-bold text-text truncate leading-tight">
                {care.data?.common_name ?? care.data?.scientific_name ?? 'Verzorgingsgids'}
              </p>
              {care.data?.scientific_name && care.data.common_name && (
                <p className="text-xs text-text-muted italic truncate leading-tight">
                  {care.data.scientific_name}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Plant image */}
      {care.data?.image_url ? (
        <img src={care.data.image_url} alt={care.data.common_name ?? ''} className="w-full h-48 object-cover" />
      ) : !care.loading && (
        <div className="w-full h-28 bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center text-5xl">🌿</div>
      )}

      <div className="px-4 pt-5">
        {care.loading ? (
          <div className="space-y-6">
            {[1,2,3].map(i => (
              <div key={i} className="space-y-2">
                <SkeletonBlock h="h-3" w="w-16" />
                <SkeletonBlock h="h-2" w="w-full" />
                <SkeletonBlock h="h-3" w="w-40" />
              </div>
            ))}
          </div>
        ) : care.data?.source === 'not_found' ? (
          <div className="text-center py-12 text-text-muted">
            <p className="text-3xl mb-3">🌿</p>
            <p className="text-sm">Geen verzorgingsinfo beschikbaar</p>
          </div>
        ) : care.error ? (
          <div className="text-center py-12 text-text-muted">
            <p className="text-sm">Kon verzorgingsinfo niet laden</p>
            <button onClick={() => window.location.reload()} className="mt-2 text-xs text-primary underline">
              Opnieuw proberen
            </button>
          </div>
        ) : care.data ? (
          <>
            {/* Light */}
            {care.data.light_raw != null && (
              <Section title="Licht">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{ width: `${(care.data.light_raw / 10) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-muted shrink-0">
                    {care.data.light_raw}/10
                  </span>
                </div>
                <p className="text-sm text-text">
                  {LIGHT_LABEL[care.data.light_label ?? ''] ?? care.data.light_label ?? '—'}
                </p>
              </Section>
            )}

            {/* Water */}
            {(care.data.precip_min_mm != null || care.data.precip_max_mm != null) && (
              <Section title="Water">
                <p className="text-sm text-text mb-1">
                  {care.data.precip_min_mm}–{care.data.precip_max_mm} mm/jaar neerslag
                </p>
                {waterContext && (
                  <p className={`text-xs font-medium ${waterContext.ok ? 'text-good' : 'text-due'}`}>
                    {waterContext.text}
                  </p>
                )}
              </Section>
            )}

            {/* Bloom calendar */}
            {bloomSet.size > 0 && (
              <Section title="Bloeikalender">
                <div className="flex gap-0.5">
                  {MONTHS_SHORT.map((abbr, i) => {
                    const active = bloomSet.has(MONTHS_FULL[i])
                    return (
                      <div key={abbr} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full aspect-square rounded-full flex items-center justify-center text-[9px] font-bold
                          ${active ? 'bg-primary text-white' : 'bg-border text-transparent'}`}>
                          {active ? '●' : '·'}
                        </div>
                        <span className="text-[8px] text-text-muted leading-none">{abbr}</span>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Characteristics */}
            {(care.data.duration || care.data.leaf_retention != null ||
              care.data.avg_height_cm != null || care.data.flower_colors.length > 0 ||
              care.data.toxicity || care.data.edible != null) && (
              <Section title="Kenmerken">
                <div className="space-y-1.5 text-sm text-text-muted">
                  {(care.data.duration || care.data.leaf_retention != null) && (
                    <p className="capitalize">
                      {[
                        care.data.duration,
                        care.data.leaf_retention === true  ? 'Groenblijvend'  : null,
                        care.data.leaf_retention === false ? 'Bladverliezend' : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {care.data.avg_height_cm != null && (
                    <p>Gemiddelde hoogte: {care.data.avg_height_cm} cm</p>
                  )}
                  {care.data.flower_colors.length > 0 && (
                    <p className="capitalize">Bloemen: {care.data.flower_colors.join(', ')}</p>
                  )}
                  {care.data.toxicity && (
                    <p>Toxiciteit: {care.data.toxicity}</p>
                  )}
                  {care.data.edible != null && (
                    <p>Eetbaar: {care.data.edible ? 'ja' : 'nee'}</p>
                  )}
                </div>
              </Section>
            )}

            {/* Tree specs */}
            {parsedNotes && (parsedNotes.stamdiameter_cm || parsedNotes.hoogte_m || parsedNotes.leeftijd) && (
              <Section title="Specificaties">
                <div className="flex flex-wrap gap-3">
                  {parsedNotes.stamdiameter_cm != null && (
                    <div className="bg-bg rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-text-muted">Stamdiameter</p>
                      <p className="text-sm font-semibold text-text">{parsedNotes.stamdiameter_cm} cm</p>
                    </div>
                  )}
                  {parsedNotes.hoogte_m != null && (
                    <div className="bg-bg rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-text-muted">Hoogte</p>
                      <p className="text-sm font-semibold text-text">{parsedNotes.hoogte_m} m</p>
                    </div>
                  )}
                  {parsedNotes.leeftijd && (
                    <div className="bg-bg rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-text-muted">Leeftijd</p>
                      <p className="text-sm font-semibold text-text">{parsedNotes.leeftijd}</p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Boomkeuring */}
            {parsedNotes?.boomkeuring && parsedNotes.boomkeuring.length > 0 && (
              <Section title="Boomkeuring">
                <div className="space-y-3">
                  {parsedNotes.boomkeuring.map((item) => {
                    const scoreColor =
                      item.score === 'Matig' ? 'text-due' :
                      item.score === 'Slecht' ? 'text-overdue' :
                      'text-good'
                    return (
                      <div key={item.aspect} className="bg-bg rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{item.aspect}</p>
                          <span className={`text-xs font-semibold ${scoreColor}`}>{item.score}</span>
                        </div>
                        <p className="text-sm text-text whitespace-pre-line leading-snug">{item.toelichting}</p>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Family */}
            {care.data.family && (
              <Section title="Familie">
                <p className="text-sm text-text-muted italic">{care.data.family}</p>
              </Section>
            )}
          </>
        ) : null}

        {/* Rain bar chart */}
        {rain.data && (
          <div className="mt-2 pt-4 border-t border-border">
            <p className="text-[11px] font-bold tracking-widest uppercase text-text-muted mb-3">
              Neerslag Amsterdam — 7 dagen
            </p>
            <div className="flex items-end gap-1 h-12 mb-2">
              {rain.data.days.map(day => {
                const maxMm   = Math.max(...rain.data!.days.map(d => d.mm), 1)
                const heightPct = Math.max((day.mm / maxMm) * 100, day.mm > 0 ? 8 : 3)
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end">
                    <div className="w-full rounded-sm bg-blue-400/70" style={{ height: `${heightPct}%` }} />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[9px] text-text-muted mb-3">
              {rain.data.days.map(day => (
                <span key={day.date}>
                  {new Date(day.date).toLocaleDateString('nl-NL', { weekday: 'narrow' })}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">
                Totaal: <span className="text-text font-medium">{rain.data.total_7day_mm} mm</span>
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RAIN_BADGE[rain.data.assessment]?.className ?? ''}`}>
                {RAIN_BADGE[rain.data.assessment]?.label ?? rain.data.assessment}
              </span>
            </div>
          </div>
        )}

        {/* Source */}
        {care.data && care.data.source !== 'not_found' && (
          <p className="text-[10px] text-text-muted/50 text-center mt-6">
            Gegevens via Trefle · {care.data.cached_at ? new Date(care.data.cached_at).toLocaleDateString('nl-NL') : ''}
          </p>
        )}
      </div>
    </div>
  )
}

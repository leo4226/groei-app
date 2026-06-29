import type { SpotInspectorResult, SpeciesSuggestion } from '../../hooks/useSpotInspector'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'

const MONTH_NAMES_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

interface Props {
  result: SpotInspectorResult
  loading: boolean
  onClose: () => void
}

export default function SpotInspectorSheet({ result, loading, onClose }: Props) {
  const t = useT()
  const currentMonth = new Date().getMonth()
  const maxSun = Math.max(...result.sunByMonth, 1)
  const suitable = result.species.filter(s => s.tier === 'suitable')
  const marginal = result.species.filter(s => s.tier === 'marginal')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[calc(4rem+env(safe-area-inset-bottom))] animate-slide-up max-h-[80vh] overflow-y-auto">
        <button
        onClick={onClose}
        aria-label="Sluiten"
        className="block mx-auto mt-3 mb-1 px-6 py-2 -my-1 group"
      >
        <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
      </button>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 sticky top-0 bg-surface border-b border-border">
          <div>
            <h2 className="font-semibold text-text">{t.spotInspector.title}</h2>
            <p className="text-xs text-text-muted">
              {result.sunByMonth[currentMonth].toFixed(1)}u zon nu · {suitable.length} {t.spotInspector.suitable.toLowerCase()}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text leading-none"><Glyph name="x" size={18} /></button>
        </div>

        <div className="px-5 pb-5">
          {/* Sun bar chart */}
          <div className="mt-3 mb-4">
            <p className="text-xs font-medium text-text-muted mb-2">{t.spotInspector.sunPerMonth}</p>
            <div className="flex items-end gap-0.5 h-14">
              {result.sunByMonth.map((sun, i) => {
                const height = (sun / maxSun) * 100
                const isNow = i === currentMonth
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                    <div
                      className={`w-full rounded-sm ${isNow ? 'bg-amber-400' : 'bg-amber-200'}`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${MONTH_NAMES_NL[i]}: ${sun.toFixed(1)}u`}
                    />
                    <span className={`text-[7px] leading-none ${isNow ? 'text-text font-semibold' : 'text-text-muted'}`}>{MONTH_NAMES_NL[i]}</span>
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
              {suitable.length > 0 && (
                <section className="mb-4">
                  <p className="text-xs font-semibold text-good mb-2">{t.spotInspector.suitable} ({suitable.length})</p>
                  <div className="space-y-2">
                    {suitable.map(s => <SpeciesCard key={s.species_id} species={s} />)}
                  </div>
                </section>
              )}

              {marginal.length > 0 && (
                <section className="mb-4">
                  <p className="text-xs font-semibold text-due mb-2">{t.spotInspector.marginal} ({marginal.length})</p>
                  <div className="space-y-2">
                    {marginal.map(s => <SpeciesCard key={s.species_id} species={s} />)}
                  </div>
                </section>
              )}

              {suitable.length === 0 && marginal.length === 0 && (
                <p className="text-sm text-text-muted text-center py-6">
                  {t.spotInspector.noPlantsFound}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function SpeciesCard({ species }: { species: SpeciesSuggestion }) {
  const t = useT()
  const fmt = (months: number[]) => months.map(m => MONTH_NAMES_NL[m - 1]).join(', ')

  return (
    <div className="bg-bg rounded-xl px-3 py-2.5">
      <p className="text-sm font-medium text-text">{species.common_name_nl}</p>
      {species.latin_name && (
        <p className="text-[10px] text-text-muted italic">{species.latin_name}</p>
      )}
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

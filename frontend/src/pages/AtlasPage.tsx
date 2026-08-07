import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { atlas, type AtlasSort } from '../api/client'
import { useT } from '../context/LanguageContext'
import PageMasthead from '../components/ui/PageMasthead'
import Glyph from '../components/ui/Glyph'
import { MONTH_LETTERS, monthShortNames, flowerBarHeights } from './atlasModel'
import type { PublicGardenSummary } from '../types'

const SCORE_STEPS = [0, 20, 40, 60, 80]

/**
 * Public garden atlas — browse/filter surface for opt-in gardens (#804).
 * Consumes the anonymous read endpoint (routers/atlas.py): no auth, no PII.
 * Filters are sent server-side (city / month / min_score / sort).
 */
export default function AtlasPage() {
  const t = useT()
  const [gardens, setGardens] = useState<PublicGardenSummary[] | null>(null)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  // Filter state. City is debounced; the rest apply immediately.
  const [city, setCity] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [month, setMonth] = useState<number | 0>(0)
  const [minScore, setMinScore] = useState<number | 0>(0)
  const [sort, setSort] = useState<AtlasSort>('score')

  const cityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const load = useCallback(async (filters: { city?: string; month?: number; min_score?: number; sort?: AtlasSort }) => {
    setError(false)
    setGardens(null)
    try {
      const rows = await atlas.list(filters)
      setGardens(rows)
    } catch {
      setError(true)
      setGardens([])
    }
  }, [])

  useEffect(() => {
    load({ city, month: month || undefined, min_score: minScore || undefined, sort })
  }, [load, city, month, minScore, sort, retryKey])

  // Debounce the city text field so typing doesn't fire a request per keystroke.
  useEffect(() => {
    cityTimer.current = setTimeout(() => setCity(cityInput.trim()), 350)
    return () => clearTimeout(cityTimer.current)
  }, [cityInput])

  const monthNames = monthShortNames(t.locale)

  return (
    <div>
      <PageMasthead
        eyebrow={t.nav.atlas}
        title={t.atlas.mastheadTitle}
        accent={t.atlas.mastheadAccent}
        lede={t.atlas.lede}
      />

      <div className="p-4 max-w-3xl mx-auto pb-10">
        {/* Filter bar */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="col-span-2 md:col-span-1 block">
            <span className="block text-xs font-medium text-text-muted mb-1">{t.atlas.filters.cityLabel}</span>
            <input
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder={t.atlas.filters.cityPlaceholder}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-bg text-text placeholder:text-text-soft"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-text-muted mb-1">{t.atlas.filters.monthLabel}</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value) as number | 0)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-bg text-text"
            >
              <option value={0}>{t.atlas.filters.monthAny}</option>
              {monthNames.map((name, i) => (
                <option key={i} value={i + 1}>{name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-text-muted mb-1">{t.atlas.filters.scoreLabel}</span>
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value) as number | 0)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-bg text-text"
            >
              <option value={0}>{t.atlas.filters.scoreAny}</option>
              {SCORE_STEPS.filter((s) => s > 0).map((s) => (
                <option key={s} value={s}>{`${s}+`}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-text-muted mb-1">{t.atlas.filters.sortLabel}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as AtlasSort)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-bg text-text"
            >
              <option value="score">{t.atlas.filters.sortScore}</option>
              <option value="name">{t.atlas.filters.sortName}</option>
              <option value="newest">{t.atlas.filters.sortNewest}</option>
            </select>
          </label>
        </div>

        {/* Loading */}
        {gardens === null && !error && (
          <div className="py-16 text-center text-text-muted text-sm">{t.atlas.loading}</div>
        )}

        {/* Error */}
        {error && (
          <div className="py-16 text-center">
            <p className="text-sm text-text-muted mb-4">{t.atlas.loadFailed}</p>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-95"
            >
              <Glyph name="refresh" size={14} />
              {t.atlas.retry}
            </button>
          </div>
        )}

        {/* Empty */}
        {gardens !== null && !error && gardens.length === 0 && (
          <div className="py-16 text-center">
            <div className="mb-3 text-text-soft"><Glyph name="compass" size={40} /></div>
            <h2 className="font-heading text-lg font-medium text-text mb-1">{t.atlas.emptyTitle}</h2>
            <p className="text-sm text-text-muted max-w-sm mx-auto">{t.atlas.emptyLede}</p>
          </div>
        )}

        {/* Cards */}
        {gardens !== null && !error && gardens.length > 0 && (
          <ul className="space-y-3">
            {gardens.map((g) => (
              <li key={g.slug}>
                <Link
                  to={`/atlas/${g.slug}`}
                  className="block rounded-2xl border border-border bg-paper p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-heading text-base font-medium text-text leading-snug">{g.name}</h3>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {g.city || t.atlas.detail.noCity}
                        {g.streek_name && g.city ? ` · ${g.streek_name}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-bold text-primary">
                        {g.biodiversity_score ?? '—'}
                      </div>
                      <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        {t.atlas.card.scoreLabel}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-4">
                    <p className="text-xs text-text-muted">
                      {t.atlas.card.plantCount(g.plant_count)} · {t.atlas.card.speciesCount(g.species_count)}
                    </p>
                    {/* Flowering months mini-bar */}
                    <div className="flex-1 max-w-[180px]">
                      <div className="flex h-6 items-end gap-[3px]">
                        {flowerBarHeights(g.flower_months).map((h, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-sm ${h > 0 ? 'bg-primary/60' : 'bg-border'}`}
                            style={{ height: `${Math.max(9, h * 100)}%` }}
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
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

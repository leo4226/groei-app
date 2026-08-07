import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { atlas } from '../api/client'
import { useT } from '../context/LanguageContext'
import MapView from '../components/map/MapView'
import Glyph from '../components/ui/Glyph'
import { MONTH_LETTERS, flowerBarHeights } from './atlasModel'
import {
  publicGardenToMapDetail,
  publicGardenViewBox,
  publicGardenBounds,
  publicPlantToMapPlant,
} from './atlasDetailModel'
import type { PublicGardenDetail } from '../types'

/**
 * Read-only detail view for one public garden (#804). Renders the owner's map
 * layout (zones, plant positions, scientific names) through the existing MapView
 * component with no edit affordances and no care data — the payload is
 * deliberately PII-free and lacks the fields those features need.
 */
export default function AtlasGardenPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const t = useT()

  const [garden, setGarden] = useState<PublicGardenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setLoading(true)
    setError(false)
    setGarden(null)
    atlas.get(slug)
      .then((g) => { if (!cancelled) setGarden(g) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, retryKey])

  const map = useMemo(() => (garden ? publicGardenToMapDetail(garden) : null), [garden])
  const plants = useMemo(() => (garden ? garden.plants.map(publicPlantToMapPlant) : []), [garden])
  const viewBox = useMemo(() => (garden ? publicGardenViewBox(garden) : undefined), [garden])
  const bounds = useMemo(() => (garden ? publicGardenBounds(garden) ?? undefined : undefined), [garden])

  if (loading) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="h-8 w-40 bg-surface rounded-lg animate-pulse mb-4" />
        <div className="h-64 bg-surface rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error || !garden || !map) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-text-muted mb-4">{t.atlas.notFound}</p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-95"
        >
          <Glyph name="refresh" size={14} />
          {t.atlas.retry}
        </button>
      </div>
    )
  }

  const months = flowerBarHeights(garden.flower_months)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-border-soft">
        <button
          onClick={() => navigate('/atlas')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text transition-colors"
        >
          <Glyph name="arrow-left" size={16} />
          {t.atlas.detail.backLabel}
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Glyph name="compass" size={12} />
          {t.atlas.detail.publicBadge}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Title + stats */}
        <div className="px-4 pt-4 pb-3">
          <h1 className="font-heading text-xl font-medium text-text leading-snug">{garden.name}</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {garden.city || t.atlas.detail.noCity}
            {garden.streek_name && garden.city ? ` · ${garden.streek_name}` : ''}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div>
              <span className="font-bold text-primary">{garden.biodiversity_score ?? '—'}</span>
              <span className="text-text-muted"> {t.atlas.detail.scoreLabel}</span>
            </div>
            <div className="text-text-muted">
              {garden.species_count} {t.atlas.detail.speciesLabel} · {garden.plant_count} {t.atlas.detail.plantLabel}
            </div>
          </div>

          {garden.flower_months.length > 0 && (
            <div className="mt-4 max-w-[260px]">
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
                {t.atlas.detail.floweringMonthsLabel}
              </p>
              <div className="flex h-8 items-end gap-[3px]">
                {months.map((h, i) => (
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
          )}
        </div>

        {/* Read-only map */}
        <div className="px-4 pb-4">
          <div className="relative h-[300px] sm:h-[380px] overflow-hidden rounded-2xl border border-border bg-paper">
            <MapView
              map={map}
              plants={plants}
              objects={[]}
              labelMode="smart"
              showWarnings={false}
              hideLockBadges
              gardenViewBox={viewBox}
              gardenBounds={bounds}
            />
          </div>
        </div>

        {/* Plant list — scientific names */}
        <div className="px-4 pb-8">
          <h2 className="font-heading text-base font-medium text-text mb-2">{t.atlas.detail.plantsTitle}</h2>
          {garden.plants.length === 0 ? (
            <p className="text-sm text-text-muted">{t.atlas.detail.noPlants}</p>
          ) : (
            <ul className="divide-y divide-border-soft border border-border rounded-xl bg-paper overflow-hidden">
              {garden.plants.map((p) => (
                <li key={p.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-text italic">
                    {p.latin_name || p.name}
                  </span>
                  {p.latin_name && p.name !== p.latin_name && (
                    <span className="text-xs text-text-muted shrink-0">{p.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

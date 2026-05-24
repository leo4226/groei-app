import { useEffect, useState } from 'react'
import { weeds } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type { PlantIdCandidate, WeedSpeciesListItem } from '../../types'

interface Props {
  candidates: PlantIdCandidate[]
  thumbnail: string
  onLogSighting: (weedId: number, weedName: string) => void
  onRetry: () => void
  onDismiss: () => void
}

export function IdentifyWeedResults({ candidates, thumbnail, onLogSighting, onRetry, onDismiss }: Props) {
  const t = useT()
  const [catalog, setCatalog] = useState<WeedSpeciesListItem[] | null>(null)
  const [catalogError, setCatalogError] = useState(false)

  useEffect(() => {
    weeds.catalog()
      .then(setCatalog)
      .catch(() => setCatalogError(true))
  }, [])

  function matchWeed(scientificName: string): WeedSpeciesListItem | null {
    if (!catalog) return null
    const lower = scientificName.toLowerCase()
    return catalog.find((w) => w.latin_name.toLowerCase() === lower) ?? null
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <button onClick={onDismiss} className="text-text-muted text-sm">{t.weeds.noMatch.dismiss}</button>
        <span className="text-sm font-semibold text-text">{t.identify.results.title}</span>
        <span className="w-12" />
      </div>

      {thumbnail && (
        <div className="flex justify-center p-4">
          <img src={thumbnail} alt="" className="h-40 w-40 object-cover rounded-2xl shadow" />
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {candidates.map((c) => {
          const weed = matchWeed(c.scientific_name)
          const loadingBadge = !catalog && !catalogError
          return (
            <div key={c.scientific_name} className="card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-text text-sm">{c.common_names_en[0] || c.common_names_nl[0] || c.scientific_name}</p>
                  <p className="text-xs italic text-text-muted truncate">{c.scientific_name}</p>
                  <p className="text-xs text-text-muted">{Math.round(c.confidence * 100)}% {t.identify.results.confidence}</p>
                </div>
                {loadingBadge && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted">…</span>
                )}
                {!loadingBadge && weed && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0">
                    🌿 {t.weeds.knownWeed}
                  </span>
                )}
                {!loadingBadge && !weed && !catalogError && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted shrink-0">
                    {t.weeds.notAWeed}
                  </span>
                )}
              </div>

              {weed && (
                <div className="text-xs text-text-muted">
                  <span className="font-medium text-text">{weed.common_name_nl}</span>
                  {weed.places.length > 0 && <span> · {weed.places.join(', ')}</span>}
                </div>
              )}

              {weed && (
                <button
                  onClick={() => onLogSighting(weed.id, weed.common_name_nl)}
                  className="self-start text-xs px-3 py-1.5 rounded-full bg-primary text-white font-medium hover:opacity-90"
                >
                  📍 {t.weeds.logSighting}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 p-4 pt-0">
        <button
          onClick={onRetry}
          className="flex-1 py-2.5 rounded-xl border border-border text-sm text-text-muted hover:bg-surface"
        >
          {t.weeds.noMatch.retry}
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90"
        >
          {t.weeds.noMatch.dismiss}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { weeds } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type { IdentifyConfidence, PlantIdCandidate, WeedSpeciesListItem } from '../../types'
import { confidenceTone } from './confidenceTone'

type Props = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence
  capturedThumbnailUrl: string | null
  source: string                     // "bioclip" or "plantnet"
  onChoose: (candidate: PlantIdCandidate) => void
  onRetry: () => void
  onManualFallback: () => void
  onTryPlantnet: () => void
  onLogSighting: (weedId: number, weedName: string) => void
}

export function IdentifyResults({
  candidates, confidence, capturedThumbnailUrl, source,
  onChoose, onRetry, onManualFallback, onTryPlantnet, onLogSighting,
}: Props) {
  const t = useT()
  const tone = confidenceTone(confidence)
  const fromBioclip = source === "bioclip"

  const [weedCatalog, setWeedCatalog] = useState<WeedSpeciesListItem[] | null>(null)
  useEffect(() => {
    weeds.catalog().then(setWeedCatalog).catch(() => setWeedCatalog([]))
  }, [])

  // Weed strip is only shown when overall confidence isn't 'low' — "go dig this
  // up" is a worse false positive than a wrong plant name. 'no_match' never
  // renders this branch because candidates is empty.
  const showWeedHints = confidence !== 'low'

  function matchWeed(scientificName: string): WeedSpeciesListItem | null {
    if (!weedCatalog || !showWeedHints) return null
    const lower = scientificName.toLowerCase()
    return weedCatalog.find((w) => w.latin_name.toLowerCase() === lower) ?? null
  }

  if (candidates.length === 0) {
    const bodyText = tone.showDetailedNoMatch
      ? t.identify.noMatch.bodyDetailed
      : t.identify.noMatch.body
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <h2 className="text-xl font-semibold mb-2">{t.identify.noMatch.title}</h2>
        <p className="text-gray-600 mb-6">{bodyText}</p>
        {capturedThumbnailUrl && (
          <img src={capturedThumbnailUrl} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-75" />
        )}
        <div className="flex flex-col gap-3">
          <button onClick={onRetry} className="bg-green-700 text-white px-4 py-3 rounded">
            {t.identify.noMatch.retry}
          </button>
          {fromBioclip && (
            <button onClick={onTryPlantnet} className="bg-emerald-600 text-white px-4 py-3 rounded flex items-center justify-center gap-2">
              🔬 Probeer met PlantNet
            </button>
          )}
          <button onClick={onManualFallback} className="text-gray-700 px-4 py-3 rounded border">
            {t.identify.noMatch.manualFallback}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-2">{t.identify.results.title}</h2>
      {tone.showBanner && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 mb-4 text-sm">
          {t.identify.confidence.low}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {candidates.map((c, idx) => {
          const pct = Math.round(c.confidence * 100)
          const commonName = c.common_names_nl[0] || c.common_names_en[0] || c.scientific_name
          const isTop = idx === 0
          const weed = matchWeed(c.scientific_name)
          return (
            <div key={c.scientific_name} className="flex flex-col gap-2">
              <button
                onClick={() => onChoose(c)}
                className="flex items-center gap-3 p-3 bg-white border rounded-lg text-left active:bg-gray-50"
              >
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} alt="" className="w-16 h-16 object-cover rounded" />
                ) : (
                  <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-2xl">🌿</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{commonName}</div>
                    {weed && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0">
                        🌿 {t.weeds.knownWeed}
                      </span>
                    )}
                  </div>
                  <div className="text-xs italic text-gray-500 truncate">{c.scientific_name}</div>
                  {isTop && tone.showMediumSubtitle && (
                    <div className="text-xs text-gray-600 mt-0.5">{t.identify.confidence.medium}</div>
                  )}
                  <div className="mt-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                    <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{pct}% {t.identify.results.confidence}</div>
                </div>
              </button>
              {weed && (
                <div className="ml-3 mr-3 -mt-1 px-3 py-2 bg-red-50 border-l-2 border-red-300 rounded-r flex items-center justify-between gap-2">
                  <div className="text-xs text-text-muted min-w-0">
                    <span className="font-medium text-text">{weed.common_name_nl}</span>
                    {weed.places.length > 0 && <span className="truncate"> · {weed.places.join(', ')}</span>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onLogSighting(weed.id, weed.common_name_nl) }}
                    className="text-xs px-3 py-1.5 rounded-full bg-primary text-white font-medium hover:opacity-90 shrink-0"
                  >
                    📍 {t.weeds.logSighting}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!fromBioclip && (
        <div className="text-center text-xs text-gray-400 mt-6">{t.identify.results.poweredBy}</div>
      )}
      {fromBioclip && (
        <div className="text-center mt-4">
          <button onClick={onTryPlantnet} className="bg-emerald-600 text-white px-4 py-3 rounded text-sm">
            🔬 Probeer met PlantNet
          </button>
        </div>
      )}
    </div>
  )
}

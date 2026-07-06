import { useEffect, useState } from 'react'
import { weeds } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type { IdentifyConfidence, PlantIdCandidate, WeedSpeciesListItem } from '../../types'
import { confidenceTone } from './confidenceTone'
import Glyph from '../ui/Glyph'

type Props = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence
  capturedThumbnailUrl: string | null
  source: string                     // "bioclip" or "plantnet"
  lang: 'nl' | 'en'                 // active user language
  onChoose: (candidate: PlantIdCandidate) => void
  onRetry: () => void
  onManualFallback: () => void
  onTryPlantnet: () => void
  onLogSighting: (weedId: number, weedName: string) => void
}

export function IdentifyResults({
  candidates, confidence, capturedThumbnailUrl, source, lang,
  onChoose, onRetry, onManualFallback, onTryPlantnet, onLogSighting,
}: Props) {
  const t = useT()
  const tone = confidenceTone(confidence)
  const fromBioclip = source !== 'plantnet'
  const confidenceSummary = t.identify.confidence.summary[confidence]
  const sourceLabel = fromBioclip
    ? t.identify.results.sourceBioclip
    : t.identify.results.sourcePlantnet
  const showComparePrompt = tone.showCompareCandidates && candidates.length > 1
  const plantnetCtaLabel = tone.plantnetCtaProminent
    ? t.identify.results.plantnetProminentCta
    : t.identify.results.plantnetCta
  const plantnetCtaClass = tone.plantnetCtaProminent
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'

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

  const confidenceClass = confidence === 'high'
    ? 'bg-green-50 border-green-200 text-green-900'
    : confidence === 'medium'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-yellow-50 border-yellow-300 text-yellow-950'

  const sourcePill = (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
      <Glyph name={fromBioclip ? 'sparkle' : 'flask'} size={13} />
      {sourceLabel}
    </div>
  )

  const confidenceBlock = (
    <div className={`rounded-xl border p-3 text-sm ${confidenceClass}`}>
      <div className="flex items-start gap-2">
        <Glyph name={confidence === 'high' ? 'check' : 'alert'} size={17} className="mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">{confidenceSummary.label}</div>
          <div className="mt-0.5 leading-relaxed">{confidenceSummary.body}</div>
        </div>
      </div>
    </div>
  )

  const guidanceBlock = (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
      <div className="flex items-center gap-2 font-semibold">
        <Glyph name="search" size={16} />
        {t.identify.guidance.title}
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-blue-900">
        {t.identify.guidance.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )

  const safetyBlock = (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs leading-relaxed text-orange-900">
      <div className="flex gap-2">
        <Glyph name="alert" size={15} className="mt-0.5 shrink-0" />
        <span>{t.identify.guidance.safety}</span>
      </div>
    </div>
  )

  const plantnetButton = fromBioclip ? (
    <button
      onClick={onTryPlantnet}
      className={`px-4 py-3 rounded text-sm font-medium flex items-center justify-center gap-2 ${plantnetCtaClass}`}
    >
      <Glyph name="flask" size={15} />
      {plantnetCtaLabel}
    </button>
  ) : null

  if (candidates.length === 0) {
    const bodyText = tone.showDetailedNoMatch
      ? t.identify.noMatch.bodyDetailed
      : t.identify.noMatch.body
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <h2 className="text-xl font-semibold mb-2">{t.identify.noMatch.title}</h2>
        <div className="mb-4">{sourcePill}</div>
        <div className="mb-4 text-left">{confidenceBlock}</div>
        <p className="text-gray-600 mb-6">{bodyText}</p>
        {capturedThumbnailUrl && (
          <img src={capturedThumbnailUrl} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-75" />
        )}
        <div className="mb-4 text-left">{guidanceBlock}</div>
        <div className="mb-6 text-left">{safetyBlock}</div>
        <div className="flex flex-col gap-3">
          <button onClick={onRetry} className="bg-green-700 text-white px-4 py-3 rounded">
            {t.identify.newPhoto}
          </button>
          {plantnetButton}
          <button onClick={onManualFallback} className="text-gray-700 px-4 py-3 rounded border">
            {t.identify.noMatch.manualFallback}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="mb-4 flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold mb-2">{t.identify.results.title}</h2>
          {sourcePill}
        </div>
        {confidenceBlock}
        {tone.showBanner && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 text-sm">
            {t.identify.confidence.low}
          </div>
        )}
        {showComparePrompt && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
            {t.identify.confidence.compareCandidates}
          </div>
        )}
        {guidanceBlock}
        {safetyBlock}
      </div>
      <div className="flex flex-col gap-3">
        {candidates.map((c, idx) => {
          const pct = Math.round(c.confidence * 100)
          const commonName = lang === 'nl'
            ? c.common_names_nl[0] || c.common_names_en[0] || c.scientific_name
            : c.common_names_en[0] || c.common_names_nl[0] || c.scientific_name
          const isTop = idx === 0
          const weed = matchWeed(c.scientific_name)
          return (
            <div key={c.scientific_name} className="flex flex-col gap-2">
              <button
                onClick={() => onChoose(c)}
                className={`flex items-center gap-3 p-3 border rounded-lg text-left active:bg-gray-50 ${isTop ? 'bg-green-50/60 border-green-200' : 'bg-white'}`}
              >
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} alt="" className="w-16 h-16 object-cover rounded" />
                ) : (
                  <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-gray-400"><Glyph name="leaf" size={28} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isTop ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {isTop ? t.identify.results.bestMatch : t.identify.results.alternativeMatch}
                    </span>
                    {weed && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0 inline-flex items-center gap-1">
                        <Glyph name="alert" size={12} />
                        {t.weeds.knownWeed}
                      </span>
                    )}
                  </div>
                  <div className="font-medium truncate">{commonName}</div>
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
                    className="text-xs px-3 py-1.5 rounded-full bg-primary text-white font-medium hover:opacity-90 shrink-0 inline-flex items-center gap-1.5"
                  >
                    <Glyph name="pin" size={13} />
                    {t.weeds.logSighting}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!fromBioclip && (
        <>
          <div className="text-center mt-6">
            <button onClick={onRetry} className="bg-green-700 text-white px-4 py-3 rounded text-sm">
              {t.identify.newPhoto}
            </button>
          </div>
          <div className="text-center text-xs text-gray-400 mt-6">{t.identify.results.poweredBy}</div>
        </>
      )}
      {fromBioclip && (
        <div className="text-center mt-4 flex flex-col gap-3">
          <button onClick={onRetry} className="bg-green-700 text-white px-4 py-3 rounded text-sm">
            {t.identify.newPhoto}
          </button>
          {plantnetButton}
        </div>
      )}
    </div>
  )
}

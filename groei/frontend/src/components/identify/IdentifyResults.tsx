import { useT } from '../../context/LanguageContext'
import type { PlantIdCandidate } from '../../types'

type Props = {
  candidates: PlantIdCandidate[]
  lowConfidence: boolean
  capturedThumbnailUrl: string | null
  onChoose: (candidate: PlantIdCandidate) => void
  onRetry: () => void
  onManualFallback: () => void
}

export function IdentifyResults({
  candidates, lowConfidence, capturedThumbnailUrl, onChoose, onRetry, onManualFallback,
}: Props) {
  const t = useT()

  if (candidates.length === 0) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <h2 className="text-xl font-semibold mb-2">{t('identify.noMatch.title')}</h2>
        <p className="text-gray-600 mb-6">{t('identify.noMatch.body')}</p>
        {capturedThumbnailUrl && (
          <img src={capturedThumbnailUrl} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-75" />
        )}
        <div className="flex flex-col gap-3">
          <button onClick={onRetry} className="bg-green-700 text-white px-4 py-3 rounded">
            {t('identify.noMatch.retry')}
          </button>
          <button onClick={onManualFallback} className="text-gray-700 px-4 py-3 rounded border">
            {t('identify.noMatch.manualFallback')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-2">{t('identify.results.title')}</h2>
      {lowConfidence && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 mb-4 text-sm">
          {t('identify.lowConfidence')}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {candidates.map((c) => {
          const pct = Math.round(c.confidence * 100)
          const commonName = c.common_names_nl[0] || c.common_names_en[0] || c.scientific_name
          return (
            <button
              key={c.scientific_name}
              onClick={() => onChoose(c)}
              className="flex items-center gap-3 p-3 bg-white border rounded-lg text-left active:bg-gray-50"
            >
              {c.thumbnail_url ? (
                <img src={c.thumbnail_url} alt="" className="w-16 h-16 object-cover rounded" />
              ) : (
                <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-2xl">🌿</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{commonName}</div>
                <div className="text-xs italic text-gray-500 truncate">{c.scientific_name}</div>
                <div className="mt-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                  <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{pct}% {t('identify.results.confidence')}</div>
              </div>
            </button>
          )
        })}
      </div>
      <div className="text-center text-xs text-gray-400 mt-6">{t('identify.results.poweredBy')}</div>
    </div>
  )
}

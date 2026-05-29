import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { plants as plantsApi, species as speciesApi, maps as mapsApi } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import { IdentifyResults } from '../components/identify/IdentifyResults'
import { WeedSightingSheet } from '../components/identify/WeedSightingSheet'
import type { PlantIdCandidate, IdentifyConfidence, IdentifyCommitResult, EcologyOut } from '../types'

type ResultsState = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence
  thumbnail: string
  capturedBlob: Blob
  source: string
}

type Step =
  | { kind: 'camera' }
  | { kind: 'identifying'; thumbnail: string }
  | ({ kind: 'results' } & ResultsState)
  | { kind: 'enriching' }
  | ({ kind: 'sighting'; weedId: number; weedName: string; from: ResultsState })
  | { kind: 'ecology_preview'; commitResult: IdentifyCommitResult; ecology: EcologyOut }
  | { kind: 'error'; message: string; thumbnail: string | null }


export function IdentifyPlantPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  // MapPage launches /identify with state {mapId, mapSlug} so the sighting sheet
  // can preselect the user's current map. From Dashboard the state is absent.
  const routeState = location.state as { mapId?: number; mapSlug?: string } | null

  const activeLang = useFloreren((s) => {
    const user = s.users.find((u) => u.id === s.activeUserId)
    return user?.language === 'en' ? 'en' : 'nl'
  })
  // BioCLIP is the primary identifier and runs on our own infrastructure — no
  // upfront third-party consent gate. PlantNet is opt-in via the fallback button
  // on the results screen; the confirm there names the third party explicitly.
  const [step, setStep] = useState<Step>({ kind: 'camera' })
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string | null>(null)
  const mapSlug = routeState?.mapSlug ?? null
  const [gapMonths, setGapMonths] = useState<number[]>([])

  useEffect(() => {
    if (!mapSlug) return
    mapsApi.biodiversity(mapSlug)
      .then(bio => {
        const gaps = bio.pollinator_coverage_months
          .map((covered, i) => (covered ? null : i + 1))
          .filter((m): m is number => m !== null)
        setGapMonths(gaps)
      })
      .catch(() => {})
  }, [mapSlug])

  useEffect(() => {
    if (!navigator.onLine) {
      setStep({ kind: 'error', message: t.identify.errorOffline, thumbnail: null })
    }
  }, [t])

  async function handleCapture(blob: Blob, dataUrl: string) {
    setCapturedPhotoDataUrl(dataUrl)
    setStep({ kind: 'identifying', thumbnail: dataUrl })
    try {
      const resp = await plantsApi.identify(blob)
      setStep({
        kind: 'results',
        candidates: resp.candidates,
        confidence: resp.confidence ?? (resp.low_confidence ? 'low' : 'high'),
        thumbnail: dataUrl,
        capturedBlob: blob,
        source: resp.source ?? 'bioclip',
      })
    } catch (e) {
      const message = e instanceof Error && e.message.toLowerCase().includes('tijdelijk')
        ? t.identify.errorQuota
        : e instanceof Error && e.message
          ? e.message
          : t.identify.errorService
      setStep({ kind: 'error', message, thumbnail: dataUrl })
    }
  }

  async function handleChoose(candidate: PlantIdCandidate) {
    if (!capturedPhotoDataUrl) return
    setStep({ kind: 'enriching' })
    try {
      const commitResult = await plantsApi.commitIdentify(candidate.scientific_name, capturedPhotoDataUrl)

      // Fetch ecology data — already stored, no LLM cost
      let ecology: EcologyOut | null = null
      try {
        ecology = await speciesApi.ecology(commitResult.species_id)
      } catch { /* non-critical */ }

      // Show preview only when ecology has something interesting
      const hasContent = ecology &&
        ecology.data_source !== 'failed' && (
          ecology.pollinator_value != null ||
          ecology.native_to_nl != null ||
          (ecology.flowering_months && ecology.flowering_months.length > 0)
        )

      if (hasContent) {
        setStep({ kind: 'ecology_preview', commitResult, ecology: ecology! })
      } else {
        navigate('/plants/add', { state: { prefill: commitResult, from: 'identify' } })
      }
    } catch (e) {
      const isNotFound = e instanceof Error && e.message.toLowerCase().includes('niet gevonden')
      if (isNotFound) {
        navigate('/plants/add', { state: { prefill: { scientific_name: candidate.scientific_name }, from: 'identify' } })
        return
      }
      setStep({
        kind: 'error',
        message: t.identify.errorService,
        thumbnail: capturedPhotoDataUrl,
      })
    }
  }

  function handleLogSighting(weedId: number, weedName: string) {
    if (step.kind !== 'results') return
    setStep({ kind: 'sighting', weedId, weedName, from: step })
  }

  function handleSightingSaved(mapSlug: string) {
    navigate(`/map/${mapSlug}`)
  }

  function manualFallback() {
    navigate('/plants/add', { state: { from: 'manual' } })
  }

  function retry() {
    setStep({ kind: 'camera' })
    setCapturedPhotoDataUrl(null)
  }

  async function handleTryPlantnet() {
    if (step.kind !== 'results') return
    // Explicit opt-in: PlantNet is a third-party service. Confirm before sending.
    if (!window.confirm(t.identify.plantnetConfirm)) return
    setStep({ kind: 'identifying', thumbnail: step.thumbnail })
    try {
      const resp = await plantsApi.identifyPlantnet(step.capturedBlob, activeLang)
      setStep({
        kind: 'results',
        candidates: resp.candidates,
        confidence: resp.confidence ?? (resp.low_confidence ? 'low' : 'high'),
        thumbnail: step.thumbnail,
        capturedBlob: step.capturedBlob,
        source: resp.source ?? 'plantnet',
      })
    } catch (e) {
      const message = e instanceof Error && e.message
        ? e.message
        : t.identify.errorService
      setStep({ kind: 'error', message, thumbnail: step.thumbnail })
    }
  }

  // --- render per step ---

  if (step.kind === 'camera') {
    return <IdentifyCamera onCapture={handleCapture} onCancel={() => navigate(-1)} />
  }

  if (step.kind === 'identifying') {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <img src={step.thumbnail} alt="" className="w-40 h-40 object-cover rounded mx-auto mb-6" />
        <p className="text-gray-700">{t.identify.identifying}</p>
      </div>
    )
  }

  if (step.kind === 'enriching') {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <p className="text-gray-700">{t.identify.enriching}</p>
      </div>
    )
  }

  if (step.kind === 'sighting') {
    return (
      <WeedSightingSheet
        weedId={step.weedId}
        weedName={step.weedName}
        preselectedMapId={routeState?.mapId}
        preselectedMapSlug={routeState?.mapSlug}
        onSaved={handleSightingSaved}
        onCancel={() => setStep({ kind: 'results', ...step.from })}
      />
    )
  }

  if (step.kind === 'results') {
    return (
      <IdentifyResults
        candidates={step.candidates}
        confidence={step.confidence}
        capturedThumbnailUrl={step.thumbnail}
        source={step.source}
        onChoose={handleChoose}
        onRetry={retry}
        onManualFallback={manualFallback}
        onTryPlantnet={handleTryPlantnet}
        onLogSighting={handleLogSighting}
      />
    )
  }

  if (step.kind === 'ecology_preview') {
    const { commitResult, ecology } = step
    const MONTH_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
    const fills = (ecology.flowering_months ?? []).filter(m => gapMonths.includes(m))

    return (
      <div className="min-h-dvh flex flex-col bg-bg">
        <div className="px-4 pt-safe-top pt-6 pb-4 border-b border-border">
          <p className="text-xs text-text-muted italic mb-1">{commitResult.scientific_name}</p>
          <h1 className="text-xl font-bold text-text">{t.identify.ecologyTitle}</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {ecology.native_to_nl === true && (
            <div className="card p-3 flex items-center gap-3">
              <span className="text-2xl">🇳🇱</span>
              <p className="text-sm text-text">{t.ecology.native}</p>
            </div>
          )}
          {ecology.invasive_nl && (
            <div className="card p-3 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <p className="text-sm font-semibold text-red-500">{t.ecology.invasive}</p>
            </div>
          )}
          {(ecology.pollinator_value ?? 0) >= 2 && (
            <div className="card p-3 flex items-center gap-3">
              <span className="text-2xl">🐝</span>
              <p className="text-sm text-text">
                {ecology.pollinator_value === 3 ? t.ecology.pollinatorTopTier : t.ecology.pollinatorGood}
              </p>
            </div>
          )}
          {ecology.flowering_months && ecology.flowering_months.length > 0 && (
            <div className="card p-3">
              <p className="text-sm text-text mb-1">
                🌸 {t.ecology.floweringPrefix}: {ecology.flowering_months.map(m => MONTH_SHORT[m - 1]).join(', ')}
              </p>
              {fills.length > 0 && (
                <p className="text-xs text-primary mt-1">
                  {t.identify.ecologyFillsGap.replace('{months}', fills.map(m => MONTH_SHORT[m - 1]).join(', '))}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-safe-bottom pb-6 pt-3 border-t border-border">
          <button
            onClick={() => navigate('/plants/add', { state: { prefill: commitResult, from: 'identify' } })}
            className="w-full py-3 rounded-2xl bg-primary text-white font-semibold text-sm"
          >
            {t.identify.ecologyContinue}
          </button>
        </div>
      </div>
    )
  }

  // error step
  return (
    <div className="p-6 max-w-md mx-auto text-center">
      <h2 className="text-xl font-semibold mb-2">⚠️</h2>
      <p className="text-gray-600 mb-6">{step.message}</p>
      {step.thumbnail && (
        <img src={step.thumbnail} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-50" />
      )}
      <div className="flex flex-col gap-3">
        <button onClick={retry} className="bg-green-700 text-white px-4 py-3 rounded">
          {t.identify.noMatch.retry}
        </button>
        <button onClick={manualFallback} className="text-gray-700 px-4 py-3 rounded border">
          {t.identify.noMatch.manualFallback}
        </button>
      </div>
    </div>
  )
}

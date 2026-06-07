import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { plants as plantsApi, maps as mapsApi } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import { IdentifyResults } from '../components/identify/IdentifyResults'
import { WeedSightingSheet } from '../components/identify/WeedSightingSheet'
import type { PlantIdCandidate, IdentifyConfidence, IdentifyCommitResult } from '../types'

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
  const [resultsState, setResultsState] = useState<ResultsState | null>(null)
  useEffect(() => {
    if (!mapSlug) return
    mapsApi.biodiversity(mapSlug)
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
      const resp = await plantsApi.identify(blob, activeLang)
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
      navigate('/plants/add', { state: { prefill: commitResult, from: 'identify' } })
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
        lang={activeLang}
        onChoose={handleChoose}
        onRetry={retry}
        onManualFallback={manualFallback}
        onTryPlantnet={handleTryPlantnet}
        onLogSighting={handleLogSighting}
      />
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

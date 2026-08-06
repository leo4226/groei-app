import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { plants as plantsApi, maps as mapsApi, apiRequest } from '../api/client'
import { IdentifyCamera, type RetakeReason } from '../components/identify/IdentifyCamera'
import { IdentifyResults } from '../components/identify/IdentifyResults'
import { WeedSightingSheet } from '../components/identify/WeedSightingSheet'
import Glyph from '../components/ui/Glyph'
import AppLoadingView from '../components/ui/AppLoadingView'
import { identifyEnrichmentLoadingCopy } from '../components/identify/identifyLoadingCopy'
import type { PlantIdCandidate, IdentifyConfidence } from '../types'

type ResultsState = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence
  thumbnail: string
  capturedBlob: Blob
  source: string
}

type Step =
  | { kind: 'camera'; retakeReason?: RetakeReason }
  | { kind: 'identifying'; thumbnail: string }
  | ({ kind: 'results' } & ResultsState)
  | ({ kind: 'destination'; candidate: PlantIdCandidate; from: ResultsState })
  | { kind: 'enriching' }
  | ({ kind: 'sighting'; weedId: number; weedName: string; from: ResultsState })
  | { kind: 'error'; message: string; thumbnail: string | null }

type ScanDestination = 'journal' | 'garden'


export function IdentifyPlantPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  // MapPage launches /identify with state {mapId, mapSlug} so the sighting sheet
  // can preselect the user's current map. From Dashboard the state is absent.
  const routeState = location.state as { mapId?: number; mapSlug?: string; mode?: 'discover' | 'add' } | null

  const activeLang: 'nl' | 'en' = t.locale.startsWith('en') ? 'en' : 'nl'
  // BioCLIP is the primary identifier and runs on our own infrastructure — no
  // upfront third-party consent gate. PlantNet is opt-in via the fallback button
  // on the results screen; the confirm there names the third party explicitly.
  const [step, setStep] = useState<Step>({ kind: 'camera' })
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string | null>(null)
  const mapSlug = routeState?.mapSlug ?? null
  useEffect(() => {
    if (!mapSlug) return
    mapsApi.biodiversity(mapSlug)
      .catch(() => {})
  }, [mapSlug])

  // Prewarm: the Fly machine sleeps at idle (~9s cold start). Firing a
  // throwaway ping when the camera opens means the backend is awake by the
  // time the user has framed their photo.
  useEffect(() => { apiRequest('GET', '/ping').catch(() => {}) }, [])

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

  function handleChoose(candidate: PlantIdCandidate) {
    if (step.kind !== 'results') return
    setStep({ kind: 'destination', candidate, from: step })
  }

  async function handleDestination(destination: ScanDestination) {
    if (step.kind !== 'destination' || !capturedPhotoDataUrl) return
    const candidate = step.candidate
    const commonName = activeLang === 'en'
      ? candidate.common_names_en?.[0] ?? candidate.common_names_nl?.[0] ?? candidate.scientific_name
      : candidate.common_names_nl?.[0] ?? candidate.common_names_en?.[0] ?? candidate.scientific_name

    if (destination === 'journal') {
      // Optimistic: land on the discovery card immediately with the candidate
      // data; the card runs the commit (and geolocation) itself and fills in
      // species details as they arrive. No 'enriching' wait screen.
      navigate('/plants/discovery', {
        state: {
          candidate: {
            scientific_name: candidate.scientific_name,
            common_name: commonName,
            common_name_nl: candidate.common_names_nl?.[0] ?? commonName,
          },
          thumbnail: capturedPhotoDataUrl,
          destination: 'journal',
          pendingCommit: true,
        },
      })
      return
    }

    setStep({ kind: 'enriching' })
    try {
      const commitResult = await plantsApi.commitIdentify(candidate.scientific_name, capturedPhotoDataUrl, activeLang)
      navigate('/plants/add', { state: { prefill: commitResult, from: 'identify' } })
    } catch (e) {
      // 404 = species not found; the api client attaches the HTTP status so we
      // don't have to string-match the (localized) error message.
      const isNotFound = e instanceof Error && (e as Error & { status?: number }).status === 404
      if (isNotFound) {
        navigate('/plants/add', {
          state: {
            prefill: { name: commonName, scientific_name: candidate.scientific_name },
            from: 'identify',
          },
        })
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
    // Retakes after a failed ID get targeted coaching on the camera screen:
    // no candidates → "move closer", low confidence → lighting.
    const retakeReason: RetakeReason = step.kind === 'results'
      ? step.candidates.length === 0
        ? 'no-match'
        : step.confidence === 'low'
          ? 'low-confidence'
          : 'none'
      : 'none'
    setStep({ kind: 'camera', retakeReason })
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

  if (step.kind === 'camera') {
    return <IdentifyCamera onCapture={handleCapture} onCancel={() => navigate(-1)} retakeReason={step.retakeReason ?? 'none'} />
  }

  // --- render ---
  return (
    <>
      {step.kind === 'identifying' && (
        <div className="p-6 max-w-md mx-auto text-center">
          <img src={step.thumbnail} alt="" className="w-40 h-40 object-cover rounded mx-auto mb-6" />
          <p className="text-text-soft">{t.identify.identifying}</p>
        </div>
      )}

      {step.kind === 'enriching' && (() => {
        const copy = identifyEnrichmentLoadingCopy(t)
        return <AppLoadingView title={copy.title} lede={copy.lede} />
      })()}

      {step.kind === 'destination' && (() => {
        const commonName = activeLang === 'en'
          ? step.candidate.common_names_en?.[0] ?? step.candidate.common_names_nl?.[0] ?? step.candidate.scientific_name
          : step.candidate.common_names_nl?.[0] ?? step.candidate.common_names_en?.[0] ?? step.candidate.scientific_name
        return (
          <div
            className="min-h-screen bg-bg flex flex-col max-w-md mx-auto"
            style={{ padding: 'max(env(safe-area-inset-top, 0px), 24px) 20px max(env(safe-area-inset-bottom, 0px), 24px)' }}
          >
            <button
              onClick={() => setStep({ kind: 'results', ...step.from })}
              className="self-start text-text-muted text-sm mb-5 inline-flex items-center gap-1.5"
            >
              <Glyph name="arrow-left" size={15} />
              {t.identify.destination.backToMatches}
            </button>
            <div className="flex flex-col items-center text-center gap-3 mb-7">
              <img src={step.from.thumbnail} alt="" className="w-28 h-28 rounded-2xl object-cover shadow-sm" />
              <div>
                <p className="text-xl font-semibold text-text">{commonName}</p>
                <p className="text-xs italic text-text-soft mt-1">{step.candidate.scientific_name}</p>
              </div>
            </div>
            <div className="mb-5 text-center">
              <h2 className="text-2xl font-semibold text-text mb-2">{t.identify.destination.title}</h2>
              <p className="text-sm text-text-muted leading-relaxed">{t.identify.destination.subtitle}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleDestination('journal')}
                className="w-full p-4 rounded-2xl border-2 border-primary bg-primary/10 text-left active:scale-[0.99] transition-transform"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-primary">
                  <Glyph name="book" size={18} />
                  {t.identify.destination.journalTitle}
                </span>
                <span className="block text-sm text-text-muted mt-1">{t.identify.destination.journalSubtitle}</span>
              </button>
              <button
                onClick={() => handleDestination('garden')}
                className="w-full p-4 rounded-2xl border border-border bg-surface text-left active:scale-[0.99] transition-transform"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-text">
                  <Glyph name="leaf" size={18} />
                  {t.identify.destination.gardenTitle}
                </span>
                <span className="block text-sm text-text-muted mt-1">{t.identify.destination.gardenSubtitle}</span>
              </button>
            </div>
          </div>
        )
      })()}

      {step.kind === 'sighting' && (
        <WeedSightingSheet
          weedId={step.weedId}
          weedName={step.weedName}
          capturedThumbnailUrl={step.from.thumbnail}
          preselectedMapId={routeState?.mapId}
          preselectedMapSlug={routeState?.mapSlug}
          onSaved={handleSightingSaved}
          onCancel={() => setStep({ kind: 'results', ...step.from })}
        />
      )}

      {step.kind === 'results' && (
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
      )}

      {step.kind === 'error' && (
        <div className="p-6 max-w-md mx-auto text-center">
          <div className="flex justify-center mb-3 text-amber-500">
            <Glyph name="alert" size={32} />
          </div>
          <p className="text-text-soft mb-6">{step.message}</p>
          {step.thumbnail && (
            <img src={step.thumbnail} alt="" className="w-32 h-32 object-cover rounded mx-auto mb-6 opacity-50" />
          )}
          <div className="flex flex-col gap-3">
            <button onClick={retry} className="bg-green-700 text-white px-4 py-3 rounded">
              {t.identify.noMatch.retry}
            </button>
            <button onClick={manualFallback} className="text-text-soft px-4 py-3 rounded border">
              {t.identify.noMatch.manualFallback}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { plants as plantsApi } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import { IdentifyResults } from '../components/identify/IdentifyResults'
import type { PlantIdCandidate, IdentifyConfidence } from '../types'

type Step =
  | { kind: 'camera' }
  | { kind: 'identifying'; thumbnail: string }
  | { kind: 'results'; candidates: PlantIdCandidate[]; confidence: IdentifyConfidence; thumbnail: string; capturedBlob: Blob; source: string }
  | { kind: 'enriching' }
  | { kind: 'error'; message: string; thumbnail: string | null }


export function IdentifyPlantPage() {
  const t = useT()
  const navigate = useNavigate()
  // BioCLIP is the primary identifier and runs on our own infrastructure — no
  // upfront third-party consent gate. PlantNet is opt-in via the fallback button
  // on the results screen; the confirm there names the third party explicitly.
  const [step, setStep] = useState<Step>({ kind: 'camera' })
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string | null>(null)

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
      const enriched = await plantsApi.commitIdentify(candidate.scientific_name, capturedPhotoDataUrl)
      navigate('/plants/add', { state: { prefill: enriched, from: 'identify' } })
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
      const resp = await plantsApi.identifyPlantnet(step.capturedBlob)
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

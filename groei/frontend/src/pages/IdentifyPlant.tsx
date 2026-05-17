import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { identifyPlant, commitIdentification } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import { IdentifyResults } from '../components/identify/IdentifyResults'
import type { PlantIdCandidate } from '../types'

type Step =
  | { kind: 'privacy' }
  | { kind: 'camera' }
  | { kind: 'identifying'; thumbnail: string }
  | { kind: 'results'; candidates: PlantIdCandidate[]; lowConfidence: boolean; thumbnail: string; capturedBlob: Blob }
  | { kind: 'enriching' }
  | { kind: 'error'; message: string; thumbnail: string | null }

const PRIVACY_ACK_KEY = 'groei.identify.privacy_ack'

export function IdentifyPlantPage() {
  const t = useT()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(() =>
    localStorage.getItem(PRIVACY_ACK_KEY) === '1' ? { kind: 'camera' } : { kind: 'privacy' }
  )
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
      const resp = await identifyPlant(blob)
      setStep({
        kind: 'results',
        candidates: resp.candidates,
        lowConfidence: resp.low_confidence,
        thumbnail: dataUrl,
        capturedBlob: blob,
      })
    } catch (e) {
      const message = e instanceof Error && e.message.toLowerCase().includes('tijdelijk')
        ? t.identify.errorQuota
        : t.identify.errorService
      setStep({ kind: 'error', message, thumbnail: dataUrl })
    }
  }

  async function handleChoose(candidate: PlantIdCandidate) {
    if (!capturedPhotoDataUrl) return
    setStep({ kind: 'enriching' })
    try {
      const enriched = await commitIdentification(candidate.scientific_name, capturedPhotoDataUrl)
      navigate('/plants/add', { state: { prefill: enriched, from: 'identify' } })
    } catch {
      setStep({
        kind: 'error',
        message: t.identify.errorService,
        thumbnail: capturedPhotoDataUrl,
      })
    }
  }

  function ackPrivacy() {
    localStorage.setItem(PRIVACY_ACK_KEY, '1')
    setStep({ kind: 'camera' })
  }

  function manualFallback() {
    navigate('/plants/add', { state: { from: 'manual' } })
  }

  function retry() {
    setStep({ kind: 'camera' })
    setCapturedPhotoDataUrl(null)
  }

  // --- render per step ---

  if (step.kind === 'privacy') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h2 className="text-xl font-semibold mb-2">📸 {t.identify.camera.title}</h2>
        <p className="text-gray-600 my-4">{t.identify.privacy.notice}</p>
        <div className="flex flex-col gap-3">
          <button onClick={ackPrivacy} className="bg-green-700 text-white px-4 py-3 rounded">
            {t.identify.privacy.ack}
          </button>
          <button onClick={() => navigate(-1)} className="text-gray-700 px-4 py-3 rounded border">
            {t.identify.camera.cancel}
          </button>
        </div>
      </div>
    )
  }

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
        lowConfidence={step.lowConfidence}
        capturedThumbnailUrl={step.thumbnail}
        onChoose={handleChoose}
        onRetry={retry}
        onManualFallback={manualFallback}
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

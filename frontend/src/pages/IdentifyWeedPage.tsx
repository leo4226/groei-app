import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { identifyPlant } from '../api/client'
import { IdentifyCamera } from '../components/identify/IdentifyCamera'
import { IdentifyWeedResults } from '../components/identify/IdentifyWeedResults'
import { WeedSightingSheet } from '../components/identify/WeedSightingSheet'
import type { PlantIdCandidate } from '../types'

type Step =
  | { kind: 'privacy' }
  | { kind: 'camera' }
  | { kind: 'identifying'; thumbnail: string }
  | { kind: 'results'; candidates: PlantIdCandidate[]; thumbnail: string }
  | { kind: 'sighting'; weedId: number; weedName: string }
  | { kind: 'error'; message: string }

const PRIVACY_ACK_KEY = 'groei.identify.privacy_ack'

export function IdentifyWeedPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { mapId?: number; mapSlug?: string } | null

  const [step, setStep] = useState<Step>(() =>
    localStorage.getItem(PRIVACY_ACK_KEY) === '1' ? { kind: 'camera' } : { kind: 'privacy' }
  )

  useEffect(() => {
    if (!navigator.onLine) {
      setStep({ kind: 'error', message: t.identify.errorOffline })
    }
  }, [])

  async function handleCapture(blob: Blob, dataUrl: string) {
    setStep({ kind: 'identifying', thumbnail: dataUrl })
    try {
      const res = await identifyPlant(blob)
      setStep({ kind: 'results', candidates: res.candidates, thumbnail: dataUrl })
    } catch {
      setStep({ kind: 'error', message: t.weeds.errorService })
    }
  }

  function handleLogSighting(weedId: number, weedName: string) {
    setStep({ kind: 'sighting', weedId, weedName })
  }

  function handleSightingSaved(mapSlug: string) {
    navigate(`/map/${mapSlug}`)
  }

  if (step.kind === 'privacy') {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center p-8 gap-6 text-center">
        <span className="text-5xl">🌿</span>
        <p className="text-sm text-text-muted leading-relaxed">{t.weeds.privacy.notice}</p>
        <button
          onClick={() => { localStorage.setItem(PRIVACY_ACK_KEY, '1'); setStep({ kind: 'camera' }) }}
          className="w-full max-w-xs py-3 rounded-xl bg-primary text-white font-medium"
        >
          {t.weeds.privacy.ack}
        </button>
        <button onClick={() => navigate(-1)} className="text-sm text-text-muted">
          {t.identify.camera.cancel}
        </button>
      </div>
    )
  }

  if (step.kind === 'camera') {
    return <IdentifyCamera onCapture={handleCapture} onCancel={() => navigate(-1)} />
  }

  if (step.kind === 'identifying') {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center gap-4">
        <img src={step.thumbnail} alt="" className="h-40 w-40 object-cover rounded-2xl opacity-60" />
        <p className="text-sm text-text-muted animate-pulse">{t.weeds.identifying}</p>
      </div>
    )
  }

  if (step.kind === 'results') {
    return (
      <IdentifyWeedResults
        candidates={step.candidates}
        thumbnail={step.thumbnail}
        onLogSighting={handleLogSighting}
        onRetry={() => setStep({ kind: 'camera' })}
        onDismiss={() => navigate(-1)}
      />
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
        onCancel={() => setStep({ kind: 'camera' })}
      />
    )
  }

  // error
  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center p-8 gap-4 text-center">
      <p className="text-sm text-text">{(step as { message: string }).message}</p>
      <button onClick={() => setStep({ kind: 'camera' })} className="text-sm px-4 py-2 rounded-xl bg-primary text-white">
        {t.weeds.noMatch.retry}
      </button>
      <button onClick={() => navigate(-1)} className="text-sm text-text-muted">{t.weeds.noMatch.dismiss}</button>
    </div>
  )
}

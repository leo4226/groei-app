import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'

export type RetakeReason = 'no-match' | 'low-confidence' | 'none'

type Props = {
  onCapture: (blob: Blob, dataUrl: string) => void
  onCancel: () => void
  retakeReason?: RetakeReason
  title?: string
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function IdentifyCamera({ onCapture, onCancel, retakeReason = 'none', title }: Props) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hintDismissed, setHintDismissed] = useState(false)

  // Digital zoom: we scale the video preview and crop the capture to match.
  // The PAGE is locked against pinch-zoom (touchAction:none + gesture preventDefault)
  // so the on-screen controls never drift out of view — that was the original bug:
  // position:fixed controls anchor to the layout viewport, so page-zoom pushed them
  // off the visible (visual) viewport. Here the page never zooms; only the video does.
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const zoomRef = useRef(MIN_ZOOM)

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch {
        setError(t.identify.camera.noAccess)
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [t])

  // Pinch-to-zoom. Native non-passive listeners so we can preventDefault — the only
  // reliable way to stop iOS Safari from page-zooming (touchAction alone is ignored
  // by Safari's gesture* events).
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let startDist = 0
    let startZoom = MIN_ZOOM
    const distOf = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      )
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = distOf(e.touches)
        startZoom = zoomRef.current
        e.preventDefault()
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault()
        const next = clamp(startZoom * (distOf(e.touches) / startDist), MIN_ZOOM, MAX_ZOOM)
        zoomRef.current = next
        setZoom(next)
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0
    }
    const preventGesture = (e: Event) => e.preventDefault() // iOS Safari page-zoom
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    // gesture* are Safari-only and not in lib.dom — bind via a narrowed cast.
    const gestureEl = el as unknown as {
      addEventListener: (type: string, l: EventListener, o?: AddEventListenerOptions) => void
      removeEventListener: (type: string, l: EventListener) => void
    }
    gestureEl.addEventListener('gesturestart', preventGesture, { passive: false })
    gestureEl.addEventListener('gesturechange', preventGesture, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      gestureEl.removeEventListener('gesturestart', preventGesture)
      gestureEl.removeEventListener('gesturechange', preventGesture)
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return
    // Crop the centred region the user framed: digital zoom shows 1/zoom of the frame.
    const z = zoomRef.current
    const cw = vw / z
    const ch = vh / z
    const sx = (vw - cw) / 2
    const sy = (vh - ch) / 2
    // Cap output dimensions.
    const MAX = 1920
    let ow = cw
    let oh = ch
    if (ow > MAX || oh > MAX) {
      const scale = Math.min(MAX / ow, MAX / oh)
      ow = Math.round(ow * scale)
      oh = Math.round(oh * scale)
    }
    const canvas = document.createElement('canvas')
    canvas.width = ow
    canvas.height = oh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, ow, oh)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        onCapture(blob, dataUrl)
      },
      'image/jpeg',
      0.85,
    )
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
      style={{ touchAction: 'none' }}
    >
      <div className="fixed top-0 inset-x-0 flex items-center justify-between p-4 text-white z-10">
        <button onClick={onCancel} aria-label={t.identify.camera.cancel} className="text-2xl">×</button>
        <span className="text-sm opacity-75">{title ?? t.identify.camera.title}</span>
        <span className="w-6" />
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden relative pt-16 pb-32">
        {error ? (
          <div className="text-white text-center px-8 py-4">
            <p>{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-w-full max-h-full object-contain"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            />
            {zoom > 1.01 && (
              <div className="fixed top-16 inset-x-0 flex justify-center pointer-events-none z-10">
                <span className="px-2 py-0.5 rounded-full bg-black/50 text-white text-xs tabular-nums">
                  {zoom.toFixed(1)}×
                </span>
              </div>
            )}
            {/* Pre-capture coaching. A failed/low-confidence retake shows one
                targeted tip; a fresh open shows the dismissible close-up/light
                hint. Sits above the shutter so it never collides with the top
                chrome or the zoom badge. */}
            {retakeReason === 'no-match' || retakeReason === 'low-confidence' ? (
              <div
                className="fixed inset-x-0 flex justify-center px-6 pointer-events-none z-10"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10.5rem)' }}
              >
                <span className="px-3 py-1.5 rounded-full bg-black/50 text-white text-xs text-center max-w-full">
                  {retakeReason === 'no-match'
                    ? t.identify.camera.retakeTipNoMatch
                    : t.identify.camera.retakeTipLowConfidence}
                </span>
              </div>
            ) : !hintDismissed && (
              <div
                className="fixed inset-x-0 flex justify-center px-6 z-10"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10.5rem)' }}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs text-center max-w-full">
                  <span>{t.identify.camera.hint}</span>
                  <button
                    onClick={() => setHintDismissed(true)}
                    aria-label={t.identify.camera.hintDismiss}
                    className="shrink-0 text-white/70 hover:text-white cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            <div
              className="fixed inset-x-0 flex justify-center pointer-events-none"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
            >
              <button
                onClick={capture}
                aria-label={t.identify.camera.capture}
                className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 active:scale-95 transition-transform pointer-events-auto"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

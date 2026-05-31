import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'

type Props = {
  onCapture: (blob: Blob, dataUrl: string) => void
  onCancel: () => void
}

export function IdentifyCamera({ onCapture, onCancel }: Props) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
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

  function capture() {
    const video = videoRef.current
    if (!video) return
    const MAX = 1920
    let w = video.videoWidth
    let h = video.videoHeight
    if (w > MAX || h > MAX) {
      const scale = Math.min(MAX / w, MAX / h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
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
    <div className="fixed inset-0 z-[60] bg-black flex flex-col touch-none">
      <div className="fixed top-0 inset-x-0 flex items-center justify-between p-4 text-white z-10">
        <button onClick={onCancel} aria-label={t.identify.camera.cancel} className="text-2xl">×</button>
        <span className="text-sm opacity-75">{t.identify.camera.title}</span>
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
            />
            <div className="fixed bottom-10 inset-x-0 flex justify-center pointer-events-none">
              <button
                onClick={capture}
                aria-label={t.identify.camera.capture}
                className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 active:scale-95 transition-transform pointer-events-auto"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

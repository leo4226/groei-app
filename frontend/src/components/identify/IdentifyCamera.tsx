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
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
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
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <button onClick={onCancel} aria-label={t.identify.camera.cancel} className="text-2xl">×</button>
        <span className="text-sm opacity-75">{t.identify.camera.title}</span>
        <span className="w-6" />
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-white text-center p-8">
            <p>{error}</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>
      {!error && (
        <div className="p-6 flex justify-center">
          <button
            onClick={capture}
            aria-label={t.identify.camera.capture}
            className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 active:scale-95 transition-transform"
          />
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import Glyph from './Glyph'

// The build injects __BUILD_HASH__ (Vercel commit sha) and emits
// /version.json with the same hash. A long-lived PWA instance compares the
// two when the app comes back to the foreground (plus a slow interval) and
// offers a one-tap reload — replacing the "close and reopen the app after a
// deploy" ritual. 'dev' builds skip the check entirely.
const CHECK_INTERVAL_MS = 30 * 60 * 1000

export default function UpdateToast() {
  const t = useT()
  const [show, setShow] = useState(false)
  const dismissed = useRef(false)

  useEffect(() => {
    if (__BUILD_HASH__ === 'dev') return
    let stopped = false

    const check = async () => {
      if (stopped || dismissed.current) return
      try {
        const res = await fetch('/version.json', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { hash?: string }
        if (!stopped && data.hash && data.hash !== __BUILD_HASH__ && !dismissed.current) {
          setShow(true)
        }
      } catch {
        // offline / transient — try again next time
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!show) return null

  return (
    <div
      className="fixed bottom-20 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-surface py-2 pl-4 pr-2 shadow-[0_10px_30px_rgba(31,42,30,0.18)]"
      role="status"
    >
      <span className="whitespace-nowrap text-[13px] text-text">{t.appUpdate.available}</span>
      <button
        onClick={() => window.location.reload()}
        className="cursor-pointer whitespace-nowrap rounded-full border-none bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
      >
        {t.appUpdate.action}
      </button>
      <button
        onClick={() => { dismissed.current = true; setShow(false) }}
        aria-label={t.appUpdate.dismiss}
        className="inline-flex cursor-pointer items-center border-none bg-transparent p-1 text-text-muted"
      >
        <Glyph name="x" size={14} />
      </button>
    </div>
  )
}

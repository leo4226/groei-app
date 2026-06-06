import { useState, useEffect } from 'react'

const QUERY = '(orientation: landscape) and (max-height: 500px)'

/** True when the device is a phone in landscape (matches the same breakpoint as index.css). */
export function useLandscapeMobile(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(QUERY).matches
  })
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return matches
}

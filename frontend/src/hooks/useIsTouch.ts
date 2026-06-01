import { useState, useEffect } from 'react'

// True on touch-primary devices (phones/tablets) in ANY orientation — unlike a
// width breakpoint, a landscape phone stays "touch". Use this for touch-vs-mouse
// UI decisions; use useIsMobile for width-based layout decisions.
const QUERY = '(pointer: coarse)'

export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isTouch
}

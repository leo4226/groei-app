import { useState, useEffect } from 'react'

export function useIsMobile(maxWidth = 767): boolean {
  const query = `(max-width: ${maxWidth}px)`
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return isMobile
}

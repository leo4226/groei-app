import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import Glyph from './Glyph'

// Standard pull-to-refresh mechanics (matches iOS UIRefreshControl / Android
// SwipeRefreshLayout expectations): only arms when the scroll container is at
// the very top, content follows the finger with resistance, an indicator
// commits past THRESHOLD_PX with a small haptic tick, and releasing triggers
// the refresh. Installed PWAs get no native gesture (and the browser variant
// would full-page-reload the SPA), hence this custom implementation.
const THRESHOLD_PX = 64
const MAX_PULL_PX = 108
const HOLD_PX = 52
const RESISTANCE = 0.42
const MIN_SPIN_MS = 500

type Props = {
  /** The scrollable ancestor (the app's <main>) whose top edge arms the pull. */
  scrollRef: RefObject<HTMLElement | null>
  enabled: boolean
  onRefresh: () => Promise<unknown>
  children: ReactNode
}

export default function PullToRefresh({ scrollRef, enabled, onRefresh, children }: Props) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [settling, setSettling] = useState(false)

  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const refreshingRef = useRef(false)
  const pullRef = useRef(0)
  const startY = useRef<number | null>(null)
  const buzzed = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const setPullBoth = (v: number) => { pullRef.current = v; setPull(v) }

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || refreshingRef.current) return
      startY.current = el.scrollTop <= 0 ? e.touches[0].clientY : null
      buzzed.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshingRef.current || !enabledRef.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0 || el.scrollTop > 0) {
        if (pullRef.current !== 0) setPullBoth(0)
        return
      }
      // The container can't scroll further up, so claim the gesture.
      if (e.cancelable) e.preventDefault()
      const next = Math.min(dy * RESISTANCE, MAX_PULL_PX)
      if (next >= THRESHOLD_PX && !buzzed.current) {
        buzzed.current = true
        try { navigator.vibrate?.(10) } catch { /* unsupported */ }
      }
      setPullBoth(next)
    }

    const onTouchEnd = () => {
      if (startY.current === null) return
      startY.current = null
      if (refreshingRef.current) return
      if (pullRef.current >= THRESHOLD_PX) {
        refreshingRef.current = true
        setRefreshing(true)
        setSettling(true)
        setPullBoth(HOLD_PX)
        const started = Date.now()
        Promise.resolve(onRefreshRef.current()).catch(() => {}).then(() => {
          const remaining = Math.max(0, MIN_SPIN_MS - (Date.now() - started))
          setTimeout(() => {
            refreshingRef.current = false
            setRefreshing(false)
            setPullBoth(0)
            setTimeout(() => setSettling(false), 250)
          }, remaining)
        })
      } else {
        setSettling(true)
        setPullBoth(0)
        setTimeout(() => setSettling(false), 250)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [scrollRef])

  const progress = Math.min(pull / THRESHOLD_PX, 1)

  return (
    <div className="relative">
      {/* Indicator: a sprout that grows and turns as you pull, spins while refreshing */}
      {pull > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 z-20"
          style={{
            top: pull - 44,
            transform: 'translateX(-50%)',
            opacity: refreshing ? 1 : progress,
            transition: settling ? 'top 0.25s ease, opacity 0.25s ease' : 'none',
          }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-primary shadow-[0_4px_14px_rgba(31,42,30,0.14)]"
          >
            <span
              className={refreshing ? 'inline-flex animate-spin' : 'inline-flex'}
              style={refreshing ? undefined : { transform: `rotate(${progress * 180}deg) scale(${0.6 + 0.4 * progress})` }}
            >
              <Glyph name="sprout" size={18} strokeWidth={2} />
            </span>
          </div>
        </div>
      )}
      <div style={{
        transform: pull > 0 ? `translateY(${pull}px)` : undefined,
        transition: settling ? 'transform 0.25s ease' : 'none',
      }}>
        {children}
      </div>
    </div>
  )
}

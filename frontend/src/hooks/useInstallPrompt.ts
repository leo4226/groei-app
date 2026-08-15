import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * PWA install prompt state and helpers.
 *
 * - Captures the native `beforeinstallprompt` (Android/Chrome/Edge) so we can
 *   trigger the OS install dialog from our own CTA instead of waiting for the
 *   browser's address-bar icon to be discovered.
 * - Tracks standalone mode so we never offer install to someone who already
 *   installed the app.
 * - iOS has no `beforeinstallprompt`; there the UI must hand-guide through
 *   Share → Add to Home Screen. `isIos` lets the caller render those steps.
 * - Dismissal is remembered (localStorage) so we don't nag every session;
 *   the offer reappears after `RE_SHOW_AFTER_DAYS` if the user still hasn't
 *   installed.
 */

export const INSTALL_DISMISSED_KEY = 'floreren-install-dismissed-at'
export const RE_SHOW_AFTER_DAYS = 5
export const DAY_MS = 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISSED_KEY)
    const value = raw ? Number(raw) : NaN
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function isStandaloneMode(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

export interface ShouldOfferInput {
  isStandalone: boolean
  isMobile: boolean
  canNativePrompt: boolean
  isIos: boolean
  dismissedAt: number | null
  now: number
}

/**
 * Pure decision rule for surfacing an install offer. Extracted so the logic
 * is unit-testable without a DOM (matches the repo's node-env test style).
 */
export function shouldOfferInstall({
  isStandalone,
  isMobile,
  canNativePrompt,
  isIos,
  dismissedAt,
  now,
}: ShouldOfferInput): boolean {
  if (isStandalone) return false
  if (!isMobile) return false
  if (!canNativePrompt && !isIos) return false // desktop Chrome has its own address-bar icon
  const dismissed = dismissedAt ?? 0
  return now - dismissed >= RE_SHOW_AFTER_DAYS * DAY_MS
}

/** What pressing the sheet's primary button should actually do. */
export type InstallAction = 'acknowledge' | 'native-prompt' | 'unavailable'

/**
 * Pure decision for the install sheet's primary button, extracted so the
 * dead-button case stays pinned (the repo tests hook logic this way rather
 * than rendering).
 *
 * On iOS the button reads "I've done this" — there is no `beforeinstallprompt`
 * to fire, so it is an acknowledgement and must simply close the sheet. It used
 * to call promptInstall() regardless, get `false` back, and fall through a
 * branch that excluded iOS, so the button did nothing whatsoever.
 */
export function installActionFor(
  { isIos, canNativePrompt }: { isIos: boolean; canNativePrompt: boolean },
): InstallAction {
  if (isIos) return 'acknowledge'
  if (canNativePrompt) return 'native-prompt'
  // Desktop, or the browser's install criteria aren't met. Claiming success
  // here would be a lie — nothing was installed.
  return 'unavailable'
}


export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(isStandaloneMode)
  const [dismissedAt, setDismissedAt] = useState<number | null>(readDismissedAt)

  const isIos = useMemo(() => /iPhone|iPad|iPod/i.test(navigator.userAgent), [])
  const isMobile = useMemo(() => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent), [])

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // suppress the browser's own address-bar install UI
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsStandalone(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  /** True when we should surface an install offer at all. */
  const shouldOffer = useMemo(() => (
    shouldOfferInstall({
      isStandalone,
      isMobile,
      canNativePrompt: Boolean(deferredPrompt),
      isIos,
      dismissedAt,
      now: Date.now(),
    })
  ), [isStandalone, isMobile, deferredPrompt, isIos, dismissedAt])

  const dismiss = useCallback(() => {
    setDismissedAt(Date.now())
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()))
    } catch { /* noop */ }
  }, [])

  /** Trigger the native install dialog (Android/Chrome). Returns false when no prompt is available. */
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') setIsStandalone(true)
    } catch {
      return false
    }
    setDeferredPrompt(null)
    return true
  }, [deferredPrompt])

  return {
    isIos,
    isMobile,
    isStandalone,
    canNativePrompt: Boolean(deferredPrompt),
    shouldOffer,
    dismiss,
    promptInstall,
  }
}

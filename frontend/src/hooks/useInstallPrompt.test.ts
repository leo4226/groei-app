import { describe, expect, it } from 'vitest'
import { shouldOfferInstall, RE_SHOW_AFTER_DAYS, DAY_MS } from './useInstallPrompt'

const NOW = 1_800_000_000_000

describe('shouldOfferInstall', () => {
  it('does not offer install to desktop browsers', () => {
    expect(shouldOfferInstall({
      isStandalone: false,
      isMobile: false,
      canNativePrompt: true,
      isIos: false,
      dismissedAt: null,
      now: NOW,
    })).toBe(false)
  })

  it('does not offer install when already standalone', () => {
    expect(shouldOfferInstall({
      isStandalone: true,
      isMobile: true,
      canNativePrompt: true,
      isIos: false,
      dismissedAt: null,
      now: NOW,
    })).toBe(false)
  })

  it('does not offer on mobile without a captured prompt and non-iOS', () => {
    expect(shouldOfferInstall({
      isStandalone: false,
      isMobile: true,
      canNativePrompt: false,
      isIos: false,
      dismissedAt: null,
      now: NOW,
    })).toBe(false)
  })

  it('offers on mobile after beforeinstallprompt is captured', () => {
    expect(shouldOfferInstall({
      isStandalone: false,
      isMobile: true,
      canNativePrompt: true,
      isIos: false,
      dismissedAt: null,
      now: NOW,
    })).toBe(true)
  })

  it('suppresses the offer right after dismissal', () => {
    expect(shouldOfferInstall({
      isStandalone: false,
      isMobile: true,
      canNativePrompt: true,
      isIos: false,
      dismissedAt: NOW - 60_000,
      now: NOW,
    })).toBe(false)
  })

  it('re-offers after the re-show window passes', () => {
    expect(shouldOfferInstall({
      isStandalone: false,
      isMobile: true,
      canNativePrompt: true,
      isIos: false,
      dismissedAt: NOW - (RE_SHOW_AFTER_DAYS + 1) * DAY_MS,
      now: NOW,
    })).toBe(true)
  })

  it('offers on iOS without a native prompt (hand-guide path)', () => {
    expect(shouldOfferInstall({
      isStandalone: false,
      isMobile: true,
      canNativePrompt: false,
      isIos: true,
      dismissedAt: null,
      now: NOW,
    })).toBe(true)
  })

  it('respects dismissal on iOS too', () => {
    expect(shouldOfferInstall({
      isStandalone: false,
      isMobile: true,
      canNativePrompt: false,
      isIos: true,
      dismissedAt: NOW - 60_000,
      now: NOW,
    })).toBe(false)
  })
})

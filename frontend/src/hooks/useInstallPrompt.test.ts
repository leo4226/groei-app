import { describe, expect, it } from 'vitest'
import { installActionFor, shouldOfferInstall, RE_SHOW_AFTER_DAYS, DAY_MS } from './useInstallPrompt'

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

describe('installActionFor', () => {
  it('treats the iOS button as an acknowledgement, not an install trigger', () => {
    // "Ik heb dit gedaan" — there is no beforeinstallprompt on iOS, so the
    // only sensible response is to believe them and close the sheet. This
    // used to call promptInstall(), get false, and fall through a branch that
    // excluded iOS, leaving a button that did nothing at all.
    expect(installActionFor({ isIos: true, canNativePrompt: false })).toBe('acknowledge')
  })

  it('still acknowledges on iOS even if a prompt were somehow captured', () => {
    expect(installActionFor({ isIos: true, canNativePrompt: true })).toBe('acknowledge')
  })

  it('fires the native dialog when the browser gave us one', () => {
    expect(installActionFor({ isIos: false, canNativePrompt: true })).toBe('native-prompt')
  })

  it('reports unavailable rather than faking success', () => {
    // Desktop, or criteria not met. The sheet used to show "Floreren is on
    // your home screen!" here, which was simply untrue.
    expect(installActionFor({ isIos: false, canNativePrompt: false })).toBe('unavailable')
  })

  it('never returns native-prompt without a captured prompt', () => {
    const combos = [
      { isIos: true, canNativePrompt: false },
      { isIos: false, canNativePrompt: false },
    ]
    for (const c of combos) {
      expect(installActionFor(c)).not.toBe('native-prompt')
    }
  })
})

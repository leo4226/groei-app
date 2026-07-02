// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pushAvailabilityInfo, pushSupported } from '../push'

/**
 * Helper: set a window global and ensure it's configurable.
 * For removal, use deleteWindowProp().
 */
function setWindowProp(name: string, value: unknown) {
  Object.defineProperty(window, name, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

function deleteWindowProp(name: string) {
  delete (window as unknown as Record<string, unknown>)[name]
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
    writable: true,
  })
}

function mockMatchMedia(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('pushSupported', () => {
  beforeEach(() => {
    setWindowProp('PushManager', vi.fn())
    setWindowProp('Notification', vi.fn())
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({}) },
      configurable: true, writable: true,
    })
  })

  it('returns true when all push APIs are present', () => {
    expect(pushSupported()).toBe(true)
  })

  it('returns false when PushManager is missing', () => {
    deleteWindowProp('PushManager')
    expect(pushSupported()).toBe(false)
  })

  it('returns false when Notification is missing', () => {
    deleteWindowProp('Notification')
    expect(pushSupported()).toBe(false)
  })
})

describe('pushAvailabilityInfo', () => {
  beforeEach(() => {
    // Default: non-iOS desktop, push APIs present
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    mockMatchMedia(false)
    setWindowProp('PushManager', vi.fn())
    setWindowProp('Notification', vi.fn())
  })

  it('returns supported on a desktop browser with push APIs', () => {
    expect(pushAvailabilityInfo().state).toBe('supported')
  })

  it('returns ios-not-standalone on iOS browser tab', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
    mockMatchMedia(false)
    const info = pushAvailabilityInfo()
    expect(info.state).toBe('ios-not-standalone')
  })

  it('returns ios-standalone-unsupported on iOS standalone without push APIs', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
    mockMatchMedia(true)
    deleteWindowProp('PushManager')
    deleteWindowProp('Notification')
    const info = pushAvailabilityInfo()
    expect(info.state).toBe('ios-standalone-unsupported')
  })

  it('returns unsupported on non-iOS browser without push APIs', () => {
    deleteWindowProp('PushManager')
    deleteWindowProp('Notification')
    const info = pushAvailabilityInfo()
    expect(info.state).toBe('unsupported')
  })

  it('includes diagnostic string in all states', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
    mockMatchMedia(false)
    expect(pushAvailabilityInfo().diagnostic).toContain('iOS')
  })

  it('handles iOS standalone + push APIs = supported (Safari Home Screen PWA)', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
    mockMatchMedia(true)
    const info = pushAvailabilityInfo()
    expect(info.state).toBe('supported')
  })
})

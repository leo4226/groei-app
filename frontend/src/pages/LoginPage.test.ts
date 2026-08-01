// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import LoginPage from './LoginPage'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const originalMatchMedia = window.matchMedia
const originalIntersectionObserver = globalThis.IntersectionObserver

describe('public landing page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
    Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: originalIntersectionObserver })
  })

  it('keeps acquisition on the public homepage and auth on its own route', async () => {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(LoginPage, { publicHome: true }),
      ))
    })

    expect(container.querySelector('[data-testid="landing-primary-cta"]')?.getAttribute('href')).toBe('/login?mode=register')
    expect(container.querySelector('[data-testid="landing-demo-cta"]')?.getAttribute('href')).toBe('/demo')
    expect(container.querySelector('[data-testid="landing-sun-proof"]')).not.toBeNull()
    expect(container.querySelector('#auth-card')).toBeNull()
  })

  it('renders the responsive hero art with one composition per breakpoint', async () => {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(LoginPage, { publicHome: true }),
      ))
    })

    const picture = container.querySelector('picture')
    expect(picture).not.toBeNull()
    const sources = Array.from(picture?.querySelectorAll('source') ?? [])
    // Desktop/tablet (≥768px) → A1.5 Shadow; AVIF first, WebP fallback.
    const desktopSources = sources.filter((s) => s.getAttribute('media') === '(min-width: 768px)')
    expect(desktopSources.map((s) => [s.getAttribute('type'), s.getAttribute('srcSet'), s.getAttribute('width'), s.getAttribute('height')])).toEqual([
      ['image/avif', '/landing/botanical-sun-atlas-desktop.avif', '1024', '576'],
      ['image/webp', '/landing/botanical-sun-atlas-desktop.webp', '1024', '576'],
    ])
    // Mobile (<768px) → Mobile A; AVIF first, WebP fallback.
    const mobileSources = sources.filter((s) => s.getAttribute('media') === null)
    expect(mobileSources.map((s) => [s.getAttribute('type'), s.getAttribute('srcSet'), s.getAttribute('width'), s.getAttribute('height')])).toEqual([
      ['image/avif', '/landing/botanical-sun-atlas-mobile.avif', '576', '1024'],
      ['image/webp', '/landing/botanical-sun-atlas-mobile.webp', '576', '1024'],
    ])

    const img = picture?.querySelector('img')
    // Decorative atmospheric art: empty alt, no caption in the hero figure.
    expect(img?.getAttribute('alt')).toBe('')
    // Hero is the LCP element: high fetch priority, never lazy-loaded, and
    // explicit intrinsic dimensions so the box is reserved before load (no CLS).
    expect(img?.getAttribute('fetchpriority')).toBe('high')
    expect(img?.getAttribute('loading')).toBeNull()
    expect(img?.getAttribute('width')).toBe('576')
    expect(img?.getAttribute('height')).toBe('1024')
  })

  it('switches the public landing copy to English and persists the choice', async () => {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(LoginPage, { publicHome: true }),
      ))
    })

    const englishButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'EN')
    expect(englishButton).toBeDefined()

    await act(async () => {
      englishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Stop guessing where a plant should go.')
    expect(container.querySelector('[data-testid="landing-primary-cta"]')?.textContent).toBe('Create an account')
    expect(localStorage.getItem('floreren-landing-lang')).toBe('en')
  })

  it('keeps the login form on its dedicated route with programmatic labels', async () => {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/login'] },
        createElement(LoginPage),
      ))
    })

    expect(container.querySelector('#auth-card')).not.toBeNull()
    expect(container.querySelector('label[for="auth-email"]')).not.toBeNull()
    expect(container.querySelector('#auth-email')).not.toBeNull()
  })

  it('uses the static sun proof when reduced motion is requested', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })

    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(LoginPage, { publicHome: true }),
      ))
    })

    const proof = container.querySelector('[data-testid="landing-sun-proof"]')
    expect(proof?.querySelector('video')).toBeNull()
    expect(proof?.querySelector('img')?.getAttribute('src')).toBe('/landing/sunmap-demo-poster.jpg')
  })

  it('keeps the sun proof static until it reaches the viewport', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: function (callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        return {
          observe: () => callback([{ isIntersecting: false }]),
          disconnect: () => {},
        }
      },
    })

    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(LoginPage, { publicHome: true }),
      ))
    })

    expect(container.querySelector('[data-testid="landing-sun-proof"] video')).toBeNull()
  })
})

// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import LoginPage, { LandingTour } from './LoginPage'

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
    expect(container.querySelector('#auth-card')).toBeNull()
  })

  it('keeps the homepage to a single screen and links the long form to /tour', async () => {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(LoginPage, { publicHome: true }),
      ))
    })

    // The proof, the four steps and the trust block moved to /tour, so the
    // homepage stays one composed screen instead of the top of a scroll.
    expect(container.querySelector('[data-testid="landing-tour-link"]')?.getAttribute('href')).toBe('/tour')
    expect(container.querySelector('[data-testid="landing-sun-proof"]')).toBeNull()
    expect(container.textContent).not.toContain('Weet wat je tuin voor bijen doet')
  })

  it('carries the long-form proof on the tour route', async () => {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/tour'] },
        createElement(LandingTour),
      ))
    })

    expect(container.querySelector('[data-testid="landing-sun-proof"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="landing-demo-cta"]')?.getAttribute('href')).toBe('/demo')
    expect(container.textContent).toContain('Weet wat je tuin voor bijen doet')
  })

  it('uses one high-priority, media-selected decorative hero composition', async () => {
    await act(async () => {
      root.render(createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(LoginPage, { publicHome: true }),
      ))
    })

    const hero = container.querySelector('[data-testid="landing-hero-art"]')
    const sources = Array.from(hero?.querySelectorAll('source') ?? [])
    const heroImage = hero?.querySelector('img')

    expect(sources).toHaveLength(4)
    expect(sources.map((source) => source.getAttribute('srcset'))).toEqual([
      '/landing/botanical-sun-atlas-mobile.avif',
      '/landing/botanical-sun-atlas-mobile.webp',
      '/landing/botanical-sun-atlas-desktop.avif',
      '/landing/botanical-sun-atlas-desktop.webp',
    ])
    // Full-bleed art is picked by viewport SHAPE, not width: a portrait
    // desktop window needs the portrait plate or the garden crops away.
    expect(sources.slice(0, 2).every((source) => source.getAttribute('media') === '(max-aspect-ratio: 1/1)')).toBe(true)
    expect(heroImage?.getAttribute('alt')).toBe('')
    expect(heroImage?.getAttribute('width')).toBe('1024')
    expect(heroImage?.getAttribute('height')).toBe('576')
    expect(heroImage?.getAttribute('fetchpriority')).toBe('high')
    expect(heroImage?.getAttribute('loading')).toBeNull()
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
        { initialEntries: ['/tour'] },
        createElement(LandingTour),
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
        { initialEntries: ['/tour'] },
        createElement(LandingTour),
      ))
    })

    expect(container.querySelector('[data-testid="landing-sun-proof"] video')).toBeNull()
  })
})

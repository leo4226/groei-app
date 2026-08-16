// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '../../context/LanguageContext'
import ReadOnlyBanner from './ReadOnlyBanner'

describe('ReadOnlyBanner', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function render(lang: 'en' | 'nl') {
    localStorage.setItem('floreren_lang', lang)
    act(() => {
      root.render(createElement(
        LanguageProvider,
        null,
        createElement(ReadOnlyBanner),
      ))
    })
  }

  it('renders the read-only notice in English', () => {
    render('en')
    expect(container.textContent).toContain('Read-only')
    expect(container.textContent).toContain('only editors can change this')
  })

  it('renders the read-only notice in Dutch', () => {
    render('nl')
    expect(container.textContent).toContain('Alleen lezen')
    expect(container.textContent).toContain('alleen bewerkers kunnen dit aanpassen')
  })
})

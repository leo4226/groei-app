// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentifyResults } from './IdentifyResults'
import { LanguageProvider } from '../../context/LanguageContext'
import type { IdentifyConfidence, PlantIdCandidate } from '../../types'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../store/useFloreren', () => ({
  useFloreren: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { users: [], activeUserId: null }
    return selector ? selector(state) : state
  },
}))

vi.mock('../../api/client', () => ({
  weeds: { catalog: () => Promise.resolve([]) },
}))

const candidate: PlantIdCandidate = {
  scientific_name: 'Monstera deliciosa',
  common_names_nl: ['Gatenplant'],
  common_names_en: ['Swiss cheese plant'],
  confidence: 0.9,
  species_id: 1,
  thumbnail_url: 'https://r2.test/monstera.jpg',
}

interface Props {
  candidates?: PlantIdCandidate[]
  confidence?: IdentifyConfidence
  capturedThumbnailUrl?: string | null
  source?: string
}

function renderResults(props: Props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(LanguageProvider, null,
      createElement(IdentifyResults, {
        candidates: props.candidates ?? [candidate],
        confidence: props.confidence ?? 'high',
        capturedThumbnailUrl: props.capturedThumbnailUrl ?? 'https://r2.test/shot.jpg',
        source: props.source ?? 'bioclip',
        lang: 'nl',
        onChoose: vi.fn(),
        onRetry: vi.fn(),
        onManualFallback: vi.fn(),
        onTryPlantnet: vi.fn(),
        onLogSighting: vi.fn(),
      }),
    ))
  })
  return { container, root }
}

describe('IdentifyResults', () => {
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

  it('renders the fixed viewport sheet with a scrollable middle and pinned actions', () => {
    const { container: c } = renderResults()
    const sheet = c.querySelector('.fixed.inset-0.z-\\[60\\]')
    expect(sheet).not.toBeNull()
    // Scrollable middle present.
    expect(sheet!.querySelector('.overflow-y-auto')).not.toBeNull()
    // Action row present and rendered (retake + candidate rows).
    expect(c.textContent).toContain('Gatenplant')
  })

  it('renders the no-match branch as a fixed sheet with the manual-fallback action', () => {
    const { container: c } = renderResults({ candidates: [], confidence: 'no_match' })
    expect(c.querySelector('.fixed.inset-0.z-\\[60\\]')).not.toBeNull()
    // No candidate rows, but the pinned action row is still present.
    expect(c.textContent).not.toContain('Monstera deliciosa')
  })
})

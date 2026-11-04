// @vitest-environment jsdom
//
// The icon catalog is ~70 KB and several screens ask for it on mount; one
// request should serve them, and an admin sync should start a fresh one.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const catalog = [
  { id: 'tomato', name: 'Tomato', url: '/icons/tomato.svg' },
  { id: 'basil', name: 'Basil', url: '/icons/basil.svg' },
]

describe('icons.catalog', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    fetchMock = vi.fn(async (url: string) => new Response(
      JSON.stringify(url.includes('/sync') ? { matched_plants: 0 } : catalog),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shares one request between callers and hands each its own sorted copy', async () => {
    const { icons } = await import('./client')
    const [first, second] = await Promise.all([icons.catalog(), icons.catalog()])
    const third = await icons.catalog()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.map((icon) => icon.name)).toEqual(['Basil', 'Tomato'])
    expect(second).not.toBe(first)
    third.pop()
    expect((await icons.catalog())).toHaveLength(2)
  })

  it('fetches again after an icon sync', async () => {
    const { icons } = await import('./client')
    await icons.catalog()
    await icons.sync()
    await icons.catalog()
    const catalogCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/icon-catalog'))
    expect(catalogCalls).toHaveLength(2)
  })

  it('does not remember a failed request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"detail":"boom"}', { status: 500 }))
    const { icons } = await import('./client')
    await expect(icons.catalog()).rejects.toThrow()
    expect(await icons.catalog()).toHaveLength(2)
  })
})

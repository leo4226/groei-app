import { describe, expect, it } from 'vitest'

const SOURCE = import.meta.glob('./IdentifyPlant.tsx', {
  eager: true,
  query: '?raw',
  import: 'default',
})['./IdentifyPlant.tsx'] as string

describe('identify photo review layout', () => {
  it('fills the app content area instead of adding another viewport above the bottom nav', () => {
    const reviewScreen = SOURCE.match(/if \(step\.kind === 'review'\)[\s\S]*?\/\/ --- render ---/)?.[0]

    expect(reviewScreen).toBeDefined()
    expect(reviewScreen).toContain('mx-auto flex h-full max-w-md flex-col')
    expect(reviewScreen).not.toContain('min-h-screen')
    expect(reviewScreen).toContain('mt-auto flex flex-col')
  })
})

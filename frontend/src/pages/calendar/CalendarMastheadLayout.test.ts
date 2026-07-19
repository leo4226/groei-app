// The browser app intentionally excludes Node types; Vitest runs this source-contract test in Node.
// @ts-expect-error -- node:fs is available in Vitest but not declared by the frontend tsconfig.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./calendar.css', import.meta.url), 'utf8')

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))
  if (!match) throw new Error(`Missing CSS rule: ${selector}`)
  return match[1]
}

describe('Calendar desktop masthead alignment', () => {
  it('uses the same vertical typography and spacing as Plants and Settings', () => {
    expect(css.length).toBeGreaterThan(1000)
    expect(rule('.cal-page .masthead')).toContain(
      'padding: max(40px, env(safe-area-inset-top, 0px)) clamp(24px, 3vw, 56px) 20px;',
    )
    expect(rule('.cal-page .title-block .eyebrow')).toContain('margin-bottom: 8px;')

    const lede = rule('.cal-page .title-block .lede')
    expect(lede).toContain('font-size: 15px;')
    expect(lede).toContain('margin: 8px 0 0;')
    expect(lede).toContain('max-width: 440px;')
    expect(lede).toContain('line-height: 1.5;')
  })
})

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderChatText } from './chatMarkdown'

function html(content: string): string {
  return renderToStaticMarkup(renderChatText(content) as never)
}

describe('renderChatText', () => {
  it('renders bold emphasis', () => {
    expect(html('Basilicum is **2 dagen** te laat.')).toContain('<strong>2 dagen</strong>')
  })

  it('renders links with safe target/rel attributes', () => {
    const out = html('Zie [het schema](https://floreren.app/calendar) voor details.')
    expect(out).toContain('href="https://floreren.app/calendar"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('renders a short bullet list', () => {
    const out = html('Twee taken:\n- Water geven\n- Snoeien')
    expect(out).toContain('<ul')
    expect((out.match(/<li>/g) ?? []).length).toBe(2)
  })

  it('renders a numbered list', () => {
    const out = html('1. Vul de gieter\n2. Geef water')
    expect(out).toContain('<ol')
  })

  it('separates paragraphs on blank lines', () => {
    const out = html('Eerste alinea.\n\nTweede alinea.')
    expect((out.match(/<p/g) ?? []).length).toBe(2)
  })

  it('never injects raw HTML from the message text', () => {
    const out = html('<img src=x onerror=alert(1)>')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})

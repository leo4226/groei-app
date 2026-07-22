import type { ReactNode } from 'react'

// Stekkie's system prompt keeps replies to plain prose, short bullet/numbered
// lists, bold emphasis, and the occasional link — no tables, no headers, no
// code blocks. This renders exactly that subset as React nodes (never raw
// HTML) so nothing here can execute injected markup.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${i++}`}>{match[1]}</strong>)
    } else {
      nodes.push(
        <a
          key={`${keyPrefix}-a-${i++}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {match[2]}
        </a>
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function renderChatText(content: string): ReactNode {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let blockKey = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    const text = paragraph.join(' ')
    blocks.push(
      <p key={`p-${blockKey++}`} className="mb-1.5 last:mb-0">
        {renderInline(text, `p${blockKey}`)}
      </p>
    )
    paragraph = []
  }

  const flushList = () => {
    if (!listItems.length) return
    const items = listItems
    const key = `l-${blockKey++}`
    blocks.push(
      listType === 'ol' ? (
        <ol key={key} className="list-decimal pl-5 mb-1.5 last:mb-0 space-y-0.5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc pl-4 mb-1.5 last:mb-0 space-y-0.5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ul>
      )
    )
    listItems = []
    listType = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const ulMatch = line.match(/^[-*]\s+(.*)$/)
    const olMatch = !ulMatch ? line.match(/^\d+[.)]\s+(.*)$/) : null

    if (ulMatch || olMatch) {
      const type = ulMatch ? 'ul' : 'ol'
      if (listType && listType !== type) flushList()
      flushParagraph()
      listType = type
      listItems.push((ulMatch ?? olMatch)![1])
    } else if (line === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()

  return <>{blocks}</>
}

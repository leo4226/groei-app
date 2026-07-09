import { useState, type ReactNode } from 'react'
import { useT } from '../../context/LanguageContext'

export type SheetMode = 'care' | 'sun' | 'closed'

interface Props {
  mode: SheetMode
  attentionCount: number             // for peek label in care mode
  careContent: ReactNode             // CareNeedsList instance
  sunContent: ReactNode              // SunControls instance
  /** When true (sun-mode activates), force open on next render. */
  autoExpand: boolean
  hidden?: boolean
  /** 'global' shows cross-garden phrasing in the peek label. */
  careScope?: 'map' | 'global'
}

export default function MapBottomSheet({ mode, attentionCount, careContent, sunContent, autoExpand, hidden, careScope = 'map' }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(autoExpand)

  // Sync expanded with autoExpand transitions: opening sun = expand,
  // closing sun = collapse (per design: don't remember prior care state).
  const [prevAutoExpand, setPrevAutoExpand] = useState(autoExpand)
  if (autoExpand !== prevAutoExpand) {
    setExpanded(autoExpand)
    setPrevAutoExpand(autoExpand)
  }

  if (hidden) return null

  if (mode === 'closed') return null

  const peekLabel = mode === 'care'
    ? attentionCount === 0
      ? `✓ ${careScope === 'global' ? t.mapPage.sheetAllGoodGlobal : t.mapPage.sheetAllGood}`
      : `● ${careScope === 'global' ? t.mapPage.sheetGlobalAttention(attentionCount) : t.mapPage.sheetAttentionCount(attentionCount)}`
    : ''   // sun mode always renders expanded; no peek text

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-surface/96 border-t border-border/60 rounded-t-2xl shadow-[0_-2px_12px_rgba(0,0,0,0.06)] transition-[max-height] duration-200 ease-out overflow-hidden"
      style={{ backdropFilter: 'blur(8px)', maxHeight: expanded ? '75vh' : '54px' }}
    >
      {/* Drag handle row — click to toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Collapse' : 'Expand'}
        aria-expanded={expanded}
        className="w-full flex flex-col items-center pt-2 pb-1.5 hover:bg-bg/30 transition-colors"
      >
        <div className="w-8 md:w-10 h-[3px] rounded-sm bg-border" />
        {!expanded && peekLabel && (
          <span className="text-xs md:text-sm font-medium text-text mt-1.5">{peekLabel}</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(75vh - 32px)' }}>
          {mode === 'care' ? careContent : sunContent}
        </div>
      )}
    </div>
  )
}

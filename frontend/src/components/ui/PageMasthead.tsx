import type { ReactNode } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'

export type MastheadStat = { value: string | number; label: string }

type Props = {
  /** Mono uppercase micro-label above the title, flanked by hairlines. Desktop only. */
  eyebrow: string
  /** Main title text, serif. The trailing period is added by the component. */
  title: string
  /** Exactly one accent word/phrase, rendered italic in the primary color after the title. */
  accent?: string
  /** Serif italic intro line under the title. Desktop only. */
  lede?: string
  /** Right-aligned stat blocks: big serif number over a mono microlabel. Desktop only. */
  stats?: MastheadStat[]
  /** Action buttons (pills). Rendered right of the title on mobile, under the stats on desktop. */
  actions?: ReactNode
}

/**
 * Page masthead in the "herbarium editorial" language.
 * Visual spec: docs/plans/2026-06-12-design-language-unification.md —
 * the reference implementation is the Plants page header (Plants.tsx).
 */
export default function PageMasthead({ eyebrow, title, accent, lede, stats, actions }: Props) {
  // 720px is the editorial-layout boundary used by the reference page (Plants.tsx)
  const isMobile = useIsMobile(720)

  const heading = (
    <>
      {title}
      {accent && <> <em className="font-normal italic text-primary">{accent}</em></>}.
    </>
  )

  if (isMobile) {
    return (
      <div>
        {/* Browser-chrome spacer so the sticky header clears the URL bar */}
        <div style={{ height: 'max(env(safe-area-inset-top, 0px), 48px)' }} />
        <div className="sticky top-0 z-20 bg-bg pt-3">
          <div className="flex items-center justify-between gap-3 px-4 pb-2">
            <h1 className="m-0 font-heading text-[22px] font-medium tracking-[-0.01em] text-text">
              {heading}
            </h1>
            {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border px-6 pb-5 pt-10">
      <div className="min-w-0">
        <p className="mb-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
          <span className="h-px w-6 flex-none bg-border" />
          {eyebrow}
          <span className="h-px min-w-[24px] max-w-[80px] flex-1 bg-border" />
        </p>
        <h1 className="m-0 font-heading text-[clamp(36px,5vw,56px)] font-medium leading-[0.95] tracking-[-0.02em] text-text">
          {heading}
        </h1>
        {lede && (
          <p className="mt-2 max-w-[440px] font-heading text-[15px] italic leading-[1.5] text-text-soft">
            {lede}
          </p>
        )}
      </div>
      {(stats?.length || actions) && (
        <div className="flex items-end gap-7">
          {stats?.map((s) => (
            <div key={s.label} className="text-right">
              <span className="block font-heading text-[34px] font-medium leading-none text-primary">
                {s.value}
              </span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted">
                {s.label}
              </span>
            </div>
          ))}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
    </header>
  )
}

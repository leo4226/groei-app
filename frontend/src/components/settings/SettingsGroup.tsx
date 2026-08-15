import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Glyph from '../ui/Glyph'
import type { GlyphName } from '../ui/Glyph'

interface Props {
  /** Stable key — used for the URL hash and for remembering open state. */
  id: string
  icon: GlyphName
  title: string
  /**
   * One line describing what this group is currently set to, shown while it is
   * collapsed ("Dark · Dutch"). This is what makes a closed accordion usable:
   * you can read your whole configuration without opening anything.
   */
  summary?: ReactNode
  /** Rendered under the title when open — what this group is for. */
  description?: string
  children: ReactNode
  /** Marks admin-only groups with a quiet badge. */
  badge?: string
  defaultOpen?: boolean
}

/**
 * One collapsible settings group.
 *
 * The settings page used to render eleven sections fully expanded at once,
 * which on a phone is a single scroll with no way to find anything. Grouping
 * plus collapse means the page opens as a short, readable index.
 *
 * Deep-linking: `/settings#notifications` opens that group and scrolls to it,
 * so other parts of the app (and support answers) can point at one setting.
 */
export default function SettingsGroup({
  id,
  icon,
  title,
  summary,
  description,
  children,
  badge,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const ref = useRef<HTMLElement>(null)

  // Open (and scroll to) this group when the URL points at it. Runs on mount
  // and on hashchange so an in-app link to /settings#places works even when
  // settings is already the current page.
  useEffect(() => {
    function syncFromHash() {
      if (window.location.hash.slice(1) !== id) return
      setOpen(true)
      // Let the panel expand before scrolling, or we land short of the target.
      requestAnimationFrame(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [id])

  return (
    <section
      ref={ref}
      id={id}
      className="card overflow-hidden scroll-mt-4 transition-colors"
    >
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface/60"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              open ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
            }`}
          >
            <Glyph name={icon} size={17} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-heading text-[15px] font-bold text-text">{title}</span>
              {badge && (
                <span className="rounded-full bg-text-muted/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-text-muted">
                  {badge}
                </span>
              )}
            </span>
            {/* The summary is the whole point of collapsing: it has to stay
                readable at a glance, so it is truncated rather than wrapped. */}
            {!open && summary && (
              <span className="mt-0.5 block truncate text-xs text-text-muted">{summary}</span>
            )}
            {open && description && (
              <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
            )}
          </span>

          <span
            className={`shrink-0 text-text-muted transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          >
            <Glyph name="chevron-down" size={16} />
          </span>
        </button>
      </h2>

      {/* Unmounted rather than hidden when closed: several panels poll or hold
          large lists, and keeping eleven of them mounted is what made this page
          heavy in the first place. */}
      {open && (
        <div id={panelId} className="border-t border-border px-4 py-4">
          {children}
        </div>
      )}
    </section>
  )
}

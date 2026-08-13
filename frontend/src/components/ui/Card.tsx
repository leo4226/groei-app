import { useId, useState, type ReactNode } from 'react'
import Glyph from './Glyph'

interface CardProps {
  /** "§ I · Identiteit" */
  eyebrow?: string
  /** Title, can include <em> tags for italic emphasis */
  title?: ReactNode
  /** Subtitle below title */
  subtitle?: string
  /** Right-aligned action (link or button) */
  action?: ReactNode
  /**
   * Turn the header into a disclosure button. Opt-in: the Add Plant flow wants
   * every section open, while the edit form uses this to replace a Basis /
   * Details filter that hid whole sections behind a pill (#886 §4.4).
   */
  collapsible?: boolean
  /** Only meaningful with `collapsible`. */
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export default function Card({
  eyebrow,
  title,
  subtitle,
  action,
  collapsible = false,
  defaultOpen = true,
  children,
  className = '',
}: CardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const hasHeader = eyebrow || title || subtitle || action
  // A collapsible card with no header would have no way to reopen itself.
  const isCollapsible = collapsible && Boolean(hasHeader)
  const showBody = !isCollapsible || open

  const heading = (
    <div className="min-w-0 text-left">
      {eyebrow && (
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary-highlight mb-1">
          {eyebrow}
        </div>
      )}
      {title && (
        <h2 className="font-heading text-xl font-medium text-text leading-snug">
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-sm text-text-muted mt-1">{subtitle}</p>
      )}
    </div>
  )

  return (
    <section
      className={`bg-paper border border-border rounded-xl overflow-hidden ${className}`}
    >
      {hasHeader && (
        <div
          className={`flex items-start justify-between gap-4 px-5 pt-5 pb-3 ${
            showBody ? 'border-b border-border-soft' : ''
          }`}
        >
          {isCollapsible ? (
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              aria-expanded={open}
              aria-controls={bodyId}
              className="flex min-w-0 flex-1 items-start justify-between gap-3 bg-transparent text-left"
            >
              {heading}
              <span
                aria-hidden
                className={`mt-1 shrink-0 text-text-muted transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
              >
                <Glyph name="chevron-down" size={16} />
              </span>
            </button>
          ) : (
            heading
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {showBody && (
        <div id={bodyId} className="px-5 py-5 space-y-4">{children}</div>
      )}
    </section>
  )
}

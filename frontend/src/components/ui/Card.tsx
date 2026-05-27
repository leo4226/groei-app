import type { ReactNode } from 'react'

interface CardProps {
  /** "§ I · Identiteit" */
  eyebrow?: string
  /** Title, can include <em> tags for italic emphasis */
  title?: ReactNode
  /** Subtitle below title */
  subtitle?: string
  /** Right-aligned action (link or button) */
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function Card({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  className = '',
}: CardProps) {
  const hasHeader = eyebrow || title || subtitle || action

  return (
    <section
      className={`bg-paper border border-border rounded-xl overflow-hidden ${className}`}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-border-soft">
          <div className="min-w-0">
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
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="px-5 py-5 space-y-4">{children}</div>
    </section>
  )
}

import type { ReactNode } from 'react'

interface FormRowProps {
  /** Label text */
  label: string
  /** Muted description below label */
  description?: string
  /** Help text below the control area */
  help?: ReactNode
  children: ReactNode
}

export default function FormRow({
  label,
  description,
  help,
  children,
}: FormRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-6 py-1">
      {/* Label column */}
      <div className="sm:w-[180px] shrink-0 mb-1.5 sm:mb-0 sm:pt-1">
        <div className="font-heading text-sm font-medium text-text">
          {label}
        </div>
        {description && (
          <div className="text-xs text-text-muted mt-0.5">{description}</div>
        )}
      </div>

      {/* Control column */}
      <div className="flex-1 min-w-0">
        {children}
        {help && (
          <div className="mt-2 text-xs text-text-muted leading-relaxed">
            {help}
          </div>
        )}
      </div>
    </div>
  )
}

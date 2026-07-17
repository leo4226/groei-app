import { Link } from 'react-router-dom'
import Glyph from '../ui/Glyph'

type PassportEditLinkProps = {
  to: string
  label: string
}

/**
 * A compact passport edit affordance: its localized label stays available to
 * assistive technology and hover/touch hints without constraining the circle.
 */
export function PassportEditLink({ to, label }: PassportEditLinkProps) {
  return (
    <Link
      to={to}
      data-passport-edit-action
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-primary no-underline backdrop-blur-sm transition-colors hover:bg-surface"
    >
      <Glyph name="edit" size={17} aria-hidden />
    </Link>
  )
}

import { resolveIconUrl } from '../../utils/icons'
import Glyph from './Glyph'

/**
 * A user avatar. Avatars are stored as a plant-icon catalog key (e.g. "fern_2")
 * and rendered as the generated icon image. Legacy avatars stored as an emoji
 * string still render as text, and an empty avatar falls back to a leaf glyph —
 * so nothing breaks while households migrate off emoji.
 */
function isIconKey(value: string | null | undefined): value is string {
  // Catalog ids are ascii slugs; emoji are not.
  return !!value && /^[a-z0-9][a-z0-9_-]*$/i.test(value)
}

interface Props {
  value?: string | null
  /** Pixel size of the avatar box. */
  size?: number
  className?: string
}

export default function Avatar({ value, size = 40, className = '' }: Props) {
  if (isIconKey(value)) {
    const url = resolveIconUrl(value)
    if (url) {
      return (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className={className}
          style={{ objectFit: 'contain' }}
        />
      )
    }
  }

  if (value) {
    // Legacy emoji avatar.
    return (
      <span className={className} style={{ fontSize: Math.round(size * 0.62), lineHeight: 1 }}>
        {value}
      </span>
    )
  }

  return (
    <span className={`text-text-muted ${className}`}>
      <Glyph name="leaf" size={Math.round(size * 0.62)} />
    </span>
  )
}

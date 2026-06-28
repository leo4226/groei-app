import { useState, useEffect } from 'react'
import { resolveIconUrl } from '../../utils/icons'
import Glyph from './Glyph'

/**
 * A user avatar. Avatars are stored as a plant-icon catalog key (e.g. "fern_2")
 * and rendered as the generated icon image. Legacy avatars stored as an emoji
 * string still render as text, and an empty avatar (or a broken/missing icon)
 * falls back to a leaf glyph — so nothing breaks while households migrate.
 */
export function isIconKey(value: string | null | undefined): value is string {
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
  const [broken, setBroken] = useState(false)

  // Reset the broken flag when the avatar changes, so picking a new (valid)
  // icon after a failed load renders it instead of staying on the fallback.
  useEffect(() => { setBroken(false) }, [value])

  if (isIconKey(value) && !broken) {
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
          onError={() => setBroken(true)}
        />
      )
    }
  }

  if (value && !isIconKey(value)) {
    // Legacy emoji avatar.
    return (
      <span className={className} style={{ fontSize: Math.round(size * 0.62), lineHeight: 1 }}>
        {value}
      </span>
    )
  }

  // Empty, unresolved, or broken icon → leaf placeholder.
  return (
    <span className={`text-text-muted ${className}`}>
      <Glyph name="leaf" size={Math.round(size * 0.62)} />
    </span>
  )
}

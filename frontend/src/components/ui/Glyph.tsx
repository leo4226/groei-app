/**
 * General-purpose line glyphs for UI chrome (filters, badges, headers) — the
 * non-care counterpart to CareIcon. Same drawing language: thin stroke,
 * rounded caps, `currentColor`, 24×24 viewBox. Add a key to GLYPHS to extend.
 */
export type GlyphName =
  | 'list' | 'leaf' | 'home' | 'alert'
  | 'edit' | 'trash' | 'check' | 'x' | 'chevron-up' | 'chevron-down'
  | 'sun' | 'moon' | 'monitor'

const GLYPHS: Record<GlyphName, React.ReactNode> = {
  // all / everything — a bulleted list
  list: (
    <>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // garden / outdoor — a leaf
  leaf: (
    <>
      <path d="M5 19C5 11 9.5 6 19 5c0 9.5-4.5 14-14 14z" />
      <path d="M5.5 18.5C8.5 13 12 9.5 16 8" />
    </>
  ),
  // house / indoor — a home
  home: (
    <>
      <path d="M4 11 12 4.5 20 11" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // warning / needs action — a triangle
  alert: (
    <>
      <path d="M12 4 21 19H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  // edit — a pencil
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  // delete — a bin
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.9 12a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-12" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  check: <path d="M5 12l5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-up': <path d="M6 15l6-6 6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  // theme — sun
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  // theme — moon
  moon: <path d="M20 13.5A8 8 0 1 1 10.5 4a6.2 6.2 0 0 0 9.5 9.5z" />,
  // theme — monitor / system
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
}

interface Props extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: GlyphName
  size?: number
}

export default function Glyph({ name, size = 16, strokeWidth = 1.8, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block shrink-0"
      {...rest}
    >
      {GLYPHS[name]}
    </svg>
  )
}

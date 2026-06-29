/**
 * General-purpose line glyphs for UI chrome (filters, badges, headers) — the
 * non-care counterpart to CareIcon. Same drawing language: thin stroke,
 * rounded caps, `currentColor`, 24×24 viewBox. Add a key to GLYPHS to extend.
 */
export type GlyphName =
  | 'list' | 'leaf' | 'home' | 'alert'
  | 'edit' | 'trash' | 'check' | 'x' | 'chevron-up' | 'chevron-down'
  | 'sun' | 'moon' | 'monitor'
  | 'tree' | 'pot' | 'sprout' | 'rock' | 'wrench' | 'sparkle'
  | 'search' | 'camera' | 'book' | 'arrow-left' | 'flask' | 'pin'
  | 'droplet' | 'flower' | 'palette' | 'thermometer' | 'gamepad'
  | 'trophy' | 'clipboard' | 'link' | 'text'
  | 'chart' | 'users' | 'compass' | 'lock'

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
  // tree — canopy + trunk
  tree: (
    <>
      <path d="M12 21v-5.5" />
      <path d="M12 15.5a5.2 5.2 0 0 0 4.7-7.4A4.6 4.6 0 0 0 12 3.4a4.6 4.6 0 0 0-4.7 4.7A5.2 5.2 0 0 0 12 15.5z" />
    </>
  ),
  // pot — planter with a small sprout
  pot: (
    <>
      <path d="M6 10h12l-1.1 7.7a1.5 1.5 0 0 1-1.5 1.3H8.6a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M5 10h14" />
      <path d="M12 10V6.5" />
      <path d="M12 7.5c-1.6 0-2.8-1.2-2.8-2.9 1.7 0 2.8 1.2 2.8 2.9z" />
    </>
  ),
  // sprout — two leaves
  sprout: (
    <>
      <path d="M12 20v-7" />
      <path d="M12 14C9 14 7 12 7 9c3 0 5 2 5 5z" />
      <path d="M12 12.5C15 12.5 17 10.5 17 7.5c-3 0-5 2-5 5z" />
    </>
  ),
  // rock / hardscape — two stones
  rock: (
    <>
      <path d="M3 16l5-5 5 4 4-3 4 4v2H3z" />
      <path d="M8 11l2 5M17 12l-2 4" />
    </>
  ),
  // utility — a wrench
  wrench: (
    <path d="M15.5 4a4 4 0 0 0-4.8 5.1L4 15.8a1.6 1.6 0 0 0 2.2 2.2l6.7-6.7A4 4 0 0 0 18 9.5l-2.4 2.4-2-2L16 7.5z" />
  ),
  // sparkle — new / custom
  sparkle: <path d="M12 3.5l1.7 5.3 5.3 1.7-5.3 1.7L12 17.5l-1.7-5.3L5 10.5l5.3-1.7z" />,
  // search — magnifier
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  // camera
  camera: (
    <>
      <path d="M4 8.5h3.2l1.3-1.9h7l1.3 1.9H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  // book — database / library
  book: (
    <>
      <path d="M5 4.5h11a1.5 1.5 0 0 1 1.5 1.5v13a1 1 0 0 0-1-1H5z" />
      <path d="M5 4.5A1.5 1.5 0 0 0 3.5 6v12.5A1.5 1.5 0 0 0 5 20h11.5" />
    </>
  ),
  // arrow-left — back
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="M11 6 5 12l6 6" />
    </>
  ),
  // flask — lab / try another engine
  flask: (
    <>
      <path d="M9.5 3.5h5" />
      <path d="M10 3.5v6L5.3 17a1.6 1.6 0 0 0 1.4 2.5h10.6a1.6 1.6 0 0 0 1.4-2.5L14 9.5v-6" />
      <path d="M7.6 14h8.8" />
    </>
  ),
  // pin — map location / sighting
  pin: (
    <>
      <path d="M12 21s6-5.3 6-10.5A6 6 0 0 0 6 10.5C6 15.7 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </>
  ),
  // droplet — water / rainfall
  droplet: <path d="M12 3.5s6 6.4 6 10.6a6 6 0 1 1-12 0C6 9.9 12 3.5 12 3.5z" />,
  // flower — bloom
  flower: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 9.6c.8-2.4-.4-4.6-0-4.6s-.8 2.2 0 4.6M12 14.4c-.8 2.4.4 4.6 0 4.6s.8-2.2 0-4.6" />
      <path d="M9.6 12c-2.4.8-4.6-.4-4.6 0s2.2-.8 4.6 0M14.4 12c2.4-.8 4.6.4 4.6 0s-2.2.8-4.6 0" />
    </>
  ),
  // palette — flower colours
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-.5-.2-.8-.5-1.2-.3-.4-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a4.5 4.5 0 0 0 4.5-4.5C20.5 6.6 16.7 3.5 12 3.5z" />
      <circle cx="7.5" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  // thermometer — temperature
  thermometer: (
    <>
      <path d="M12 4.5a2 2 0 0 0-2 2v7.4a3.5 3.5 0 1 0 4 0V6.5a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="17" r="1.9" fill="currentColor" stroke="none" />
      <path d="M12 14V9.5" />
    </>
  ),
  // trophy — leaderboard winner
  trophy: (
    <>
      <path d="M8 4.5h8v4a4 4 0 0 1-8 0z" />
      <path d="M8 5.5H5.5a1 1 0 0 0-1 1c0 2.2 1.6 3.4 3.5 3.6M16 5.5h2.5a1 1 0 0 1 1 1c0 2.2-1.6 3.4-3.5 3.6" />
      <path d="M12 12.5V15" />
      <path d="M9 19.5h6M9.5 19.5l.4-2.2a1 1 0 0 1 1-.8h2.2a1 1 0 0 1 1 .8l.4 2.2" />
    </>
  ),
  // clipboard — copy / share results
  clipboard: (
    <>
      <rect x="6" y="4.5" width="12" height="16" rx="1.5" />
      <path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v1H9z" />
      <path d="M9.5 11h5M9.5 14.5h5" />
    </>
  ),
  // link — shareable url
  link: (
    <>
      <path d="M10.5 13.5a3 3 0 0 0 4.3.1l2.4-2.4a3 3 0 0 0-4.2-4.2l-1.3 1.3" />
      <path d="M13.5 10.5a3 3 0 0 0-4.3-.1l-2.4 2.4a3 3 0 0 0 4.2 4.2l1.3-1.3" />
    </>
  ),
  // text — name / typed-answer mode
  text: (
    <>
      <path d="M5 7V5.5h14V7" />
      <path d="M12 5.5V19" />
      <path d="M9.5 19h5" />
    </>
  ),
  // chart — overview / stats
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 17v-4M12 17V8M16 17v-6" />
    </>
  ),
  // users — accounts
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.4M16.5 13.5a5.5 5.5 0 0 1 4 5.5" />
    </>
  ),
  // compass — coverage / navigation
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8 13.4 13.4 8.8 15.2 10.6 10.6z" />
    </>
  ),
  // lock — audit / secure
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9" rx="1.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  // gamepad — games
  gamepad: (
    <>
      <path d="M7.5 8.5h9a4 4 0 0 1 4 4l.4 3.2a2 2 0 0 1-3.6 1.4l-1.1-1.6a2 2 0 0 0-1.6-.9H8a2 2 0 0 0-1.6.9l-1.1 1.6a2 2 0 0 1-3.6-1.4L4 12.5a4 4 0 0 1 4-4z" />
      <path d="M7 11.5v2.5M5.75 12.75h2.5" />
      <circle cx="15.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
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

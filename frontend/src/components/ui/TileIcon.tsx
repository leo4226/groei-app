/**
 * Line pictograms for the Add/Edit plant TileGrid selectors — form type, light
 * level, pot material, feeding frequency, and pruning. Same drawing language as
 * CareIcon/Glyph (thin stroke, rounded caps, currentColor). The tile title +
 * subtitle carry the meaning; these icons are the supporting visual, replacing
 * the previous emoji.
 */
export type TileIconName =
  // form / habit
  | 'form-pot' | 'form-ground' | 'form-seedling' | 'form-tree'
  // light intensity (low → high)
  | 'light-dark' | 'light-shade' | 'light-indirect' | 'light-bright' | 'light-full'
  // pot material
  | 'pot-terracotta' | 'pot-plastic' | 'pot-ceramic' | 'pot-basket'
  // feeding frequency
  | 'feed-weekly' | 'feed-monthly' | 'feed-seasonal' | 'feed-optional'
  // pruning type
  | 'prune-none' | 'prune-light' | 'prune-moderate' | 'prune-heavy'
  // pruning / feeding frequency
  | 'freq-never' | 'freq-weekly' | 'freq-monthly' | 'freq-seasonal'

const leaf = <path d="M5 19C5 11 9.5 6 19 5c0 9.5-4.5 14-14 14z" />
const calendar = (
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="1.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </>
)
const scissors = (
  <>
    <circle cx="6" cy="6.4" r="2.1" />
    <circle cx="6" cy="17.6" r="2.1" />
    <path d="M7.7 7.9 20 16M7.7 16.1 20 8" />
  </>
)

const GLYPHS: Record<TileIconName, React.ReactNode> = {
  // ── form ──
  'form-pot': (
    <>
      <path d="M6 11h12l-1.1 7.6a1.5 1.5 0 0 1-1.5 1.3H8.6a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M5 11h14" />
      <path d="M12 11V7" />
      <path d="M12 8c-1.6 0-2.8-1.2-2.8-2.9 1.7 0 2.8 1.2 2.8 2.9z" />
      <path d="M12 7.5c1.6 0 2.8-1.2 2.8-2.9-1.7 0-2.8 1.2-2.8 2.9z" />
    </>
  ),
  'form-ground': (
    <>
      <path d="M3 19h18" />
      <path d="M12 19v-6.5" />
      <path d="M12 13.5c-1.8 0-3.2-1.5-3.2-3.4 1.9 0 3.2 1.5 3.2 3.4z" />
      <path d="M12 12.5c1.8 0 3.2-1.5 3.2-3.4-1.9 0-3.2 1.5-3.2 3.4z" />
    </>
  ),
  'form-seedling': (
    <>
      <path d="M12 20v-7" />
      <path d="M12 14c-2 0-3.6-1.7-3.6-3.8 2.1 0 3.6 1.7 3.6 3.8z" />
      <path d="M12 13c2 0 3.6-1.7 3.6-3.8-2.1 0-3.6 1.7-3.6 3.8z" />
    </>
  ),
  'form-tree': (
    <>
      <path d="M12 21v-5.5" />
      <path d="M12 15.5a5 5 0 0 0 4.6-7A4.7 4.7 0 0 0 12 3.5 4.7 4.7 0 0 0 7.4 8.5 5 5 0 0 0 12 15.5z" />
    </>
  ),

  // ── light (low → high) ──
  'light-dark': <path d="M20 13.6A8 8 0 1 1 10.4 4a6.3 6.3 0 0 0 9.6 9.6z" />,
  'light-shade': (
    <path d="M7 18h9.2a3.6 3.6 0 0 0 .3-7.2 5.1 5.1 0 0 0-9.7-1.2A3.65 3.65 0 0 0 7 18z" />
  ),
  'light-indirect': (
    <>
      <path d="M15.5 5.5a3.2 3.2 0 0 1 2.8 4.6" />
      <path d="M15.5 2.6v1.4M19.6 4.4l-1 1M21.4 8.5H20" />
      <path d="M6.6 19h8.2a3.2 3.2 0 0 0 .2-6.4 4.6 4.6 0 0 0-8.7-1.1A3.3 3.3 0 0 0 6.6 19z" />
    </>
  ),
  'light-bright': (
    <>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 5.5V7M12 17v1.5M5.5 12H7M17 12h1.5M7.6 7.6l1 1M15.4 15.4l1 1M16.4 7.6l-1 1M8.6 15.4l-1 1" />
    </>
  ),
  'light-full': (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" />
    </>
  ),

  // ── pot material ──
  'pot-terracotta': (
    <>
      <path d="M4 8h16" />
      <path d="M5.4 8h13.2l-1.5 9.7a1.6 1.6 0 0 1-1.6 1.3H8.5a1.6 1.6 0 0 1-1.6-1.3z" />
    </>
  ),
  'pot-plastic': (
    <>
      <path d="M6 8h12" />
      <path d="M7 8h10l-.8 10a1.4 1.4 0 0 1-1.4 1.3H9.2A1.4 1.4 0 0 1 7.8 18z" />
    </>
  ),
  'pot-ceramic': (
    <>
      <path d="M7.5 8.5h9" />
      <path d="M8 8.5h8c1.2 3 1.4 6.2-.2 9.2A3 3 0 0 1 13 19.5h-2a3 3 0 0 1-2.8-1.8c-1.6-3-1.4-6.2-.2-9.2z" />
    </>
  ),
  'pot-basket': (
    <>
      <path d="M5 9h14l-1 9.1a1.5 1.5 0 0 1-1.5 1.3H7.5A1.5 1.5 0 0 1 6 18.1z" />
      <path d="M5 9h14" />
      <path d="M9.2 9.4 8.6 19.3M14.8 9.4l.6 9.9M12 9.4v10" />
      <path d="M5.6 13h12.8M6 16.4h12" />
    </>
  ),

  // ── feeding ──
  'feed-weekly': (
    <>
      <path d="M12 3.5S17 9 17 13a5 5 0 0 1-10 0C7 9 12 3.5 12 3.5z" />
      <path d="M12 9.5v4M10 11.5h4" />
    </>
  ),
  'feed-monthly': calendar,
  'feed-seasonal': (
    <>
      {leaf}
      <path d="M5.5 18.5C8.5 13 12 9.5 16 8" />
    </>
  ),
  'feed-optional': (
    <>
      <path d="M12 4l1.5 4.2 4.2 1.5-4.2 1.5L12 15.4l-1.5-4.2L6.3 9.7l4.2-1.5z" />
      <path d="M18 15.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
    </>
  ),

  // ── pruning type ──
  'prune-none': leaf,
  'prune-light': scissors,
  'prune-moderate': (
    <>
      {scissors}
      <path d="M20 5.5 21 4M20.5 18.5 21.6 20" />
    </>
  ),
  'prune-heavy': (
    <>
      <circle cx="5.5" cy="6.2" r="1.9" />
      <circle cx="5.5" cy="17.8" r="1.9" />
      <path d="M7.1 7.6 19.5 16M7.1 16.4 19.5 8" />
      <path d="M13 4.5l1.6 1.6M13 19.5l1.6-1.6M16.5 4.5 18.1 6.1M16.5 19.5l1.6-1.6" />
    </>
  ),

  // ── frequency ──
  'freq-never': (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 6.5 17.5 17.5" />
    </>
  ),
  'freq-weekly': (
    <>
      {calendar}
      <path d="M7 13.5h3M7 16.5h3" />
    </>
  ),
  'freq-monthly': calendar,
  'freq-seasonal': (
    <>
      {leaf}
      <path d="M5.5 18.5C8.5 13 12 9.5 16 8" />
    </>
  ),
}

interface Props extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: TileIconName
  size?: number
}

export default function TileIcon({ name, size = 22, strokeWidth = 1.7, ...rest }: Props) {
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
      {...rest}
    >
      {GLYPHS[name]}
    </svg>
  )
}

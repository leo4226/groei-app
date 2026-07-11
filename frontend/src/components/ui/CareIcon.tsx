import type { CareType } from '../../types'

/**
 * Line-style care icons, drawn to match the app's UI-control icon language
 * (thin stroke, rounded caps, currentColor) rather than emoji. One glyph per
 * care type, plus a `sprout` fallback used where a plant has no illustration.
 *
 * Renders an <svg>, so it works both in HTML and nested inside the map SVG
 * (pass x/y/size for canvas placement). Color follows `currentColor`, so a
 * badge/chip can tint it (overdue red, etc.) via its text color.
 */
export type CareIconType = CareType | 'sprout'

const GLYPHS: Record<CareIconType, React.ReactNode> = {
  water: (
    <path d="M12 3.5c0 0 6 6.4 6 10.6a6 6 0 1 1-12 0C6 9.9 12 3.5 12 3.5z" />
  ),
  fertilize: (
    <>
      <path d="M12 20v-7" />
      <path d="M12 13C9 13 7 11 7 8c3 0 5 2 5 5z" />
      <path d="M12 12C15 12 17 10 17 7c-3 0-5 2-5 5z" />
      <path d="M5.5 20h13" />
      <circle cx="9" cy="5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  mist: (
    <>
      <path d="M9 10.5h5V19a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 9 19z" />
      <path d="M9 10.5V8.5h2V7h2.5L15 8.5" />
      <circle cx="17.3" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="19" cy="4.8" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="19" cy="8.2" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  rotate: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4" />
      <path d="M13.8 4.2 17.6 6 16 9.6" />
    </>
  ),
  prune: (
    <>
      <circle cx="6" cy="6.2" r="2.2" />
      <circle cx="6" cy="17.8" r="2.2" />
      <path d="M7.7 7.7 20 16" />
      <path d="M7.7 16.3 20 8" />
      <circle cx="12.4" cy="12" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  repot: (
    <>
      <path d="M5 9.5h14" />
      <path d="M6.5 9.5l1 8.7a1.5 1.5 0 0 0 1.5 1.3h6a1.5 1.5 0 0 0 1.5-1.3l1-8.7" />
      <path d="M12 9.5V6" />
      <path d="M12 7C10 7 8.6 5.7 8.6 3.8 10.6 3.8 12 5.1 12 7z" />
      <path d="M12 6.5C14 6.5 15.4 5.2 15.4 3.3 13.4 3.3 12 4.6 12 6.5z" />
    </>
  ),
  frost_protect: (
    <>
      <path d="M12 2.8v18.4" />
      <path d="M4 7.4l16 9.2" />
      <path d="M20 7.4l-16 9.2" />
      <path d="M12 6l-1.8-1.8M12 6l1.8-1.8M12 18l-1.8 1.8M12 18l1.8 1.8" />
      <path d="M5.6 8.7l.4 2.4M5.6 8.7l2.4.4M18.4 8.7l-.4 2.4M18.4 8.7l-2.4.4M5.6 15.3l2.4-.4M5.6 15.3l.4-2.4M18.4 15.3l-2.4-.4M18.4 15.3l-.4-2.4" />
    </>
  ),
  heat_protect: (
    <>
      <path d="M12 4.5a2 2 0 0 0-2 2v7.4a3.5 3.5 0 1 0 4 0V6.5a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="17" r="1.9" fill="currentColor" stroke="none" />
      <path d="M12 14V9.5" />
    </>
  ),
  photo: (
    <>
      <path d="M4 8.5h3.2l1.3-1.9h7l1.3 1.9H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 14C9 14 6.5 12 6.5 8.5 9.5 8.5 12 10.5 12 14z" />
      <path d="M12 12.5C15 12.5 17.5 10.5 17.5 7 14.5 7 12 9 12 12.5z" />
    </>
  ),
}

interface Props extends Omit<React.SVGProps<SVGSVGElement>, 'type'> {
  type: CareIconType
  size?: number
}

export default function CareIcon({ type, size = 24, strokeWidth = 1.8, ...rest }: Props) {
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
      {GLYPHS[type] ?? GLYPHS.sprout}
    </svg>
  )
}

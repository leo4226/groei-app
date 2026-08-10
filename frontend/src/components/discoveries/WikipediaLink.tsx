import { useT } from '../../context/LanguageContext'
import { wikipediaPlantUrl } from '../../utils/plantReferenceLinks'

type Props = {
  latinName: string
  className?: string
  style?: React.CSSProperties
}

/**
 * "Read more on Wikipedia" link, shared by the discovery card and the field
 * guide entry panel.
 *
 * The arrow is an inline SVG rather than the ↗ character on purpose: U+2197
 * has emoji presentation by default on iOS, so the literal rendered as a blue
 * emoji tile next to the text instead of a subtle glyph in the link colour.
 */
export default function WikipediaLink({ latinName, className, style }: Props) {
  const t = useT()
  return (
    <a
      href={wikipediaPlantUrl(latinName, t.locale)}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={style}
    >
      {t.discovery.readOnWikipedia}
      <svg
        width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" style={{ marginLeft: 4, verticalAlign: 'baseline' }}
      >
        <path d="M7 17 17 7" />
        <path d="M9 7h8v8" />
      </svg>
    </a>
  )
}

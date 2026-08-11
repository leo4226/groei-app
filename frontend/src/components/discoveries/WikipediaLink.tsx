import { useT } from '../../context/LanguageContext'
import { wikipediaPlantUrl } from '../../utils/plantReferenceLinks'
import { useWikipediaArticle } from '../../hooks/useWikipediaArticle'

type Props = {
  latinName: string
  className?: string
  style?: React.CSSProperties
}

/**
 * "Read more on Wikipedia" link, shared by the discovery card and the field
 * guide entry panel.
 *
 * It resolves the real article first (see `useWikipediaArticle`) and names it,
 * so the reader knows what they are about to open — usually the common-name
 * article, e.g. "Madeliefje" for *Bellis perennis*. When no article exists in
 * either wiki it degrades to a Wikipedia search rather than promising an
 * article that isn't there.
 *
 * The arrow is an inline SVG rather than the ↗ character on purpose: U+2197
 * has emoji presentation by default on iOS, so the literal rendered as a blue
 * emoji tile next to the text instead of a subtle glyph in the link colour.
 * The row is an inline-flex so the arrow cannot wrap onto a line of its own —
 * it did, next to a long article title; a long title ellipsizes instead.
 */
export default function WikipediaLink({ latinName, className, style }: Props) {
  const t = useT()
  const { article, loading } = useWikipediaArticle(latinName, t.locale)

  if (loading) {
    return (
      <span className={className} style={{ ...style, opacity: 0.6 }}>
        {t.discovery.wikipediaLoading}
      </span>
    )
  }

  const href = article?.url ?? wikipediaPlantUrl(latinName, t.locale)
  const label = article
    ? t.discovery.readOnWikipediaNamed(article.title)
    : t.discovery.searchOnWikipedia

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', ...style }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
        {article?.isFallbackLanguage && (
          <span style={{ opacity: 0.7 }}> {t.discovery.wikipediaEnglishOnly}</span>
        )}
      </span>
      <svg
        width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" style={{ flex: 'none' }}
      >
        <path d="M7 17 17 7" />
        <path d="M9 7h8v8" />
      </svg>
    </a>
  )
}

import { useEffect, useState } from 'react'
import { wikipediaLanguage, wikipediaTitleCandidates } from '../utils/plantReferenceLinks'

export interface WikipediaArticle {
  /** Article title as Wikipedia knows it — often the common name ("Madeliefje"). */
  title: string
  /** Wikipedia's one-line descriptor, e.g. "soort uit het geslacht Bellis". */
  description: string | null
  url: string
  language: 'nl' | 'en'
  /** True when the reader's own wiki had nothing and we fell back to English. */
  isFallbackLanguage: boolean
}

type State = { article: WikipediaArticle | null; loading: boolean }

// Resolved lookups are stable and shared across cards; one module cache keeps
// re-opening the same entry free.
const cache = new Map<string, WikipediaArticle | null>()

/**
 * Resolves the actual Wikipedia article for a scientific name.
 *
 * The old link pointed at `Special:Search` with the raw identify name, so it
 * regularly landed on an empty search page: author citations, cultivar
 * epithets and aggregate markers never match an article title, and the Dutch
 * wiki is missing many species the English one has.
 *
 * This walks the normalised title candidates (most specific first) through the
 * reader's wiki and then English, and returns the first article that exists.
 * The REST summary endpoint follows redirects, so a scientific name resolves to
 * the article under its common-name title where the wiki uses one.
 *
 * Never throws: on any network failure the caller falls back to the search URL.
 */
export function useWikipediaArticle(latinName: string | null | undefined, locale: string): State {
  const language = wikipediaLanguage(locale)
  const key = `${language}:${latinName ?? ''}`
  const [state, setState] = useState<State>(() =>
    cache.has(key) ? { article: cache.get(key) ?? null, loading: false } : { article: null, loading: !!latinName },
  )

  useEffect(() => {
    if (!latinName) { setState({ article: null, loading: false }); return }
    if (cache.has(key)) { setState({ article: cache.get(key) ?? null, loading: false }); return }

    let cancelled = false
    setState({ article: null, loading: true })

    void (async () => {
      const candidates = wikipediaTitleCandidates(latinName)
      const languages: ('nl' | 'en')[] = language === 'en' ? ['en'] : [language, 'en']
      for (const lang of languages) {
        for (const title of candidates) {
          const article = await fetchSummary(lang, title, language)
          if (cancelled) return
          if (article) {
            cache.set(key, article)
            setState({ article, loading: false })
            return
          }
        }
      }
      if (cancelled) return
      cache.set(key, null)
      setState({ article: null, loading: false })
    })()

    return () => { cancelled = true }
  }, [key, latinName, language])

  return state
}

async function fetchSummary(
  lang: 'nl' | 'en',
  title: string,
  readerLanguage: 'nl' | 'en',
): Promise<WikipediaArticle | null> {
  try {
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    // Disambiguation pages are not an article about the plant.
    if (data.type && data.type !== 'standard') return null
    const url: string | undefined = data.content_urls?.desktop?.page
    if (!url || !data.title) return null
    return {
      title: data.title,
      description: data.description ?? null,
      url,
      language: lang,
      isFallbackLanguage: lang !== readerLanguage,
    }
  } catch {
    return null
  }
}

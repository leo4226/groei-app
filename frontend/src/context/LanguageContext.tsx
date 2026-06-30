import { createContext, useContext, useEffect } from 'react'
import { useFloreren } from '../store/useFloreren'
import { nl } from '../i18n/nl'
import { en } from '../i18n/en'
import type { Translations } from '../i18n/translations'

type Lang = 'en' | 'nl'

const LANG_KEY = 'floreren_lang'
const PACKS: Record<Lang, Translations> = { en, nl }

/** Last language we saw for the signed-in user, persisted so a cold start or a
 * backend outage still renders in the right language instead of defaulting to
 * Dutch (the user/profile request that carries `language` may be slow or fail). */
function readStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'en' || v === 'nl' ? v : null
  } catch {
    return null
  }
}

const LanguageContext = createContext<Translations>(nl)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const users = useFloreren((s) => s.users)
  const activeUserId = useFloreren((s) => s.activeUserId)
  const user = users.find((u) => u.id === activeUserId)

  // Once the backend tells us the active user's language, remember it for next
  // time. This is what makes the pre-load and backend-down screens (the maps
  // loader, the "could not load" error) honour an English profile.
  const profileLang: Lang | null = user?.language === 'en' || user?.language === 'nl'
    ? user.language
    : null
  useEffect(() => {
    if (profileLang) {
      try { localStorage.setItem(LANG_KEY, profileLang) } catch { /* private mode / quota — ignore */ }
    }
  }, [profileLang])

  // Effective language: the live profile when loaded, else the last value we
  // persisted (covers initial load + outages), else the Dutch default.
  const lang: Lang = profileLang ?? readStoredLang() ?? 'nl'
  return <LanguageContext.Provider value={PACKS[lang]}>{children}</LanguageContext.Provider>
}

export function useT(): Translations {
  return useContext(LanguageContext)
}

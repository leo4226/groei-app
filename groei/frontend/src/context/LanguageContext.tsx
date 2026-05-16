import { createContext, useContext } from 'react'
import { useFloreren } from '../store/useFloreren'
import { nl } from '../i18n/nl'
import { en } from '../i18n/en'
import type { Translations } from '../i18n/translations'

const LanguageContext = createContext<Translations>(nl)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const users = useFloreren((s) => s.users)
  const activeUserId = useFloreren((s) => s.activeUserId)
  const user = users.find((u) => u.id === activeUserId)
  const t = user?.language === 'en' ? en : nl
  return <LanguageContext.Provider value={t}>{children}</LanguageContext.Provider>
}

export function useT(): Translations {
  return useContext(LanguageContext)
}

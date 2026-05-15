     1|import { createContext, useContext } from 'react'
     2|import { useFloreren } from '../store/useFloreren'
     3|import { nl } from '../i18n/nl'
     4|import { en } from '../i18n/en'
     5|import type { Translations } from '../i18n/translations'
     6|
     7|const LanguageContext = createContext<Translations>(nl)
     8|
     9|export function LanguageProvider({ children }: { children: React.ReactNode }) {
    10|  const users = useFloreren((s) => s.users)
    11|  const activeUserId = useFloreren((s) => s.activeUserId)
    12|  const user = users.find((u) => u.id === activeUserId)
    13|  const t = user?.language === 'en' ? en : nl
    14|  return <LanguageContext.Provider value={t}>{children}</LanguageContext.Provider>
    15|}
    16|
    17|export function useT(): Translations {
    18|  return useContext(LanguageContext)
    19|}
    20|
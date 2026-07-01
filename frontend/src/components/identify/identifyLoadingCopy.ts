import type { Translations } from '../../i18n/translations'

export type IdentifyLoadingCopy = {
  title: string
  lede: string
}

export function identifyEnrichmentLoadingCopy(t: Translations): IdentifyLoadingCopy {
  return {
    title: t.identify.enriching,
    lede: t.identify.enrichingLede,
  }
}

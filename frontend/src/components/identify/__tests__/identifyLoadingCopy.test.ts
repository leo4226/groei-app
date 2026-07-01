import { describe, expect, it } from 'vitest'

import { en } from '../../../i18n/en'
import { nl } from '../../../i18n/nl'
import { identifyEnrichmentLoadingCopy } from '../identifyLoadingCopy'

describe('identifyEnrichmentLoadingCopy', () => {
  it('uses dedicated, explanatory copy for the post-selection enrichment state', () => {
    expect(identifyEnrichmentLoadingCopy(en)).toEqual({
      title: 'Preparing your plant…',
      lede: 'We are collecting the species details and getting the next screen ready.',
    })
    expect(identifyEnrichmentLoadingCopy(nl)).toEqual({
      title: 'Plant voorbereiden…',
      lede: 'We halen de soortgegevens op en zetten het volgende scherm klaar.',
    })
  })
})

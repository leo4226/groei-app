// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { PLANT_PASSPORT_ANCHORS, resolvePlantPassportAnchor } from './plantPassportLinks'

describe('resolvePlantPassportAnchor', () => {
  it('resolves only canonical Passport fragments', () => {
    const history = document.createElement('section')
    history.id = PLANT_PASSPORT_ANCHORS.careHistory
    document.body.appendChild(history)

    expect(resolvePlantPassportAnchor('#care-history')).toBe(history)
    expect(resolvePlantPassportAnchor('#unknown')).toBeNull()

    const row = document.createElement('div')
    row.id = 'care-log-88'
    document.body.appendChild(row)
    expect(resolvePlantPassportAnchor('#care-log-88')).toBe(row)

    row.remove()
    history.remove()
  })
})

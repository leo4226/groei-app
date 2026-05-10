import { describe, it, expect } from 'vitest'
import { getHaloStatus, HALO_COLORS } from '../usePlantStatus'

describe('getHaloStatus', () => {
  it('returns null when hydrated and comfortable', () => {
    expect(getHaloStatus({ care_status: 'good', temp_status: 'comfortable' })).toBeNull()
  })

  it('returns thirsty when due_today and comfortable', () => {
    expect(getHaloStatus({ care_status: 'due_today', temp_status: 'comfortable' })).toBe('thirsty')
  })

  it('returns dry when overdue and comfortable', () => {
    expect(getHaloStatus({ care_status: 'overdue', temp_status: 'comfortable' })).toBe('dry')
  })

  it('returns chilling when good water and chilling temp', () => {
    expect(getHaloStatus({ care_status: 'good', temp_status: 'chilling' })).toBe('chilling')
  })

  it('returns freezing when good water and freezing temp', () => {
    expect(getHaloStatus({ care_status: 'good', temp_status: 'freezing' })).toBe('freezing')
  })

  it('returns dry when heatstress (same orange as dry)', () => {
    expect(getHaloStatus({ care_status: 'good', temp_status: 'heatstress' })).toBe('dry')
  })

  it('freezing beats dry (severity priority)', () => {
    expect(getHaloStatus({ care_status: 'overdue', temp_status: 'freezing' })).toBe('freezing')
  })

  it('dry beats chilling', () => {
    expect(getHaloStatus({ care_status: 'overdue', temp_status: 'chilling' })).toBe('dry')
  })

  it('chilling beats thirsty', () => {
    expect(getHaloStatus({ care_status: 'due_today', temp_status: 'chilling' })).toBe('chilling')
  })

  it('handles null/undefined fields gracefully', () => {
    expect(getHaloStatus({})).toBeNull()
    expect(getHaloStatus({ care_status: undefined, temp_status: undefined })).toBeNull()
  })
})

describe('HALO_COLORS', () => {
  it('has a color for each non-null halo status', () => {
    expect(HALO_COLORS.freezing).toBe('#2544a0')
    expect(HALO_COLORS.dry).toBe('#FF7A2E')
    expect(HALO_COLORS.chilling).toBe('#24e3dc')
    expect(HALO_COLORS.thirsty).toBe('#FFC233')
  })
})

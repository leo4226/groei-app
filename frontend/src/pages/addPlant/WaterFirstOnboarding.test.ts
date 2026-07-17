import { describe, expect, it } from 'vitest'
import source from '../AddPlant.tsx?raw'

describe('Water-first Add Plant onboarding', () => {
  it('shows backend-owned Water advice without asking for or auto-selecting routines', () => {
    expect(source).toContain('waterAdviceFromThresholds')
    expect(source).toContain('careSchedules: []')
    expect(source).not.toContain('FrequencySlider')
    expect(source).not.toContain('CareRhythmOnboardingProposal')
    expect(source).not.toContain('labelFeeding')
    expect(source).not.toContain('labelPruneType')
    expect(source).not.toContain('labelPruneFreq')
  })
})

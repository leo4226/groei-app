import { describe, expect, it } from 'vitest'
import mapPageSource from './MapPage.tsx?raw'

describe('MapPage watering-round integration', () => {
  it('uses the map-scoped round without legacy household water mutations', () => {
    expect(mapPageSource).toContain('useMapWateringRound(map?.id ?? null)')
    expect(mapPageSource).toContain('completeWateringRound(completedAt, activeUserId, scheduleIds)')
    expect(mapPageSource).toContain('undoWateringRound(operationId)')
    expect(mapPageSource).not.toContain('useGardenWater')
    expect(mapPageSource).not.toContain('garden.logWater')
    expect(mapPageSource).not.toContain('garden.deleteWater')
  })

  it('refreshes map, plant, and warning care surfaces after writes', () => {
    const refreshBody = mapPageSource.match(
      /const refreshCareSurfaces = useCallback\(async \(\) => \{([\s\S]*?)\n  \},/,
    )?.[1]

    expect(refreshBody).toContain('refresh()')
    expect(refreshBody).toContain('loadPlantsStore()')
    expect(refreshBody).toContain('loadWarningSummary()')
    expect(mapPageSource).toContain('await refreshCareSurfaces()')
  })
})

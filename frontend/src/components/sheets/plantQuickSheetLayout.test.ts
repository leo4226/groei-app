import { describe, expect, it } from 'vitest'
import {
  PLANT_QUICK_SHEET_ACTIONS_CLASS,
  PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS,
  PLANT_QUICK_SHEET_BODY_CLASS,
  PLANT_QUICK_SHEET_CLASS,
  PLANT_QUICK_SHEET_DESKTOP_ONLY_ACTION_CLASS,
  PLANT_QUICK_SHEET_HEADER_CLASS,
  PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS,
  clampedPlantNameStyle,
  clampedPlantSpeciesStyle,
  plantQuickSheetBodyStyle,
} from './plantQuickSheetLayout'

describe('plant quick sheet mobile layout', () => {
  it('anchors the sheet above the app bottom navigation and safe area', () => {
    expect(PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS).toContain('4rem')
    expect(PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS).toContain('env(safe-area-inset-bottom,0px)')
    expect(PLANT_QUICK_SHEET_CLASS).toContain(PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS)
  })

  it('lets the sheet use the full bottom edge when the bottom nav is hidden in landscape mobile', () => {
    expect(PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS).toContain('max-height:500px')
    expect(PLANT_QUICK_SHEET_CLASS).toContain(PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS)
  })

  it('keeps sheet scrolling inside the sheet instead of pushing app chrome', () => {
    expect(PLANT_QUICK_SHEET_BODY_CLASS).toContain('overflow-y-auto')
    expect(PLANT_QUICK_SHEET_BODY_CLASS).toContain('overscroll-contain')
    expect(plantQuickSheetBodyStyle().paddingBottom).toContain('env(safe-area-inset-bottom,0px)')
  })

  it('uses a mobile-first header with actions on a separate two-column grid', () => {
    expect(PLANT_QUICK_SHEET_HEADER_CLASS).toContain('flex-col')
    expect(PLANT_QUICK_SHEET_ACTIONS_CLASS).toContain('grid')
    expect(PLANT_QUICK_SHEET_ACTIONS_CLASS).toContain('grid-cols-2')
    expect(PLANT_QUICK_SHEET_ACTIONS_CLASS).toContain('sm:flex')
  })

  it('hides secondary lock/close actions from the cramped mobile header', () => {
    expect(PLANT_QUICK_SHEET_DESKTOP_ONLY_ACTION_CLASS).toBe('hidden sm:block')
  })

  it('allows long plant names and Latin names to use two lines before clipping', () => {
    expect(clampedPlantNameStyle().WebkitLineClamp).toBe(2)
    expect(clampedPlantSpeciesStyle().WebkitLineClamp).toBe(2)
  })
})

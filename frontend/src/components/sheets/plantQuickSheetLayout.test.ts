import { describe, expect, it } from 'vitest'
import {
  PLANT_QUICK_SHEET_ACTIONS_CLASS,
  PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS,
  PLANT_QUICK_SHEET_BODY_CLASS,
  PLANT_QUICK_SHEET_CLASS,
  PLANT_QUICK_SHEET_DESKTOP_MIN_PX,
  PLANT_QUICK_SHEET_DESKTOP_ONLY_ACTION_CLASS,
  PLANT_QUICK_SHEET_HEADER_CLASS,
  PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS,
  clampedPlantNameStyle,
  clampedPlantSpeciesStyle,
  plantQuickSheetBodyStyle,
  plantQuickSheetStyle,
} from './plantQuickSheetLayout'
import { BOTTOM_NAV_CLEARANCE_CLASS, BOTTOM_NAV_HEIGHT_CLASS } from '../bottomNavLayout'

describe('plant quick sheet mobile layout', () => {
  it('shares one bottom-nav height token so the sheet docks without a gap', () => {
    expect(BOTTOM_NAV_HEIGHT_CLASS).toContain('var(--bottom-nav-height)')
    expect(BOTTOM_NAV_CLEARANCE_CLASS).toContain('var(--bottom-nav-height)')
    expect(PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS).toBe(BOTTOM_NAV_CLEARANCE_CLASS)
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

  it('exposes desktop console hooks while keeping the mobile-first sheet height', () => {
    expect(PLANT_QUICK_SHEET_CLASS).toContain('plant-quick-sheet')
    expect(PLANT_QUICK_SHEET_BODY_CLASS).toContain('plant-quick-sheet-body')
    expect(PLANT_QUICK_SHEET_HEADER_CLASS).toContain('plant-quick-sheet-identity')
    expect(plantQuickSheetStyle().maxHeight).toBe('var(--plant-quick-sheet-max-height)')
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

  it('flips the header at the same width as the rest of the desktop console', () => {
    expect(PLANT_QUICK_SHEET_DESKTOP_MIN_PX).toBe(1024)
    // `lg:` is Tailwind's 1024px breakpoint — the header used to use `sm:`
    // (640px) while the three-column grid waited for 1024px.
    expect(PLANT_QUICK_SHEET_HEADER_CLASS).toContain('lg:flex-row')
    expect(PLANT_QUICK_SHEET_HEADER_CLASS).not.toContain('sm:flex-row')
  })

  it('allows long plant names and Latin names to use two lines before clipping', () => {
    expect(clampedPlantNameStyle().WebkitLineClamp).toBe(2)
    expect(clampedPlantSpeciesStyle().WebkitLineClamp).toBe(2)
  })
})

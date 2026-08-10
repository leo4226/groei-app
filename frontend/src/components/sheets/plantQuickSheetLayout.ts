import type { CSSProperties } from 'react'
import { BOTTOM_NAV_CLEARANCE_CLASS } from '../bottomNavLayout'

export const PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS = BOTTOM_NAV_CLEARANCE_CLASS

export const PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS =
  '[@media(orientation:landscape)_and_(max-height:500px)]:bottom-0'

export const PLANT_QUICK_SHEET_CLASS = [
  'plant-quick-sheet fixed left-0 right-0 z-[60] bg-surface border-t border-border/60 rounded-t-2xl shadow-[0_-8px_30px_rgba(31,42,30,0.10)] animate-slide-up flex flex-col',
  PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS,
  PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS,
].join(' ')

export const PLANT_QUICK_SHEET_BODY_CLASS =
  'plant-quick-sheet-body overflow-y-auto overscroll-contain flex-1 px-5'

/**
 * Width at which the sheet becomes the three-column desktop console. It is
 * deliberately higher than the passport's own desktop threshold
 * (`PASSPORT_DESKTOP_MIN_PX`, 721px): the passport only has to reflow a page,
 * while this sheet's three columns have min-widths summing past 960px plus
 * gaps, so they need the extra room. Keep it in sync with the media query in
 * plantQuickSheet.css.
 */
export const PLANT_QUICK_SHEET_DESKTOP_MIN_PX = 1024

// One breakpoint for the whole sheet: the header used to flip to a row at
// `sm:` (640px) while every other part waited for 1024px (#878).
export const PLANT_QUICK_SHEET_HEADER_CLASS =
  'plant-quick-sheet-identity flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:gap-3'

export function plantQuickSheetBodyStyle(): CSSProperties {
  return { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom,0px))' }
}

export function plantQuickSheetStyle(): CSSProperties {
  return { maxHeight: 'var(--plant-quick-sheet-max-height)' }
}

export function clampedPlantNameStyle(): CSSProperties {
  return {
    margin: 0,
    fontFamily: 'var(--font-heading)',
    fontWeight: 600,
    fontSize: 'var(--pq-name-size, 18px)',
    lineHeight: 1.15,
    color: 'var(--color-text)',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  }
}

export function clampedPlantSpeciesStyle(): CSSProperties {
  return {
    margin: '2px 0 0',
    fontFamily: 'var(--font-heading)',
    fontStyle: 'italic',
    fontSize: 'var(--pq-species-size, 13px)',
    lineHeight: 1.2,
    color: 'var(--color-text-muted)',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  }
}

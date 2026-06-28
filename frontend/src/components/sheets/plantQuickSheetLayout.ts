import type { CSSProperties } from 'react'

export const PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS =
  'bottom-[calc(4rem+max(env(safe-area-inset-bottom,0px),4px))]'

export const PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS =
  '[@media(orientation:landscape)_and_(max-height:500px)]:bottom-0'

export const PLANT_QUICK_SHEET_CLASS = [
  'fixed left-0 right-0 z-[60] bg-surface rounded-t-2xl animate-slide-up flex flex-col',
  PLANT_QUICK_SHEET_BOTTOM_CLEARANCE_CLASS,
  PLANT_QUICK_SHEET_LANDSCAPE_BOTTOM_CLASS,
].join(' ')

export const PLANT_QUICK_SHEET_BODY_CLASS =
  'overflow-y-auto overscroll-contain flex-1 px-5'

export const PLANT_QUICK_SHEET_HEADER_CLASS =
  'flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-3'

export const PLANT_QUICK_SHEET_TITLE_ROW_CLASS =
  'flex items-start gap-3 min-w-0'

export const PLANT_QUICK_SHEET_ACTIONS_CLASS =
  'grid grid-cols-2 gap-2 self-end sm:flex sm:items-center sm:justify-end sm:gap-1.5 sm:shrink-0'

export const PLANT_QUICK_SHEET_DESKTOP_ONLY_ACTION_CLASS = 'hidden sm:block'

export function plantQuickSheetBodyStyle(): CSSProperties {
  return { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom,0px))' }
}

export function plantQuickSheetStyle(): CSSProperties {
  return { maxHeight: '85dvh' }
}

export function clampedPlantNameStyle(): CSSProperties {
  return {
    margin: 0,
    fontFamily: 'var(--font-heading)',
    fontWeight: 600,
    fontSize: 18,
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
    fontSize: 13,
    lineHeight: 1.2,
    color: 'var(--color-text-muted)',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  }
}

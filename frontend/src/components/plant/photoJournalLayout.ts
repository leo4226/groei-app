export const PHOTO_VIEWER_BOTTOM_NAV_CLEARANCE_CLASS =
  'pb-[calc(max(env(safe-area-inset-bottom,0px),4px)+5rem)]'

export const PHOTO_VIEWER_DESKTOP_PADDING_CLASS = 'sm:pb-4'

export function photoViewerControlsClassName(extra = ''): string {
  return [
    'px-4 pt-4 text-white text-sm',
    PHOTO_VIEWER_BOTTOM_NAV_CLEARANCE_CLASS,
    PHOTO_VIEWER_DESKTOP_PADDING_CLASS,
    extra,
  ].filter(Boolean).join(' ')
}

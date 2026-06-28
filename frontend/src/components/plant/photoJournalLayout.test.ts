import { describe, expect, it } from 'vitest'
import {
  PHOTO_VIEWER_BOTTOM_NAV_CLEARANCE_CLASS,
  PHOTO_VIEWER_DESKTOP_PADDING_CLASS,
  photoViewerControlsClassName,
} from './photoJournalLayout'

describe('photo journal viewer layout', () => {
  it('keeps mobile photo controls above the app bottom navigation and safe area', () => {
    expect(PHOTO_VIEWER_BOTTOM_NAV_CLEARANCE_CLASS).toContain('env(safe-area-inset-bottom,0px)')
    expect(PHOTO_VIEWER_BOTTOM_NAV_CLEARANCE_CLASS).toContain('5rem')
    expect(photoViewerControlsClassName()).toContain(PHOTO_VIEWER_BOTTOM_NAV_CLEARANCE_CLASS)
  })

  it('restores compact footer padding from the small breakpoint upward', () => {
    expect(photoViewerControlsClassName()).toContain(PHOTO_VIEWER_DESKTOP_PADDING_CLASS)
  })
})

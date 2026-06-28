import { describe, expect, it } from 'vitest'
import {
  ADMIN_OVERLAY_Z_INDEX,
  ADMIN_RESPONSIVE_STYLES,
  ADMIN_SIDEBAR_Z_INDEX,
  adminMainStyle,
  adminOverlayClassName,
  adminOverlayStyle,
  adminRootStyle,
  adminShellStyle,
} from './adminPageLayout'

describe('admin page mobile layout', () => {
  it('keeps the mobile overlay inert until the sidebar is open', () => {
    expect(ADMIN_RESPONSIVE_STYLES).toContain('[data-admin-overlay] { display: none !important; pointer-events: none !important; }')
    expect(ADMIN_RESPONSIVE_STYLES).toContain('[data-admin-overlay].open { display: block !important; pointer-events: auto !important; }')
    expect(adminOverlayClassName(false)).toBe('')
    expect(adminOverlayClassName(true)).toBe('open')
  })

  it('layers the sidebar above the overlay only when the drawer is open', () => {
    expect(ADMIN_OVERLAY_Z_INDEX).toBeLessThan(ADMIN_SIDEBAR_Z_INDEX)
    expect(adminOverlayStyle().zIndex).toBe(ADMIN_OVERLAY_Z_INDEX)
    expect(ADMIN_RESPONSIVE_STYLES).toContain(`z-index: ${ADMIN_SIDEBAR_Z_INDEX}`)
  })

  it('keeps the admin route inside an internal scroll shell', () => {
    expect(adminRootStyle().overflow).toBe('hidden')
    expect(adminRootStyle().height).toBe('100%')
    expect(adminShellStyle().overflow).toBe('hidden')
    expect(adminShellStyle().minHeight).toBe(0)
    expect(adminMainStyle().overflowY).toBe('auto')
    expect(adminMainStyle().minHeight).toBe(0)
  })

  it('reserves iOS safe areas on mobile sidebar and content', () => {
    expect(ADMIN_RESPONSIVE_STYLES).toContain('env(safe-area-inset-top, 0px)')
    expect(ADMIN_RESPONSIVE_STYLES).toContain('env(safe-area-inset-bottom, 0px)')
    expect(ADMIN_RESPONSIVE_STYLES).toContain('overscroll-behavior: contain')
  })

  it('keeps wide admin tables horizontally scrollable on narrow phones', () => {
    expect(ADMIN_RESPONSIVE_STYLES).toContain('[data-admin-table-wrap] { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }')
  })
})

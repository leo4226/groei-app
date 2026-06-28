import type { CSSProperties } from 'react'

export const ADMIN_OVERLAY_Z_INDEX = 45
export const ADMIN_SIDEBAR_Z_INDEX = 50

export const ADMIN_RESPONSIVE_STYLES = `@media (max-width: 767px) {
  [data-admin-shell] { overflow: hidden !important; }
  [data-admin-topbar] { padding: 0 12px !important; gap: 8px !important; }
  [data-admin-brand] { min-width: 0 !important; }
  [data-admin-email] { display: none !important; }
  [data-admin-sidebar] { position: fixed !important; top: calc(48px + env(safe-area-inset-top, 0px)); left: 0; bottom: 0;
    z-index: ${ADMIN_SIDEBAR_Z_INDEX}; width: min(82vw, 280px) !important; transform: translateX(-100%);
    transition: transform .2s ease; box-shadow: 4px 0 20px rgba(0,0,0,.15);
    padding-bottom: max(16px, env(safe-area-inset-bottom, 0px)) !important; }
  [data-admin-sidebar].open { transform: translateX(0) !important; }
  [data-admin-hamburger] { display: flex !important; }
  [data-admin-overlay] { display: none !important; pointer-events: none !important; }
  [data-admin-overlay].open { display: block !important; pointer-events: auto !important; }
  [data-admin-main] { padding: 16px !important; padding-bottom: max(24px, env(safe-area-inset-bottom, 0px)) !important; overflow-y: auto !important; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  [data-admin-stat-cards] { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
  [data-admin-tools-grid] { grid-template-columns: 1fr !important; }
  [data-admin-overview-cards] { grid-template-columns: 1fr !important; }
  [data-admin-health-row] { grid-template-columns: 1fr !important; gap: 6px !important; }
}
@media (min-width: 768px) {
  [data-admin-hamburger] { display: none !important; }
  [data-admin-overlay] { display: none !important; pointer-events: none !important; }
}
@media (max-width: 480px) {
  [data-admin-stat-cards] { grid-template-columns: 1fr !important; }
  [data-admin-table-wrap] { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
}
`

export function adminRootStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
    background: 'var(--color-bg)',
  }
}

export function adminOverlayClassName(open: boolean): string {
  return open ? 'open' : ''
}

export function adminOverlayStyle(): CSSProperties {
  return {
    display: 'none',
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.3)',
    zIndex: ADMIN_OVERLAY_Z_INDEX,
  }
}

export function adminHeaderStyle(): CSSProperties {
  return {
    background: 'var(--color-primary)',
    color: '#fff',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    flexShrink: 0,
  }
}

export function adminTopbarStyle(): CSSProperties {
  return {
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
  }
}

export function adminBrandStyle(): CSSProperties {
  return {
    fontFamily: 'var(--font-heading)',
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  }
}

export function adminHeaderActionsStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  }
}

export function adminShellStyle(): CSSProperties {
  return {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  }
}

export function adminSidebarStyle(): CSSProperties {
  return {
    width: 200,
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 0',
    flexShrink: 0,
    overflowY: 'auto',
  }
}

export function adminMainStyle(): CSSProperties {
  return {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 32px',
    minHeight: 0,
    WebkitOverflowScrolling: 'touch',
  }
}

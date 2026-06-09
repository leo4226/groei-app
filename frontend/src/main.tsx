import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Register service worker for PWA (prod only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}

// Recover from stale dynamic-import references after a redeploy: when an
// already-loaded chunk tries to lazy-load a sibling chunk whose hash no longer
// exists, reload to pick up the current index.html and fresh chunk graph.
// Also catch React.lazy() import() failures that vite:preloadError doesn't cover.
// After a redeploy, old index.html references stale chunk hashes -> 404 -> module-script error.
// Reload once to pick up the fresh index.html with correct chunk references.
window.addEventListener('error', (event) => {
  const msg = event.message ?? ''
  if (
    (msg.includes('Importing a module script failed') ||
     msg.includes('Failed to fetch dynamically imported module')) &&
    !sessionStorage.getItem('lazyImportReloaded')
  ) {
    sessionStorage.setItem('lazyImportReloaded', '1')
    window.location.reload()
  }
})

window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('preloadErrorReloaded')) {
    sessionStorage.setItem('preloadErrorReloaded', '1')
    window.location.reload()
  }
})

// Dev: actively unregister any stale SW and wipe caches so dev never serves
// stale prod-built chunks. (Fixes "I see the old page" after switching
// between prod build and dev server on the same host.)
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister())
  })
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
  }
}

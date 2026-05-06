const CACHE_NAME = 'groei-v1'
const PHOTO_CACHE = 'groei-photos-v1'

// App shell to precache
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
]

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== PHOTO_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API, cache-first for photos, network-first for app
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Cache-first for plant photos
  if (url.pathname.startsWith('/api/photos/')) {
    event.respondWith(
      caches.open(PHOTO_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone())
            }
            return response
          })
        })
      )
    )
    return
  }

  // Network-first for everything else
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})

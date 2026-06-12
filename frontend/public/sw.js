// Push-only service worker (#139). Deliberately NO fetch handler and NO
// caching — the previous caching SW caused stale-chunk bugs (#98) and was
// replaced by a kill-switch; this one only exists so web push works.
// The activate handler keeps the cache wipe as a safety net for any client
// still carrying old caches, but does NOT unregister.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Floreren', body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Floreren', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(url)
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})

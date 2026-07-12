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
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/maps', snooze_url: data.snooze_url || null },
  }
  // Care pushes carry a snooze_url → offer "remind me later" action buttons.
  // Use localized titles from the server payload; fall back to NL for legacy pushes.
  if (data.snooze_url) {
    options.actions = data.actions || [
      { action: 'snooze-2h', title: '⏰ 2 uur' },
      { action: 'snooze-1d', title: '🌙 Morgen' },
    ]
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Floreren', options))
})

// Map a snooze action to (duration param, confirmation copy).
const SNOOZE_ACTIONS = {
  'snooze-2h': { for: '2h', body: 'Herinnering over 2 uur ⏰' },
  'snooze-1d': { for: '1d', body: 'Herinnering morgenochtend 🌙' },
}

function getSnoozeBody(action, data) {
  // Use localized confirmation from payload if available
  if (data && data.snooze_confirm && data.snooze_confirm[action]) {
    return data.snooze_confirm[action];
  }
  return SNOOZE_ACTIONS[action]?.body || '';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const snooze = SNOOZE_ACTIONS[event.action]

  // Snooze action: POST to the token-authed endpoint and confirm — do NOT
  // open the app.
  if (snooze && data.snooze_url) {
    event.waitUntil((async () => {
      try {
        await fetch(`${data.snooze_url}&for=${snooze.for}`, { method: 'POST', keepalive: true })
      } catch {
        // Offline / failed — let the next dispatch re-notify normally.
      }
      await self.registration.showNotification('Floreren', {
        body: getSnoozeBody(event.action, data),
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'snooze-confirm',
      })
    })())
    return
  }

  // Default click (body or no action) → focus/open the app.
  const url = data.url || '/maps'
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

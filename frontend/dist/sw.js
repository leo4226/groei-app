// Kill-switch service worker — replaces the old caching SW. On install/activate,
// wipes all caches, unregisters itself, and reloads any open clients so they
// load fresh from the network.
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', async () => {
  await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  await self.registration.unregister()
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.forEach((c) => c.navigate(c.url))
})

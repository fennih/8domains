// Replaces the service worker the app registered at "/" before it moved to /app/:
// drop its caches, unregister, and reload open tabs so they pick up the new site.
// Caches of the new service worker (scope /app/) are left alone.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.includes('/app/')) await caches.delete(key)
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
    })(),
  )
})

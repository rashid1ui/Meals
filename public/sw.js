// Gym Meals push service worker. Plain JS (not TypeScript) - Next.js serves
// files under public/ as-is with no build step, and a service worker file
// must be requested as real, unbundled JS from a stable URL (/sw.js) anyway,
// so there is nothing here for a bundler to do.
//
// Deliberately minimal: this only handles Push API delivery and notification
// clicks. It does not cache pages/assets or work offline - that would be a
// separate, unrelated PWA feature this task never asked for.

self.addEventListener('push', (event) => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { title: 'Gym Meals', body: event.data.text() }
    }
  }

  const title = data.title || 'Gym Meals'
  const options = {
    body: data.body || '',
    tag: data.tag,
    data: { url: data.url || '/dashboard' }
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Focuses an already-open dashboard tab if one exists, otherwise opens a new
// one - never opens a duplicate tab for a page the user already has up.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})

/* global self, clients */
/**
 * Handler de Web Push para o service worker (importado pelo Workbox).
 * Exibe notificação nativa com som/vibração do sistema.
 */
self.addEventListener('push', (event) => {
  let data = {
    title: 'Doca Livre',
    body: 'Nova notificação',
    icon: '/icon-192.png?v=oferta5',
    badge: '/icon-192.png?v=oferta5',
    tag: 'doca-livre',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 500],
    data: { url: '/#/transportador' },
  }

  try {
    if (event.data) {
      const parsed = event.data.json()
      data = { ...data, ...parsed, data: { ...data.data, ...(parsed.data || {}) } }
    }
  } catch {
    try {
      const text = event.data?.text()
      if (text) data.body = text
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Doca Livre', {
      body: data.body,
      icon: data.icon || '/icon-192.png?v=oferta5',
      badge: data.badge || '/icon-192.png?v=oferta5',
      tag: data.tag || 'doca-livre',
      renotify: data.renotify !== false,
      requireInteraction: data.requireInteraction !== false,
      silent: false,
      vibrate: data.vibrate || [300, 120, 300, 120, 500],
      data: data.data || { url: '/#/transportador' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawUrl = (event.notification.data && event.notification.data.url) || '/#/transportador'
  const target = new URL(rawUrl, self.location.origin).href

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target)
            } catch {
              /* ignore */
            }
          }
          return
        }
      }
      if (clients.openWindow) await clients.openWindow(target)
    })(),
  )
})

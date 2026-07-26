/* global self, clients */
/**
 * Handler de Web Push para o service worker (importado pelo Workbox).
 * Exibe notificação nativa com som/vibração do sistema.
 */
self.addEventListener('push', (event) => {
  const origin = self.location.origin
  // icon = preview colorido; badge = silhueta branca (Android status bar)
  const defaultIcon = `${origin}/icon-192.png?v=oferta6`
  const defaultBadge = `${origin}/badge-96.png?v=oferta6`

  let data = {
    title: 'Doca Livre',
    body: 'Nova notificação',
    icon: defaultIcon,
    badge: defaultBadge,
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

  const abs = (url, fallback) => {
    if (!url) return fallback
    try {
      return new URL(url, origin).href
    } catch {
      return fallback
    }
  }

  // Se o payload ainda manda a logo colorida no badge, força o monocromático
  let badgeUrl = abs(data.badge, defaultBadge)
  if (/icon-192|favicon|logo-doca/i.test(badgeUrl)) badgeUrl = defaultBadge

  event.waitUntil(
    self.registration.showNotification(data.title || 'Doca Livre', {
      body: data.body,
      icon: abs(data.icon, defaultIcon),
      badge: badgeUrl,
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

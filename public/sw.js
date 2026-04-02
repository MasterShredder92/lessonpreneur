// Lessonpreneur Service Worker v3
// Network-first. Only cache static assets (JS/CSS/images) as offline fallback.
// NEVER cache index.html or API calls.

const CACHE_NAME = 'lessonpreneur-v3'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/offline.html']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Clean ALL old caches (including v2)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Listen for cache-clear messages (sent on logout)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      caches.open(CACHE_NAME).then((cache) => cache.addAll(['/offline.html']))
    })
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept: API calls, Supabase, auth, non-GET
  if (
    request.method !== 'GET' ||
    url.hostname !== self.location.hostname ||
    request.url.includes('/rest/') ||
    request.url.includes('/functions/') ||
    request.url.includes('supabase') ||
    request.url.includes('/auth/')
  ) {
    return
  }

  // NEVER cache HTML (index.html, navigation requests) — always go to network
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html').then((r) => r || new Response('Offline', { status: 503 })))
    )
    return
  }

  // Static assets only (JS, CSS, images, fonts) — network-first with cache fallback
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot)(\?.*)?$/.test(url.pathname)
  if (!isStaticAsset) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || new Response('', { status: 503 })))
  )
})

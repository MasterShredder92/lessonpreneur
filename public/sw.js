// Lessonpreneur Service Worker v2
// Network-first for everything. Cache only as offline fallback.

const CACHE_NAME = 'lessonpreneur-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/offline.html']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Clean old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never intercept API/Supabase calls
  if (request.url.includes('/rest/') || request.url.includes('/functions/') || request.url.includes('supabase')) {
    return
  }

  // Network-first for everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for offline fallback
        if (response.ok && request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline: try cache, then offline page for navigation
        return caches.match(request).then((cached) => {
          if (cached) return cached
          if (request.mode === 'navigate') return caches.match('/offline.html')
          return new Response('', { status: 503 })
        })
      })
  )
})

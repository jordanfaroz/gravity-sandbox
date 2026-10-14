// Offline app shell, hand-written rather than generated — no build step
// produces this file, so it can't be handed a precomputed list of hashed
// `_next/static/*` filenames (they change every build). Instead, at install
// time it fetches '/' itself and scrapes the script/style URLs straight out
// of that build's own HTML, so the exact chunks the current deploy needs get
// cached without ever hardcoding a filename.
//
// The URL fragment (the shared-scene hash) is never part of a fetch request
// — browsers strip it before sending — so this never sees or touches it;
// restoring a shared scene is entirely a client-side concern after the
// cached/fetched HTML loads.
const CACHE_NAME = 'nbody-shell-v2'
const CORE_ASSETS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

async function precacheShell(cache) {
  try {
    const res = await fetch('/')
    const html = await res.text()
    await cache.put('/', new Response(html, { headers: res.headers }))
    const urls = new Set()
    for (const m of html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)) urls.add(m[1])
    await Promise.all(
      [...urls].map(u => fetch(u).then(r => { if (r.ok) return cache.put(u, r) }).catch(() => {}))
    )
  } catch {
    // Best-effort — the runtime cache-as-you-go in the fetch handler below
    // still fills in whatever this missed on the next successful fetch.
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(CORE_ASSETS).catch(() => {})
      await precacheShell(cache)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {})
          }
          return response
        })
        .catch(() => {
          if (cached) return cached
          // Only a navigation falls back to the cached shell; a missing
          // script or stylesheet should fail normally rather than receive
          // the shell's HTML in its place (it would fail to parse anyway).
          return request.mode === 'navigate' ? caches.match('/') : Response.error()
        })
      return cached || network
    })
  )
})

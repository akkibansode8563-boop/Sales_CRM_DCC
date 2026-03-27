// ═══════════════════════════════════════════════
// DCC SalesForce — Service Worker v11
// Strategy: Cache-first for assets, Network-first for API
// ═══════════════════════════════════════════════

const APP_CACHE    = 'dcc-app-v11'
const MAP_CACHE    = 'dcc-maps-v4'
const FONT_CACHE   = 'dcc-fonts-v2'

// Assets that should be cached on install
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// ── Install: precache shell ──────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())   // activate immediately
  )
})

// ── Activate: delete old caches ─────────────────
self.addEventListener('activate', e => {
  const KEEP = [APP_CACHE, MAP_CACHE, FONT_CACHE]
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())  // take control immediately
  )
})

// ── Fetch: smart routing ─────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Skip non-GET, chrome-extension, supabase API calls
  if (request.method !== 'GET') return
  if (url.protocol === 'chrome-extension:') return
  if (url.hostname.includes('supabase')) return
  if (url.hostname.includes('nominatim.openstreetmap.org')) return

  // Map tiles — Cache first (tiles rarely change)
  if (url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(cacheFirst(request, MAP_CACHE, 7 * 24 * 60 * 60))
    return
  }

  // Google Fonts — Cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(request, FONT_CACHE, 30 * 24 * 60 * 60))
    return
  }

  // JS/CSS/image assets (content-hashed filenames) — Cache first, very long TTL
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(cacheFirst(request, APP_CACHE, 365 * 24 * 60 * 60))
    return
  }

  // App shell (HTML, manifest, icons) — Stale-while-revalidate
  if (url.hostname === self.location.hostname) {
    e.respondWith(staleWhileRevalidate(request, APP_CACHE))
    return
  }
})

// ── Cache strategies ─────────────────────────────

async function cacheFirst(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    // Check if still fresh
    const dateHeader = cached.headers.get('date')
    if (dateHeader) {
      const age = (Date.now() - new Date(dateHeader).getTime()) / 1000
      if (age < maxAgeSeconds) return cached
    } else {
      return cached  // No date header — trust it's fresh
    }
  }
  try {
    const response = await fetch(request)
    if (response.ok) {
      const clone = response.clone()
      cache.put(request, clone)
    }
    return response
  } catch {
    return cached || new Response('Offline', { status: 503 })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  // Fetch in background regardless
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)
  // Return cached immediately, or wait for network
  return cached || networkPromise || caches.match('/offline.html')
}

// ── Message: force refresh ───────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  }
})

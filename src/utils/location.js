const CACHE_STORAGE_KEY = 'dcc_geo_cache_v1'
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7
const REQUEST_TIMEOUT_MS = 5000
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 7000,
  maximumAge: 30000,
}

const memoryCache = new Map()

function roundCoord(value) {
  return Number(value).toFixed(4)
}

function buildCacheKey(lat, lng) {
  return `${roundCoord(lat)},${roundCoord(lng)}`
}

function formatCoords(lat, lng) {
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`
}

function loadPersistedCache() {
  if (typeof window === 'undefined') return
  if (memoryCache.size > 0) return

  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    Object.entries(parsed).forEach(([key, entry]) => {
      if (entry?.value && entry?.timestamp) {
        memoryCache.set(key, entry)
      }
    })
  } catch {}
}

function persistCache() {
  if (typeof window === 'undefined') return

  try {
    const serialized = {}
    memoryCache.forEach((entry, key) => {
      if (Date.now() - entry.timestamp <= CACHE_MAX_AGE_MS) {
        serialized[key] = entry
      }
    })
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(serialized))
  } catch {}
}

function getCachedAddress(lat, lng) {
  loadPersistedCache()
  const key = buildCacheKey(lat, lng)
  const cached = memoryCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_MAX_AGE_MS) {
    memoryCache.delete(key)
    persistCache()
    return null
  }
  return cached.value
}

function setCachedAddress(lat, lng, value) {
  const key = buildCacheKey(lat, lng)
  memoryCache.set(key, { value, timestamp: Date.now() })
  persistCache()
}

function shortenAddress(payload) {
  const address = payload?.address || {}
  const parts = [
    address.road,
    address.suburb || address.neighbourhood || address.village,
    address.city || address.town || address.county,
    address.state,
  ].filter(Boolean)

  if (parts.length > 0) {
    return parts.slice(0, 3).join(', ')
  }

  return payload?.display_name?.split(',').slice(0, 3).join(', ') || ''
}

export async function reverseGeocodeCached(lat, lng) {
  if (lat == null || lng == null) return ''

  const cached = getCachedAddress(lat, lng)
  if (cached) return cached

  const fallback = formatCoords(lat, lng)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      {
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      }
    )
    const payload = await response.json()
    const value = shortenAddress(payload) || fallback
    setCachedAddress(lat, lng, value)
    return value
  } catch {
    return fallback
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId)
    }
  }
}

export function getLocationFallback(lat, lng) {
  if (lat == null || lng == null) return ''
  return formatCoords(lat, lng)
}

export async function getCurrentPosition(options = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => resolve(null),
      { ...GEOLOCATION_OPTIONS, ...options }
    )
  })
}

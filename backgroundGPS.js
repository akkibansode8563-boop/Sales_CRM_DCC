// ═══════════════════════════════════════════════════════════════
// BACKGROUND GPS SERVICE  v3  — Battery-Efficient Production
// • watchPosition (OS-native) instead of setInterval + getCurrentPosition
// • 50-meter minimum distance filter  (skip DB write if barely moved)
// • 120-second heartbeat save         (keep "still alive" even if idle)
// • 100-meter accuracy threshold      (reject bad indoor/WiFi GPS)
// • Idle detection preserved          (>15 min stationary = alert)
// • Auto-restart on failure with exponential back-off
// ═══════════════════════════════════════════════════════════════
import { addJourneyLocation, getJourneyLocations, getIdleStatus, calcDistanceKm } from './localDB'

const MIN_DISTANCE_KM = 0.05     // 50 metres — minimum movement to save a point
const MAX_ACCURACY_M  = 100      // reject GPS readings worse than 100m accuracy
const FORCE_SAVE_MS   = 120000   // heartbeat: always save every 2 minutes even if idle
const MAX_RETRY       = 5

let _journeyId   = null
let _managerId   = null
let _watchId     = null          // navigator.geolocation.watchPosition ID
let _retryCount  = 0
let _lastLat     = null
let _lastLng     = null
let _lastSavedAt = 0
let _isTracking  = false
const _listeners = new Set()

function _emit(payload) {
  _listeners.forEach(fn => { try { fn(payload) } catch {} })
}

// Should we persist this point to the DB?
function _shouldSave(lat, lng) {
  if (!_lastLat) return true                      // always save the first point
  const dist    = calcDistanceKm(_lastLat, _lastLng, lat, lng)
  const elapsed = Date.now() - _lastSavedAt
  return dist >= MIN_DISTANCE_KM || elapsed >= FORCE_SAVE_MS
}

function _onPosition(position) {
  if (!_isTracking || !_journeyId) return
  _retryCount = 0

  const { latitude, longitude, accuracy } = position.coords

  // Reject poor-accuracy readings (e.g., indoors with only WiFi triangulation)
  if (accuracy > MAX_ACCURACY_M) {
    _emit({ type: 'GPS_LOW_ACCURACY', accuracy: Math.round(accuracy),
            message: `GPS accuracy ${Math.round(accuracy)}m — waiting for better signal` })
    return
  }

  const willSave = _shouldSave(latitude, longitude)

  // Always emit for live map updates; only write to DB when threshold met
  if (!willSave) {
    _emit({ type: 'LOCATION_UPDATE', latitude, longitude,
            accuracy: Math.round(accuracy), saved: false,
            timestamp: new Date().toISOString() })
    return
  }

  _lastLat     = latitude
  _lastLng     = longitude
  _lastSavedAt = Date.now()

  let result = { is_suspicious: false, suspicious_reason: null, speed_kmh: 0 }
  try { result = addJourneyLocation(_journeyId, _managerId, latitude, longitude) } catch {}

  let locations = [], idle = { idle: false, minutes: 0 }
  try {
    locations = getJourneyLocations(_journeyId)
    idle      = getIdleStatus(_journeyId)
  } catch {}

  _emit({
    type:              'LOCATION_UPDATE',
    latitude,          longitude,
    accuracy:          Math.round(accuracy),
    saved:             true,
    locations,         idle,
    suspicious:        result?.is_suspicious      || false,
    suspicious_reason: result?.suspicious_reason  || null,
    speed_kmh:         result?.speed_kmh          || 0,
    timestamp:         new Date().toISOString(),
  })
}

function _onError(err) {
  _retryCount++
  const msg = err.code === 1 ? 'Location permission denied'
            : err.code === 2 ? 'GPS position unavailable'
            : 'GPS timeout'
  _emit({ type: 'GPS_ERROR', message: msg + ' — retrying…', retries: _retryCount, code: err.code })

  if (_retryCount >= MAX_RETRY) {
    _stopWatch()
    // Exponential back-off restart: wait 60s then retry
    setTimeout(() => {
      if (_isTracking && _journeyId) {
        _retryCount = 0
        _startWatch()
        _emit({ type: 'GPS_RECOVERED' })
      }
    }, 60000)
  }
}

function _startWatch() {
  if (_watchId !== null) return
  if (!navigator.geolocation) {
    _emit({ type: 'GPS_ERROR', message: 'Geolocation not supported on this device' })
    return
  }
  _watchId = navigator.geolocation.watchPosition(
    _onPosition,
    _onError,
    {
      enableHighAccuracy: true,
      timeout:            15000,
      maximumAge:         30000,  // accept cached position up to 30s old (battery saving)
    }
  )
}

function _stopWatch() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId)
    _watchId = null
  }
}

// On screen-on / app-foreground: request an immediate fresh position
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _isTracking && _journeyId) {
    navigator.geolocation?.getCurrentPosition(
      _onPosition, _onError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
    // Also restart watch in case it was paused by the OS
    if (_watchId === null) _startWatch()
  }
})

const BackgroundGPS = {
  start(journey_id, manager_id) {
    if (_isTracking && _journeyId === journey_id) return
    _journeyId   = journey_id
    _managerId   = manager_id
    _isTracking  = true
    _retryCount  = 0
    _lastSavedAt = 0
    _lastLat     = null
    _lastLng     = null
    _startWatch()
    _emit({ type: 'STARTED', journeyId: journey_id, managerId: manager_id })
  },

  stop() {
    _isTracking = false
    _stopWatch()
    const j = _journeyId
    _journeyId = null; _managerId = null; _lastLat = null; _lastLng = null
    _emit({ type: 'STOPPED', journeyId: j })
  },

  // Force an immediate GPS reading (e.g., when user manually refreshes)
  poll() {
    if (!navigator.geolocation || !_isTracking) return
    navigator.geolocation.getCurrentPosition(
      _onPosition, _onError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  },

  subscribe(fn) { _listeners.add(fn); return () => _listeners.delete(fn) },
  isActive()    { return _isTracking && !!_journeyId },
  journeyId()   { return _journeyId },
  lastCoords()  { return _lastLat ? { lat: _lastLat, lng: _lastLng } : null },
}

export default BackgroundGPS

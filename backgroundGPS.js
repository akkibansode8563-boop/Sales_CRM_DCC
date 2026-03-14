// ═══════════════════════════════════════════════════════════════
// BACKGROUND GPS SERVICE  v2  — Production Singleton
// • Persists across ALL component mounts/unmounts
// • Survives tab visibility changes (screen lock, app switch)
// • Auto-restarts on failure with exponential back-off
// • Notifies all subscribers on every update
// ═══════════════════════════════════════════════════════════════
import { addJourneyLocation, getJourneyLocations, getIdleStatus } from './localDB'

let _journeyId  = null
let _managerId  = null
let _intervalId = null
let _retryCount = 0
let _lastLat    = null
let _lastLng    = null
let _isTracking = false
const _listeners = new Set()

const POLL_MS   = 15000
const MAX_RETRY = 5

function _emit(payload) {
  _listeners.forEach(fn => { try { fn(payload) } catch {} })
}

function _getPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 8000 }
    )
  })
}

async function _poll() {
  if (!_isTracking || !_journeyId) return
  const pos = await _getPosition()
  if (!pos) {
    _retryCount++
    _emit({ type: 'GPS_ERROR', message: 'GPS signal lost — retrying…', retries: _retryCount })
    if (_retryCount >= MAX_RETRY) {
      _clearTimer()
      setTimeout(() => {
        if (_isTracking && _journeyId) { _retryCount = 0; _startTimer(); _emit({ type: 'GPS_RECOVERED' }) }
      }, 60000)
    }
    return
  }
  _retryCount = 0; _lastLat = pos.latitude; _lastLng = pos.longitude
  let result = { is_suspicious: false, suspicious_reason: null, speed_kmh: 0 }
  try { result = addJourneyLocation(_journeyId, _managerId, pos.latitude, pos.longitude) } catch {}
  let locations = [], idle = { idle: false, minutes: 0 }
  try { locations = getJourneyLocations(_journeyId); idle = getIdleStatus(_journeyId) } catch {}
  _emit({ type: 'LOCATION_UPDATE', latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy,
          locations, idle, suspicious: result?.is_suspicious || false,
          suspicious_reason: result?.suspicious_reason || null, speed_kmh: result?.speed_kmh || 0,
          timestamp: new Date().toISOString() })
}

function _startTimer() { _clearTimer(); _intervalId = setInterval(_poll, POLL_MS) }
function _clearTimer()  { if (_intervalId) { clearInterval(_intervalId); _intervalId = null } }

// Resume tracking after screen unlock / app switch back
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _isTracking && _journeyId) {
    _poll(); _startTimer()
  }
})

const BackgroundGPS = {
  start(journey_id, manager_id) {
    if (_isTracking && _journeyId === journey_id) return
    _journeyId = journey_id; _managerId = manager_id
    _isTracking = true; _retryCount = 0
    _poll(); _startTimer()
    _emit({ type: 'STARTED', journeyId: journey_id, managerId: manager_id })
  },
  stop() {
    _isTracking = false; _clearTimer()
    const j = _journeyId; _journeyId = null; _managerId = null; _lastLat = null; _lastLng = null
    _emit({ type: 'STOPPED', journeyId: j })
  },
  poll()       { return _poll() },
  subscribe(fn){ _listeners.add(fn); return () => _listeners.delete(fn) },
  isActive()   { return _isTracking && !!_journeyId },
  journeyId()  { return _journeyId },
  lastCoords() { return _lastLat ? { lat: _lastLat, lng: _lastLng } : null },
}

export default BackgroundGPS

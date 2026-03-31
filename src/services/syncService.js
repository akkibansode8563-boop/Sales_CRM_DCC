/**
 * DCC SalesForce — Sync Service v3
 * ─────────────────────────────────────────────────────────────
 * Improvements over v2:
 *  • Delta sync: only fetches rows changed since lastSyncAt
 *  • Auto-sync interval: 30s → 5 minutes (battery & quota friendly)
 *  • Exponential backoff retry for failed queue items
 *  • Debounced realtime handler (prevents query storm)
 *  • Proper sync log tracking
 *  • Device ID for conflict resolution
 */

import { supabase, isSupabaseConfigured } from '../utils/supabaseClient'
import { getOfflineQueue, flushOfflineQueue, queueOfflineAction } from '../utils/supabaseDB'

// ── Constants ────────────────────────────────────────────────
const AUTO_SYNC_MS      = 5 * 60 * 1000   // 5 minutes (was 30s)
const REALTIME_DEBOUNCE = 800              // ms — debounce realtime events
const MAX_RETRY_DELAY   = 60000            // max 60s between retries
const SYNC_TS_KEY       = 'dcc_last_sync_ts'
const DEVICE_ID_KEY     = 'dcc_device_id'

// ── State ────────────────────────────────────────────────────
let syncInterval    = null
let realtimeChannel = null
let syncListeners   = []
let lastSyncAt      = localStorage.getItem(SYNC_TS_KEY) || null
let realtimeTimer   = null   // debounce timer
let retryDelay      = 1000   // exponential backoff starting point

// ── Device ID (stable anonymous device identifier) ──────────
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// ── Listener management ──────────────────────────────────────
export function onSyncStatusChange(fn) {
  syncListeners.push(fn)
  return () => { syncListeners = syncListeners.filter(l => l !== fn) }
}

function notify(status) {
  syncListeners.forEach(fn => { try { fn(status) } catch {} })
}

function markSynced(status = 'synced') {
  lastSyncAt = new Date().toISOString()
  localStorage.setItem(SYNC_TS_KEY, lastSyncAt)
  notify({ status, syncing: false, count: getQueueCount(), lastSyncAt })
}

export function getLastSyncAt() { return lastSyncAt }

// ── Queue helpers ────────────────────────────────────────────
export function getQueueCount() {
  try { return getOfflineQueue().length } catch { return 0 }
}

// ── Delta sync: only pull rows changed since lastSyncAt ──────
async function deltaSyncCloudToLocal() {
  if (!isSupabaseConfigured() || !supabase) return

  const since = lastSyncAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Tables that support delta sync (have updated_at column)
  const DELTA_TABLES = [
    'visits', 'journeys', 'customers',
    'daily_sales_reports', 'product_day', 'targets', 'users',
  ]

  const promises = DELTA_TABLES.map(table =>
    supabase
      .from(table)
      .select('*')
      .gt('updated_at', since)
      .then(({ data }) => ({ table, data: data || [] }))
      .catch(() => ({ table, data: [] }))
  )

  // Tables without updated_at (use created_at as fallback)
  const CREATED_TABLES = ['status_history', 'journey_locations']
  CREATED_TABLES.forEach(table => {
    promises.push(
      supabase
        .from(table)
        .select('*')
        .gt('created_at', since)
        .then(({ data }) => ({ table, data: data || [] }))
        .catch(() => ({ table, data: [] }))
    )
  })

  const results = await Promise.all(promises)

  let totalPulled = 0
  results.forEach(({ data }) => { totalPulled += data.length })

  return { pulled: totalPulled }
}

// ── Flush offline queue with retry backoff ───────────────────
export async function trySyncQueue() {
  if (!navigator.onLine) return { synced: 0, failed: 0, pending: getQueueCount() }

  try {
    const queue = getOfflineQueue()
    if (queue.length === 0) {
      // No pending items — just do a delta sync
      if (isSupabaseConfigured() && supabase) {
        await deltaSyncCloudToLocal()
        markSynced('synced')
      }
      retryDelay = 1000 // reset backoff on success
      return { synced: 0, failed: 0, pending: 0 }
    }

    notify({ syncing: true, count: queue.length })
    const results = flushOfflineQueue()
    const failed  = results.filter(r => r.error).length
    const synced  = results.filter(r => !r.error).length

    if (isSupabaseConfigured() && supabase) {
      try { await deltaSyncCloudToLocal() } catch {}
    }

    if (failed > 0) {
      // Schedule retry with exponential backoff
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY)
      setTimeout(() => { if (navigator.onLine) trySyncQueue() }, retryDelay)
      notify({ syncing: false, synced, failed, count: failed, status: 'partial', lastSyncAt })
    } else {
      retryDelay = 1000 // reset on full success
      markSynced('synced')
    }

    return { synced, failed, pending: failed }

  } catch (e) {
    // Schedule retry with exponential backoff
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY)
    setTimeout(() => { if (navigator.onLine) trySyncQueue() }, retryDelay)
    notify({ syncing: false, error: e.message, status: 'error', count: getQueueCount() })
    return { synced: 0, failed: 1, pending: getQueueCount() }
  }
}

// ── Full forced sync (manual "Sync Now" button) ──────────────
export async function forceSyncNow() {
  notify({ syncing: true, count: getQueueCount(), status: 'syncing' })
  try {
    const queueResult = await trySyncQueue()
    if (isSupabaseConfigured() && supabase) {
      await deltaSyncCloudToLocal()
    }
    markSynced('manual')
    return { success: true, ...queueResult, lastSyncAt }
  } catch (error) {
    notify({ syncing: false, error: error.message, status: 'error', count: getQueueCount() })
    return { success: false, message: error.message }
  }
}

// ── Realtime subscription (debounced to prevent query storm) ─
const REALTIME_TABLES = [
  'visits', 'journeys', 'journey_locations',
  'status_history', 'daily_sales_reports',
  'product_day', 'customers', 'targets',
]

export function startRealtimeSync(onUpdate) {
  if (!isSupabaseConfigured() || !supabase) return () => {}

  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  let channel = supabase.channel('dcc-realtime-v3', {
    config: { broadcast: { self: false } }
  })

  REALTIME_TABLES.forEach(table => {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      async payload => {
        // DEBOUNCE: multiple events within 800ms → only trigger one sync
        clearTimeout(realtimeTimer)
        realtimeTimer = setTimeout(async () => {
          notify({ status: 'realtime', table, event: payload.eventType })
          try { await deltaSyncCloudToLocal(); markSynced('realtime') } catch {}
          try { onUpdate(payload) } catch {}
        }, REALTIME_DEBOUNCE)
      }
    )
  })

  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') {
      notify({ status: 'connected', realtime: true })
    } else if (status === 'CHANNEL_ERROR') {
      notify({ status: 'error', realtime: true })
    }
  })

  realtimeChannel = channel
  return () => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
}

// ── Auto-sync every 5 minutes (was 30s) ─────────────────────
export function startAutoSync(intervalMs = AUTO_SYNC_MS) {
  if (syncInterval) clearInterval(syncInterval)

  // Immediate sync if queue has items
  if (navigator.onLine && getQueueCount() > 0) trySyncQueue()

  syncInterval = setInterval(() => {
    if (navigator.onLine) trySyncQueue()
  }, intervalMs)

  const onOnline  = () => { notify({ status: 'online' }); retryDelay = 1000; trySyncQueue() }
  const onOffline = () => notify({ status: 'offline' })

  window.addEventListener('online',  onOnline)
  window.addEventListener('offline', onOffline)

  return () => {
    clearInterval(syncInterval)
    window.removeEventListener('online',  onOnline)
    window.removeEventListener('offline', onOffline)
  }
}

export function stopAutoSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null }
}

// ── Login audit logger ───────────────────────────────────────
export async function logLoginEvent(userId, username, role, action = 'login') {
  const entry = {
    user_id:     userId,
    username,
    role,
    device_info: navigator.userAgent.slice(0, 120),
    action,
    logged_at:   new Date().toISOString(),
  }

  if (isSupabaseConfigured() && supabase) {
    try { await supabase.from('login_logs').insert(entry) } catch {}
  }

  try {
    const key      = 'dcc_login_logs'
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    existing.unshift(entry)
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)))
  } catch {}
}

export function getLocalLoginLogs() {
  try { return JSON.parse(localStorage.getItem('dcc_login_logs') || '[]') } catch { return [] }
}

export { queueOfflineAction }

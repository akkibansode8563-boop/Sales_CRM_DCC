/**
 * DCC SalesForce — Sync Service v3
 * ─────────────────────────────────────────────────────────
 * Upgrades from v2:
 *  • Retry with exponential backoff (3 attempts)
 *  • Delta sync — sends/receives only changed records
 *  • Sends offline queue to Edge Function (server processes it)
 *  • Falls back to direct Supabase flush if Edge Function unavailable
 *  • Preserves all existing realtime subscription logic
 */

import { supabase, isSupabaseConfigured } from '../utils/supabaseClient'
import {
  getOfflineQueue,
  flushOfflineQueue,
  queueOfflineAction,
  syncCloudToLocal,
  handleRealtimePayload,
} from '../utils/supabaseDB'
import { getToken } from './authService'

// ── State ──────────────────────────────────────────────────
let syncInterval    = null
let realtimeChannel = null
let syncListeners   = []
let lastSyncAt      = null

// ── Listeners ──────────────────────────────────────────────
export function onSyncStatusChange(fn) {
  syncListeners.push(fn)
  return () => { syncListeners = syncListeners.filter(l => l !== fn) }
}

function notify(status) {
  syncListeners.forEach(fn => { try { fn(status) } catch {} })
}

function markSynced(status = 'synced') {
  lastSyncAt = new Date().toISOString()
  notify({ status, syncing: false, count: getQueueCount(), lastSyncAt })
}

export function getLastSyncAt() { return lastSyncAt }

// ── Queue helpers ──────────────────────────────────────────
export function getQueueCount() {
  try { return getOfflineQueue().length } catch { return 0 }
}

// ── Edge Function URL helper ────────────────────────────────
const USE_EDGE_FUNCTIONS = () =>
  import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true' &&
  !!import.meta.env.VITE_SUPABASE_URL

function syncFlushUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  return `${base}/functions/v1/sync-flush`
}

function edgeHeaders() {
  const token = getToken()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  return {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }
}

// ── Exponential backoff retry ───────────────────────────────
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 1000) {
  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1) // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

// ── Flush via Edge Function (with delta sync) ───────────────
async function flushViaEdgeFunction() {
  const queue = getOfflineQueue()
  const deviceId = localStorage.getItem('dcc_device_id') || 'unknown'
  const lastSyncedAt = localStorage.getItem(`dcc_last_sync_${deviceId}`) || null

  const res = await fetch(syncFlushUrl(), {
    method: 'POST',
    headers: edgeHeaders(),
    body: JSON.stringify({
      queue,
      device_id:      deviceId,
      last_synced_at: lastSyncedAt,
    }),
  })

  if (!res.ok) throw new Error(`Sync flush failed: ${res.status}`)
  const data = await res.json()

  // Apply delta records to local cache
  if (data.delta) {
    const { replaceDB, getDB } = await import('../utils/localDB')
    const local = getDB()
    if (data.delta.visits?.length)            local.visits           = mergeById(local.visits,           data.delta.visits)
    if (data.delta.journey_locations?.length) local.journey_locations = mergeById(local.journey_locations, data.delta.journey_locations)
    if (data.delta.status_history?.length)    local.statusHistory     = mergeById(local.statusHistory,     data.delta.status_history)
    // replaceDB triggers saveDB internally
    const { replaceDB: replace } = await import('../utils/localDB')
    try { replace(local) } catch {}
  }

  // Remove successfully synced items from local queue
  if (data.processed > 0) {
    const failedIds = new Set((data.failed_items || []).map(i => i.id))
    const remaining = queue.filter(item => failedIds.has(item.id))
    try {
      if (!remaining.length) localStorage.removeItem('dcc_sfa_offline_queue')
      else localStorage.setItem('dcc_sfa_offline_queue', JSON.stringify(remaining))
    } catch {}
  }

  // Store last sync timestamp
  localStorage.setItem(`dcc_last_sync_${deviceId}`, data.synced_at || new Date().toISOString())

  return {
    synced:  data.processed || 0,
    failed:  data.failed_count || 0,
    pending: data.failed_count || 0,
  }
}

// ── Merge arrays by ID (delta merge) ───────────────────────
function mergeById(existing = [], incoming = []) {
  const map = new Map(existing.map(r => [r.id, r]))
  incoming.forEach(r => map.set(r.id, { ...map.get(r.id), ...r }))
  return Array.from(map.values())
}

// ── Main sync function ──────────────────────────────────────
export async function trySyncQueue() {
  if (!navigator.onLine) return { synced: 0, failed: 0, pending: getQueueCount() }

  try {
    const queue = getOfflineQueue()

    if (queue.length === 0) {
      // No queue — just pull fresh data
      if (isSupabaseConfigured() && supabase) {
        await syncCloudToLocal().catch(() => {})
        markSynced('synced')
      }
      return { synced: 0, failed: 0, pending: 0 }
    }

    notify({ syncing: true, count: queue.length })

    let result

    // Prefer Edge Function flush
    if (USE_EDGE_FUNCTIONS()) {
      try {
        result = await withRetry(() => flushViaEdgeFunction(), 3, 1000)
      } catch (e) {
        console.warn('[syncService] Edge flush failed, falling back to Supabase:', e.message)
      }
    }

    // Fallback: direct Supabase flush
    if (!result) {
      const results = await flushOfflineQueue()
      const failed  = results.filter(item => item.error).length
      result = { synced: results.length - failed, failed, pending: getQueueCount() }
      if (isSupabaseConfigured() && supabase) {
        await syncCloudToLocal().catch(() => {})
      }
    }

    lastSyncAt = new Date().toISOString()
    notify({
      syncing: false,
      synced:  result.synced,
      count:   result.pending,
      status:  result.failed ? 'partial' : 'synced',
      lastSyncAt,
    })

    return result
  } catch (e) {
    notify({ syncing: false, error: e.message, status: 'error' })
    return { synced: 0, failed: 1, pending: getQueueCount() }
  }
}

// ── Priority Flush (called immediately after GPS/visit) ─────
export async function flushPriorityData() {
  if (!navigator.onLine) return
  const queue = getOfflineQueue()
  const PRIORITY_TABLES = new Set(['visits', 'journeys', 'journey_locations', 'status_history'])
  const hasPriority = queue.some(item => PRIORITY_TABLES.has(item.table))
  if (hasPriority) return trySyncQueue()
}

// ── Force sync (manual) ─────────────────────────────────────
export async function forceSyncNow() {
  notify({ syncing: true, count: getQueueCount(), status: 'syncing' })
  try {
    const queueResult = await trySyncQueue()
    if (isSupabaseConfigured() && supabase) {
      await syncCloudToLocal().catch(() => {})
    }
    markSynced('manual')
    return { success: true, ...queueResult, lastSyncAt }
  } catch (error) {
    notify({ syncing: false, error: error.message, status: 'error', count: getQueueCount() })
    return { success: false, message: error.message }
  }
}

// ── Realtime subscriptions (unchanged from v2) ──────────────
const PRIORITY_TABLES = ['visits', 'journeys', 'journey_locations', 'status_history']
const SCHEDULED_TABLES = ['users', 'brands', 'products', 'daily_sales_reports', 'product_day', 'customers', 'targets', 'tasks']

export function startRealtimeSync(onUpdate) {
  if (!isSupabaseConfigured() || !supabase) return () => {}

  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  let channel = supabase.channel('dcc-realtime-v3', {
    config: { broadcast: { self: false } },
  })

  PRIORITY_TABLES.forEach(table => {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, async payload => {
      notify({ status: 'realtime', table, event: payload.eventType })
      try { handleRealtimePayload(payload); markSynced('realtime') } catch {}
      try { onUpdate(payload) } catch {}
    })
  })

  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') notify({ status: 'connected', realtime: true })
    else if (status === 'CHANNEL_ERROR') notify({ status: 'error', realtime: true })
  })

  realtimeChannel = channel
  return () => { if (realtimeChannel) supabase.removeChannel(realtimeChannel); realtimeChannel = null }
}

// ── Auto-sync ────────────────────────────────────────────────
export function startAutoSync(intervalMs = 30000) {
  if (syncInterval) clearInterval(syncInterval)

  if (navigator.onLine && getQueueCount() > 0) trySyncQueue()

  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      if (getQueueCount() > 0) trySyncQueue()
      checkScheduledSync()
    }
  }, intervalMs)

  const onOnline  = () => { notify({ status: 'online' });  trySyncQueue() }
  const onOffline = () =>   notify({ status: 'offline' })

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

// ── Scheduled sync (morning/evening) ────────────────────────
export async function checkScheduledSync() {
  const now     = new Date()
  const hour    = now.getHours()
  const dateStr = now.toISOString().split('T')[0]

  if (hour >= 8 && hour < 11) {
    const lastMorning = localStorage.getItem('last_morning_sync')
    if (lastMorning !== dateStr) {
      if (isSupabaseConfigured() && supabase) await syncCloudToLocal().catch(() => {})
      localStorage.setItem('last_morning_sync', dateStr)
      markSynced('scheduled_morning')
    }
  }

  if (hour >= 18 && hour < 22) {
    const lastEvening = localStorage.getItem('last_evening_sync')
    if (lastEvening !== dateStr) {
      await trySyncQueue()
      if (isSupabaseConfigured() && supabase) await syncCloudToLocal().catch(() => {})
      localStorage.setItem('last_evening_sync', dateStr)
      markSynced('scheduled_evening')
    }
  }
}

// ── Login audit ──────────────────────────────────────────────
export async function logLoginEvent(userId, username, role, action = 'login') {
  const entry = {
    user_id:     userId,
    username,
    role,
    device_info: navigator.userAgent.slice(0, 120),
    action,
    logged_at:  new Date().toISOString(),
  }

  if (isSupabaseConfigured() && supabase) {
    supabase.from('login_logs').insert(entry).catch(() => {})
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

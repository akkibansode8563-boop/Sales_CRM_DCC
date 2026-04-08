/**
 * DCC SalesForce — Sync Service v2
 * ─────────────────────────────────────────────────────────
 * Handles:
 *  • Offline queue flush when back online
 *  • Realtime Supabase subscriptions (all key tables)
 *  • Cross-tab localStorage broadcast (local mode)
 *  • Auto-sync every 30 seconds
 *  • Online/offline status events
 */

import { supabase, isSupabaseConfigured } from '../utils/supabaseClient'
import { getOfflineQueue, flushOfflineQueue, queueOfflineAction, syncCloudToLocal, handleRealtimePayload } from '../utils/supabaseDB'

// ── Listeners ──────────────────────────────────────────────
let syncInterval    = null
let realtimeChannel = null
let syncListeners   = []
let lastSyncAt      = null

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

export function getLastSyncAt() {
  return lastSyncAt
}

// ── Queue helpers ──────────────────────────────────────────
export function getQueueCount() {
  try { return getOfflineQueue().length } catch { return 0 }
}

// ── Flush offline queue to Supabase ───────────────────────
export async function trySyncQueue() {
  if (!navigator.onLine) return { synced: 0, failed: 0, pending: getQueueCount() }
  try {
    const queue = getOfflineQueue()
    if (queue.length === 0) {
      if (isSupabaseConfigured() && supabase) {
        await syncCloudToLocal()
        markSynced('synced')
      }
      return { synced: 0, failed: 0, pending: 0 }
    }
    notify({ syncing: true, count: queue.length })
    const results = await flushOfflineQueue()
    const failed = results.filter(item => item.error).length
    const synced = results.length - failed
    const pending = getQueueCount()
    if (isSupabaseConfigured() && supabase) {
      try { await syncCloudToLocal() } catch {}
    }
    lastSyncAt = new Date().toISOString()
    notify({ syncing: false, synced, count: pending, status: failed ? 'partial' : 'synced', lastSyncAt })
    return { synced, failed, pending }
  } catch (e) {
    notify({ syncing: false, error: e.message, status: 'error' })
    return { synced: 0, failed: 1, pending: getQueueCount() }
  }
}

// ── Realtime & Sync Configuration ──────────────────────────
// Priority: Instant Sync (Admin Monitoring)
const PRIORITY_TABLES = [
  'visits', 
  'journeys', 
  'journey_locations', 
  'status_history'
]

// Scheduled: Master data and performance reports
const SCHEDULED_TABLES = [
  'users', 'brands', 'products',
  'daily_sales_reports', 'product_day', 
  'customers', 'targets', 'tasks'
]

export function startRealtimeSync(onUpdate) {
  if (!isSupabaseConfigured() || !supabase) return () => {}

  // Clean up existing channel
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  let channel = supabase.channel('dcc-realtime-v2', {
    config: { broadcast: { self: false } }
  })

  // Subscribe ONLY to priority tables for real-time monitoring
  PRIORITY_TABLES.forEach(table => {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      async payload => {
        notify({ status: 'realtime', table, event: payload.eventType })
        try { 
          handleRealtimePayload(payload)
          markSynced('realtime') 
        } catch {}
        try { onUpdate(payload) } catch {}
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

export async function forceSyncNow() {
  notify({ syncing: true, count: getQueueCount(), status: 'syncing' })
  try {
    const queueResult = await trySyncQueue()
    if (isSupabaseConfigured() && supabase) {
      // Manual sync still pulls everything
      await syncCloudToLocal()
    }
    markSynced('manual')
    return { success: true, ...queueResult, lastSyncAt }
  } catch (error) {
    notify({ syncing: false, error: error.message, status: 'error', count: getQueueCount() })
    return { success: false, message: error.message }
  }
}

// ── Priority Flush ──────────────────────────────────────────
// Call this immediately after logging visits/journeys
export async function flushPriorityData() {
  if (!navigator.onLine) return
  const queue = getOfflineQueue()
  const priorityQueue = queue.filter(item => PRIORITY_TABLES.includes(item.table))
  
  if (priorityQueue.length > 0) {
    return await trySyncQueue()
  }
}

// ── Scheduled Sync Logic ────────────────────────────────────
export async function checkScheduledSync() {
  const now = new Date()
  const hour = now.getHours()
  const dateStr = now.toISOString().split('T')[0]
  
  // Morning Sync (8 AM - 11 AM)
  if (hour >= 8 && hour < 11) {
    const lastMorning = localStorage.getItem('last_morning_sync')
    if (lastMorning !== dateStr) {
      console.log('[Sync] Starting Morning Sync (Master Data)')
      if (isSupabaseConfigured() && supabase) {
        await syncCloudToLocal() // Future: optimize to pull only master data
      }
      localStorage.setItem('last_morning_sync', dateStr)
      markSynced('scheduled_morning')
    }
  }
  
  // Evening Sync (6 PM - 10 PM)
  if (hour >= 18 && hour < 22) {
    const lastEvening = localStorage.getItem('last_evening_sync')
    if (lastEvening !== dateStr) {
      console.log('[Sync] Starting Evening Sync (Reports & Achievements)')
      await trySyncQueue()
      if (isSupabaseConfigured() && supabase) {
        await syncCloudToLocal()
      }
      localStorage.setItem('last_evening_sync', dateStr)
      markSynced('scheduled_evening')
    }
  }
}

// ── Auto-sync interval ─────────────────────────────────────
export function startAutoSync(intervalMs = 30000) {
  if (syncInterval) clearInterval(syncInterval)

  // Sync queue immediately
  if (navigator.onLine && getQueueCount() > 0) trySyncQueue()

  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      if (getQueueCount() > 0) trySyncQueue()
      checkScheduledSync()
    }
  }, intervalMs)

  // Network events
  const onOnline  = () => { notify({ status: 'online' });  trySyncQueue() }
  const onOffline = () =>  notify({ status: 'offline' })

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

// ── Login audit logger ─────────────────────────────────────
export async function logLoginEvent(userId, username, role, action = 'login') {
  const deviceInfo = `${navigator.userAgent.slice(0, 120)}`
  const entry = {
    user_id:     userId,
    username,
    role,
    device_info: deviceInfo,
    action,
    logged_at:   new Date().toISOString(),
  }

  // Store in Supabase if available
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('login_logs').insert(entry)
    } catch {}
  }

  // Also keep last 50 in localStorage for local mode
  try {
    const key = 'dcc_login_logs'
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    existing.unshift(entry)
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)))
  } catch {}
}

export function getLocalLoginLogs() {
  try { return JSON.parse(localStorage.getItem('dcc_login_logs') || '[]') } catch { return [] }
}

export { queueOfflineAction }

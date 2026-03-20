import { getOfflineQueue, flushOfflineQueue, queueOfflineAction } from '../utils/supabaseDB'

/* --- Offline Sync Service ---------------------
   Wraps offline queue with auto-sync + status
   ------------------------------------------- */

let syncInterval = null
let syncListeners = []

export function onSyncStatusChange(fn) {
  syncListeners.push(fn)
  return () => { syncListeners = syncListeners.filter(l => l !== fn) }
}

function notifyListeners(status) {
  syncListeners.forEach(fn => fn(status))
}

export function getQueueCount() {
  return getOfflineQueue().length
}

export async function trySyncQueue() {
  if (!navigator.onLine) return { synced: 0, failed: 0, pending: getQueueCount() }
  try {
    const queue = getOfflineQueue()
    if (queue.length === 0) return { synced: 0, failed: 0, pending: 0 }
    notifyListeners({ syncing: true, count: queue.length })
    // Local-only DB: just flush the queue (mark as synced)
    flushOfflineQueue()
    notifyListeners({ syncing: false, synced: queue.length, count: 0 })
    return { synced: queue.length, failed: 0, pending: 0 }
  } catch(e) {
    notifyListeners({ syncing: false, error: e.message })
    return { synced: 0, failed: 1, pending: getQueueCount() }
  }
}

export function startAutoSync(intervalMs = 30000) {
  if (syncInterval) clearInterval(syncInterval)
  syncInterval = setInterval(() => {
    if (navigator.onLine && getQueueCount() > 0) trySyncQueue()
  }, intervalMs)

  window.addEventListener('online', () => {
    notifyListeners({ status: 'online' })
    if (getQueueCount() > 0) trySyncQueue()
  })
  window.addEventListener('offline', () => {
    notifyListeners({ status: 'offline' })
  })
}

export function stopAutoSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null }
}

export { queueOfflineAction }

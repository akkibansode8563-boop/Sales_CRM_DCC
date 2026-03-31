/**
 * DCC SalesForce — IndexedDB Utility
 * ───────────────────────────────────────────────────────────────
 * Replaces localStorage for high-volume tables:
 *   visits, journeys, journey_locations, customers, offline_queue
 *
 * Small/auth data is still kept in localStorage (synchronous access needed).
 *
 * Uses the native IDB browser API — no external dependencies needed.
 */

const IDB_NAME    = 'dcc_sfa_idb'
const IDB_VERSION = 2

// Object store names
export const STORES = {
  VISITS:             'visits',
  JOURNEYS:           'journeys',
  JOURNEY_LOCATIONS:  'journey_locations',
  CUSTOMERS:          'customers',
  BRANDS:             'brands',
  PRODUCTS:           'products',
  DAILY_REPORTS:      'daily_sales_reports',
  PRODUCT_DAY:        'product_day',
  OFFLINE_QUEUE:      'offline_queue',
  TARGETS:            'targets',
}

let _db = null

/**
 * Open (or upgrade) the IndexedDB database.
 * Safe to call multiple times — returns cached connection.
 */
export async function openDB() {
  if (_db) return _db

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = e.target.result

      // visits — indexed by manager_id + visit_date
      if (!db.objectStoreNames.contains(STORES.VISITS)) {
        const s = db.createObjectStore(STORES.VISITS, { keyPath: 'id', autoIncrement: true })
        s.createIndex('manager_id',              'manager_id',                { unique: false })
        s.createIndex('visit_date',              'visit_date',                { unique: false })
        s.createIndex('manager_id_visit_date',   ['manager_id', 'visit_date'], { unique: false })
        s.createIndex('customer_id',             'customer_id',               { unique: false })
      }

      // journeys — indexed by manager_id + status
      if (!db.objectStoreNames.contains(STORES.JOURNEYS)) {
        const s = db.createObjectStore(STORES.JOURNEYS, { keyPath: 'id', autoIncrement: true })
        s.createIndex('manager_id', 'manager_id', { unique: false })
        s.createIndex('status',     'status',     { unique: false })
        s.createIndex('date',       'date',       { unique: false })
      }

      // journey_locations — indexed by journey_id + timestamp for fast trail retrieval
      if (!db.objectStoreNames.contains(STORES.JOURNEY_LOCATIONS)) {
        const s = db.createObjectStore(STORES.JOURNEY_LOCATIONS, { keyPath: 'id', autoIncrement: true })
        s.createIndex('journey_id',           'journey_id',                  { unique: false })
        s.createIndex('manager_id',           'manager_id',                  { unique: false })
        s.createIndex('journey_id_timestamp', ['journey_id', 'timestamp'],   { unique: false })
      }

      // customers
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        const s = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id', autoIncrement: true })
        s.createIndex('territory', 'territory', { unique: false })
        s.createIndex('name',      'name',      { unique: false })
      }

      // brands
      if (!db.objectStoreNames.contains(STORES.BRANDS)) {
        db.createObjectStore(STORES.BRANDS, { keyPath: 'id', autoIncrement: true })
      }

      // products
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        const s = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id', autoIncrement: true })
        s.createIndex('brand_id', 'brand_id', { unique: false })
      }

      // daily_sales_reports
      if (!db.objectStoreNames.contains(STORES.DAILY_REPORTS)) {
        const s = db.createObjectStore(STORES.DAILY_REPORTS, { keyPath: 'id', autoIncrement: true })
        s.createIndex('manager_id',      'manager_id',              { unique: false })
        s.createIndex('date',            'date',                    { unique: false })
        s.createIndex('manager_id_date', ['manager_id', 'date'],    { unique: true  })
      }

      // product_day
      if (!db.objectStoreNames.contains(STORES.PRODUCT_DAY)) {
        const s = db.createObjectStore(STORES.PRODUCT_DAY, { keyPath: 'id', autoIncrement: true })
        s.createIndex('manager_id', 'manager_id', { unique: false })
        s.createIndex('date',       'date',        { unique: false })
      }

      // targets
      if (!db.objectStoreNames.contains(STORES.TARGETS)) {
        const s = db.createObjectStore(STORES.TARGETS, { keyPath: 'id', autoIncrement: true })
        s.createIndex('manager_id', 'manager_id', { unique: false })
      }

      // offline_queue — critical: survives storage pressure better in IDB
      if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
        const s = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true })
        s.createIndex('type',      'type',      { unique: false })
        s.createIndex('queued_at', 'queued_at', { unique: false })
      }
    }

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror    = (e) => reject(e.target.error)
  })
}

// ── Generic helpers ──────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName)
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror   = (e) => reject(e.target.error)
  })
}

// ── CRUD operations ──────────────────────────────────────────

/** Get a single record by primary key */
export async function idbGet(storeName, key) {
  await openDB()
  return wrap(tx(storeName).get(key))
}

/** Get all records in a store */
export async function idbGetAll(storeName) {
  await openDB()
  return wrap(tx(storeName).getAll()) || []
}

/** Add a new record (auto-generates ID if keyPath is autoIncrement) */
export async function idbAdd(storeName, record) {
  await openDB()
  const id = await wrap(tx(storeName, 'readwrite').add(record))
  return { ...record, id }
}

/** Put (upsert) a record */
export async function idbPut(storeName, record) {
  await openDB()
  return wrap(tx(storeName, 'readwrite').put(record))
}

/** Bulk put (upsert) multiple records */
export async function idbPutAll(storeName, records) {
  await openDB()
  return new Promise((resolve, reject) => {
    const transaction = _db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    records.forEach(r => store.put(r))
    transaction.oncomplete = () => resolve(records.length)
    transaction.onerror    = (e) => reject(e.target.error)
  })
}

/** Delete a record by primary key */
export async function idbDelete(storeName, key) {
  await openDB()
  return wrap(tx(storeName, 'readwrite').delete(key))
}

/** Clear all records in a store */
export async function idbClear(storeName) {
  await openDB()
  return wrap(tx(storeName, 'readwrite').clear())
}

/** Count records in a store */
export async function idbCount(storeName) {
  await openDB()
  return wrap(tx(storeName).count())
}

// ── Index-based queries ──────────────────────────────────────

/** Get all records matching an index value */
export async function idbGetByIndex(storeName, indexName, value) {
  await openDB()
  const store = tx(storeName)
  const index = store.index(indexName)
  return wrap(index.getAll(IDBKeyRange.only(value))) || []
}

/** Get all records matching a compound index value */
export async function idbGetByCompoundIndex(storeName, indexName, values) {
  await openDB()
  const store = tx(storeName)
  const index = store.index(indexName)
  return wrap(index.getAll(IDBKeyRange.only(values))) || []
}

/** Get all records where index is within a range */
export async function idbGetByRange(storeName, indexName, lower, upper) {
  await openDB()
  const store = tx(storeName)
  const index = store.index(indexName)
  const range = IDBKeyRange.bound(lower, upper)
  return wrap(index.getAll(range)) || []
}

// ── Specialized helpers ──────────────────────────────────────

/** Get all visits for a specific manager */
export async function getVisitsByManager(managerId) {
  return idbGetByIndex(STORES.VISITS, 'manager_id', managerId)
}

/** Get visits for a specific manager on a specific date */
export async function getVisitsByManagerDate(managerId, date) {
  return idbGetByCompoundIndex(STORES.VISITS, 'manager_id_visit_date', [managerId, date])
}

/** Get active journey for a manager */
export async function getActiveJourney(managerId) {
  const journeys = await idbGetByIndex(STORES.JOURNEYS, 'manager_id', managerId)
  return journeys.find(j => j.status === 'active') || null
}

/** Get journey locations for a journey (sorted by timestamp) */
export async function getJourneyLocations(journeyId) {
  const locs = await idbGetByIndex(STORES.JOURNEY_LOCATIONS, 'journey_id', journeyId)
  return locs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
}

/** Get last N journey locations (efficient for live tracking) */
export async function getLastJourneyLocations(journeyId, limit = 100) {
  const locs = await getJourneyLocations(journeyId)
  return locs.slice(-limit)
}

/** Get all customers (optionally filter by territory) */
export async function getCustomers(territory = null) {
  if (territory) return idbGetByIndex(STORES.CUSTOMERS, 'territory', territory)
  return idbGetAll(STORES.CUSTOMERS)
}

/** Search customers by name (JS-level filter — IDB doesn't support LIKE) */
export async function searchCustomers(query) {
  if (!query) return []
  const q   = query.toLowerCase().trim()
  const all = await idbGetAll(STORES.CUSTOMERS)
  return all
    .filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.owner_name?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
    .sort((a, b) => {
      const aE = a.name?.toLowerCase().startsWith(q) ? 0 : 1
      const bE = b.name?.toLowerCase().startsWith(q) ? 0 : 1
      return aE - bE || (b.visit_count || 0) - (a.visit_count || 0)
    })
    .slice(0, 10)
}

/** Get all offline queue items */
export async function getOfflineQueue() {
  return idbGetAll(STORES.OFFLINE_QUEUE)
}

/** Add to offline queue */
export async function addToOfflineQueue(item) {
  return idbAdd(STORES.OFFLINE_QUEUE, {
    ...item,
    queued_at: new Date().toISOString(),
  })
}

/** Remove processed items from offline queue */
export async function removeFromOfflineQueue(ids) {
  await openDB()
  return new Promise((resolve, reject) => {
    const transaction = _db.transaction(STORES.OFFLINE_QUEUE, 'readwrite')
    const store = transaction.objectStore(STORES.OFFLINE_QUEUE)
    ids.forEach(id => store.delete(id))
    transaction.oncomplete = () => resolve(ids.length)
    transaction.onerror    = (e) => reject(e.target.error)
  })
}

// ── One-time migration from localStorage ────────────────────
const MIGRATION_KEY = 'dcc_idb_migrated_v2'
const LS_KEY        = 'dcc_sfa_v3'

/**
 * Migrate existing localStorage data to IndexedDB.
 * Runs once on first launch after upgrade.
 * Safe to call multiple times (idempotent).
 */
export async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATION_KEY) === 'done') return { migrated: false }

  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) {
      localStorage.setItem(MIGRATION_KEY, 'done')
      return { migrated: false, reason: 'no localStorage data' }
    }

    const data = JSON.parse(raw)
    let total = 0

    // Migrate each high-volume table
    const tableMappings = [
      { key: 'visits',               store: STORES.VISITS            },
      { key: 'journeys',             store: STORES.JOURNEYS          },
      { key: 'journey_locations',    store: STORES.JOURNEY_LOCATIONS  },
      { key: 'customers',            store: STORES.CUSTOMERS         },
      { key: 'brands',               store: STORES.BRANDS            },
      { key: 'products',             store: STORES.PRODUCTS          },
      { key: 'daily_sales_reports',  store: STORES.DAILY_REPORTS     },
      { key: 'product_day',          store: STORES.PRODUCT_DAY       },
      { key: 'targets',              store: STORES.TARGETS           },
    ]

    for (const { key, store } of tableMappings) {
      const records = Array.isArray(data[key]) ? data[key] : []
      if (records.length > 0) {
        await idbPutAll(store, records)
        total += records.length
      }
    }

    // Migrate offline queue
    const queueRaw = localStorage.getItem('dcc_sfa_offline_queue')
    if (queueRaw) {
      const queue = JSON.parse(queueRaw)
      for (const item of queue) {
        await addToOfflineQueue(item)
        total++
      }
    }

    localStorage.setItem(MIGRATION_KEY, 'done')
    console.log(`[IDB Migration] Migrated ${total} records from localStorage to IndexedDB.`)
    return { migrated: true, total }

  } catch (e) {
    console.warn('[IDB Migration] Failed:', e.message)
    localStorage.setItem(MIGRATION_KEY, 'done') // don't retry on error
    return { migrated: false, error: e.message }
  }
}

/** Get database size estimate */
export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null
  const { quota, usage } = await navigator.storage.estimate()
  return {
    quota:     Math.round(quota  / 1024 / 1024),
    usage:     Math.round(usage  / 1024 / 1024),
    available: Math.round((quota - usage) / 1024 / 1024),
    pct:       quota > 0 ? Math.round((usage / quota) * 100) : 0,
  }
}

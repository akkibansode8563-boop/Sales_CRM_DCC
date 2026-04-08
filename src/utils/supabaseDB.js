// ============================================================
// SUPABASE DB — Full cloud backend for DCC SalesForce CRM
// Falls back to localStorage if Supabase not configured
// ============================================================
import { supabase, isSupabaseConfigured } from './supabaseClient.js'
import * as local from './localDB.js'

// Re-evaluated at every call — env vars may not be available at module load time
const USE_CLOUD = () => isSupabaseConfigured()

const normalizeText = (value = '') => String(value).trim().toLowerCase()

function mergeCustomerMatches(primary = [], secondary = []) {
  const seen = new Set()
  return [...primary, ...secondary].filter((customer) => {
    const key = customer?.id || normalizeText(customer?.name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildVisitCustomerDetails(customer, visit) {
  return [
    customer?.owner_name || visit?.contact_person || '',
    customer?.phone || visit?.contact_phone || '',
    customer?.type || visit?.client_type || '',
  ].filter(Boolean).join(' • ')
}

// --- Re-export pure local functions unchanged -------------
export {
  calcDistanceKm, calcTravelTime,
  getTerritories,
  getAISuggestions,
  detectNearbyCustomers,
  getHeatmapData,
  getJourneyReplayData,
  getTerritoryStats,
  getAnalytics,
  getIdleStatus,
  getDailyAlerts,
  shouldShowAlerts,
  getAlertDismissKey,
  exportDailyReport,
  exportToCSV,
  getRemoveDuplicates,
  productionReset,
  resetDB,
  getOfflineQueue,
  createTask as createOfflineTask,
} from './localDB.js'

const OFFLINE_QUEUE_KEY = 'dcc_sfa_offline_queue'
const JOURNEY_ID_MAP_KEY = 'dcc_sfa_journey_id_map'
const PRIORITY_TABLES = new Set(['visits', 'journeys', 'journey_locations', 'status_history'])

export function queueOfflineAction(type, payload, meta = {}) {
  return local.queueOfflineAction(type, payload, meta)
}

function getStoredQueue() {
  return local.getOfflineQueue()
}

function saveStoredQueue(queue) {
  try {
    if (!queue.length) localStorage.removeItem(OFFLINE_QUEUE_KEY)
    else localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch {}
}

function getJourneyIdMap() {
  try {
    return JSON.parse(localStorage.getItem(JOURNEY_ID_MAP_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveJourneyIdMap(nextMap) {
  try {
    if (!Object.keys(nextMap).length) localStorage.removeItem(JOURNEY_ID_MAP_KEY)
    else localStorage.setItem(JOURNEY_ID_MAP_KEY, JSON.stringify(nextMap))
  } catch {}
}

function getMappedJourneyId(localJourneyId) {
  if (localJourneyId == null) return null
  const map = getJourneyIdMap()
  return map[String(localJourneyId)] || null
}

function storeJourneyIdMapping(localJourneyId, cloudJourneyId) {
  if (localJourneyId == null || cloudJourneyId == null) return
  const map = getJourneyIdMap()
  map[String(localJourneyId)] = cloudJourneyId
  saveJourneyIdMap(map)
}

function clearJourneyIdMapping(localJourneyId) {
  if (localJourneyId == null) return
  const map = getJourneyIdMap()
  delete map[String(localJourneyId)]
  saveJourneyIdMap(map)
}

function translateJourneyId(journeyId) {
  return getMappedJourneyId(journeyId) || journeyId || null
}

// --- Hash helper (same as localDB) -----------------------
async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function generateToken(user) {
  return btoa(JSON.stringify({ user_id: user.id, username: user.username, role: user.role, exp: Date.now() + 24 * 60 * 60 * 1000 }))
}

async function fetchTable(tableName, queryBuilder = q => q) {
  const query = queryBuilder(supabase.from(tableName).select('*'))
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function fetchOptionalTable(tableName, queryBuilder = q => q) {
  try {
    return await fetchTable(tableName, queryBuilder)
  } catch (error) {
    const message = String(error?.message || '')
    if (message.includes(`relation "public.${tableName}" does not exist`) || message.includes(`Could not find the table 'public.${tableName}'`)) {
      return []
    }
    throw error
  }
}

async function insertVisitIntoCloud(data) {
  const visitDate = data.visit_date || new Date().toISOString().split('T')[0]
  const payload = {
    ...data,
    visit_date: visitDate,
    journey_id: translateJourneyId(data.journey_id),
    status: data.status || 'Completed',
  }

  const { data: newVisit, error } = await supabase.from('visits').insert(payload).select().single()
  if (error) throw error

  if (payload.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('visit_count')
      .eq('id', payload.customer_id)
      .single()

    await supabase
      .from('customers')
      .update({
        visit_count: (customer?.visit_count || 0) + 1,
        last_visited: new Date().toISOString(),
      })
      .eq('id', payload.customer_id)
      .catch(() => {})
  }

  return newVisit
}

async function insertTaskIntoCloud(data) {
  const payload = {
    ...data,
    visit_id: null,
    status: data.status || 'open',
    priority: data.priority || 'medium',
    reminder_type: data.reminder_type || 'push',
    source: data.source || 'app',
  }
  const { data: task, error } = await supabase.from('tasks').insert(payload).select().single()
  if (error) throw error
  return task
}

async function insertCustomerIntoCloud(data) {
  const { data: existing } = await supabase.from('customers').select('id').ilike('name', data.name.trim()).maybeSingle()
  if (existing) return existing
  const { data: customer, error } = await supabase.from('customers').insert({
    name: data.name.trim(),
    owner_name: data.owner_name || '',
    type: data.type || 'Retailer',
    address: data.address || '',
    phone: data.phone || '',
    territory: data.territory || '',
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    created_by: data.created_by || null,
    visit_count: data.visit_count || 0,
  }).select().single()
  if (error) throw error
  return customer
}

async function insertProductDayIntoCloud(data) {
  const { data: entry, error } = await supabase
    .from('product_day')
    .insert({ ...data, updated_at: data.updated_at || new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return entry
}

async function flushQueuedItem(item) {
  switch (item.type) {
    case 'updateStatus': {
      const { data, error } = await supabase.from('status_history').insert(item.payload).select().single()
      if (error) throw error
      return data
    }
    case 'createVisit':
      return insertVisitIntoCloud(item.payload)
    case 'createTask':
      return insertTaskIntoCloud(item.payload)
    case 'createCustomer':
      return insertCustomerIntoCloud(item.payload)
    case 'createProductDay':
      return insertProductDayIntoCloud(item.payload)
    case 'startJourney': {
      const { data: journey, error } = await supabase.from('journeys').insert({
        manager_id: item.payload.manager_id,
        date: item.payload.date || new Date().toISOString().split('T')[0],
        start_time: item.payload.start_time || new Date().toISOString(),
        start_location: item.payload.start_location || 'Starting Point',
        start_latitude: item.payload.latitude || null,
        start_longitude: item.payload.longitude || null,
        status: 'active',
      }).select().single()
      if (error) throw error
      storeJourneyIdMapping(item.local_journey_id, journey.id)
      if (item.payload.latitude != null && item.payload.longitude != null) {
        await supabase.from('journey_locations').insert({
          journey_id: journey.id,
          manager_id: item.payload.manager_id,
          latitude: item.payload.latitude,
          longitude: item.payload.longitude,
          timestamp: item.payload.start_time || new Date().toISOString(),
          speed_kmh: 0,
          is_suspicious: false,
          suspicious_reason: '',
        })
      }
      return journey
    }
    case 'addJourneyLocation': {
      const translatedJourneyId = translateJourneyId(item.local_journey_id || item.payload.journey_id)
      if (!translatedJourneyId) throw new Error('Missing mapped journey id for queued GPS point')
      const { data, error } = await supabase.from('journey_locations').insert({
        journey_id: translatedJourneyId,
        manager_id: item.payload.manager_id,
        latitude: item.payload.latitude,
        longitude: item.payload.longitude,
        timestamp: item.payload.timestamp || new Date().toISOString(),
        speed_kmh: item.payload.speed_kmh || 0,
        is_suspicious: !!item.payload.is_suspicious,
        suspicious_reason: item.payload.suspicious_reason || '',
      }).select().single()
      if (error) throw error
      return data
    }
    case 'endJourney': {
      const translatedJourneyId = translateJourneyId(item.local_journey_id)
      const targetJourneyId = translatedJourneyId || (await getActiveJourney(item.payload.manager_id))?.id
      if (!targetJourneyId) throw new Error('No mapped cloud journey to end')
      const { data, error } = await supabase.from('journeys').update({
        end_time: item.payload.end_time || new Date().toISOString(),
        end_location: item.payload.end_location || 'End Point',
        end_latitude: item.payload.latitude || null,
        end_longitude: item.payload.longitude || null,
        status: 'completed',
        total_visits: item.payload.total_visits || 0,
        total_km: item.payload.total_km || 0,
      }).eq('id', targetJourneyId).select().single()
      if (error) throw error
      clearJourneyIdMapping(item.local_journey_id)
      return data
    }
    default:
      throw new Error(`Unsupported queued action: ${item.type}`)
  }
}

export async function flushOfflineQueue() {
  const queue = getStoredQueue()
  if (!queue.length) return []
  if (!USE_CLOUD() || !supabase) return local.flushOfflineQueue()

  const remaining = []
  const results = []

  for (const item of queue) {
    try {
      const result = await flushQueuedItem(item)
      results.push({ ...item, result })
    } catch (error) {
      remaining.push(item)
      results.push({ ...item, error: error.message })
    }
  }

  saveStoredQueue(remaining)
  return results
}

export async function syncCloudToLocal(isInitialSync = false) {
  if (!USE_CLOUD() || !supabase) return { success: false, message: 'Supabase not configured' }

  const current = typeof local.getDB === 'function' ? local.getDB() : {}
  
  // Date filter for initial sync (e.g. login)
  const syncDays = 14
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - syncDays)
  const cutoffStr = cutoffDate.toISOString().split('T')[0]

  const buildQuery = (tableName, dateField = 'created_at') => {
    return q => {
      let query = q.order('id', { ascending: false })
      if (isInitialSync) {
        // Only fetch last N days of transactional data
        query = query.gte(dateField, cutoffStr)
      }
      return query
    }
  }

  const [
    users,
    visits,
    targets,
    statusHistory,
    journeys,
    journeyLocations,
    dailySalesReports,
    productDay,
    tasks,
    visitNotes,
    customers,
    brands,
    products,
  ] = await Promise.all([
    fetchTable('users'),
    fetchTable('visits', buildQuery('visits', 'visit_date')),
    fetchTable('targets', q => q.order('id', {ascending: false})),
    fetchTable('status_history', buildQuery('status_history', 'timestamp')),
    fetchTable('journeys', buildQuery('journeys', 'date')),
    fetchTable('journey_locations', buildQuery('journey_locations', 'timestamp')),
    fetchTable('daily_sales_reports', buildQuery('daily_sales_reports', 'date')),
    fetchTable('product_day', buildQuery('product_day', 'date')),
    fetchOptionalTable('tasks', buildQuery('tasks', 'created_at')),
    fetchOptionalTable('visit_notes', buildQuery('visit_notes', 'created_at')),
    fetchTable('customers'),
    fetchTable('brands'),
    fetchTable('products'),
  ])

  const mirrored = {
    users,
    visits,
    targets,
    statusHistory,
    journeys,
    journey_locations: journeyLocations,
    daily_sales_reports: dailySalesReports,
    product_day: productDay,
    tasks,
    visit_notes: visitNotes,
    customers,
    brands,
    products,
    recentCustomers: current.recentCustomers || [],
    recentProducts: current.recentProducts || [],
    recentBrands: current.recentBrands || [],
    offline_queue: current.offline_queue || [],
  }

  local.replaceDB(mirrored)
  return { success: true, counts: {
    users: users.length,
    visits: visits.length,
    targets: targets.length,
    customers: customers.length,
    products: products.length,
  } }
}

export function handleRealtimePayload(payload) {
  if (!payload || !payload.table || !payload.eventType) return { success: false, message: 'Invalid payload' }
  const record = payload.new || payload.old
  if (!record) return { success: false, message: 'No record data' }
  try {
    local.patchTableRecord(payload.table, payload.eventType, record)
    return { success: true }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

// ---------------------------------------------------------
// AUTH
// ---------------------------------------------------------
// ── refreshSync: pull all cloud data into local cache ─────────────────────────
// Call on dashboard mount — non-blocking background operation
export async function refreshSync() {
  if (!USE_CLOUD() || !supabase) return { success: false, reason: 'local_mode' }
  try {
    const result = await syncCloudToLocal()
    return result
  } catch (e) {
    console.warn('[refreshSync]', e.message)
    return { success: false, reason: e.message }
  }
}


export async function authLogin(username, password) {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, '_')

  const cached = await local.authLogin(normalized, password)
  if (cached.success) {
    if (USE_CLOUD() && supabase) {
      syncCloudToLocal(true).catch(() => {})
    }
    return cached
  }

  if (USE_CLOUD() && supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id,username,password_hash,role,full_name,territory,email,phone,is_active')
        .eq('username', normalized)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !data) {
        return { success: false, message: 'Invalid username or password' }
      }

      const hash = await hashPassword(password)
      if (hash !== data.password_hash) {
        return { success: false, message: 'Invalid username or password' }
      }

      syncCloudToLocal(true).catch(() => {})

      return {
        success:   true,
        user_id:   data.id,
        username:  data.username,
        role:      data.role,
        full_name: data.full_name,
        territory: data.territory || '',
        email:     data.email || '',
        phone:     data.phone || '',
        token:     generateToken(data),
      }
    } catch (e) {
      console.warn('[authLogin] Supabase error, trying cache:', e.message)
      const retryCached = await local.authLogin(normalized, password)
      if (retryCached.success) return retryCached
      return { success: false, message: 'Cannot connect. Check your internet and try again.' }
    }
  }

  return local.authLogin(normalized, password)
}

// ---------------------------------------------------------
// USERS
// ---------------------------------------------------------
export async function getUsers(roleFilter = null) {
  if (!USE_CLOUD()) return local.getUsers(roleFilter)
  try {
    let q = supabase.from('users').select('id,username,full_name,role,email,phone,territory,is_active,created_at').eq('is_active', true)
    if (roleFilter) q = q.eq('role', roleFilter)
    const { data } = await q
    return data || []
  } catch { return local.getUsers(roleFilter) }
}

export async function getUsersAdmin() {
  if (!USE_CLOUD()) return local.getUsersAdmin()
  try {
    const { data } = await supabase.from('users').select('id,username,full_name,role,email,phone,territory,is_active,created_at').eq('is_active', true)
    return data || []
  } catch { return local.getUsersAdmin() }
}

export async function createUser(data) {
  if (!USE_CLOUD()) return local.createUser(data)
  try {
    const cleanUsername = data.username.trim().toLowerCase().replace(/\s+/g, '_')
    if (!cleanUsername) throw new Error('Username is required')
    if (!data.password || data.password.trim().length < 4) throw new Error('Password must be at least 4 characters')
    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) throw new Error(`Username "${cleanUsername}" already exists`)
    const { data: newUser, error } = await supabase.from('users').insert({
      username: cleanUsername,
      password_hash: await hashPassword(data.password.trim()),
      full_name: data.full_name.trim(),
      role: data.role || 'Sales Manager',
      email: data.email || '',
      phone: data.phone || '',
      territory: data.territory || '',
      is_active: true,
    }).select().single()
    if (error) throw error
    try { local.patchTableRecord('users', 'INSERT', newUser) } catch {}
    return { success: true, user_id: newUser.id, username: cleanUsername }
  } catch (e) {
    if (e.message.includes('already exists')) throw e
    return local.createUser(data)
  }
}

export async function updateUser(id, updates) {
  if (!USE_CLOUD()) return local.updateUser(id, updates)
  try {
    const allowed = ['full_name', 'email', 'phone', 'territory', 'role']
    const patch = {}
    allowed.forEach(f => { if (updates[f] !== undefined) patch[f] = updates[f] })
    if (updates.password && updates.password.trim() !== '') {
      patch.password_hash = await hashPassword(updates.password.trim())
    }
    patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('users').update(patch).eq('id', id).select().single()
    if (error) throw error
    try { await syncCloudToLocal() } catch {}
    return data
  } catch { return local.updateUser(id, updates) }
}

export async function adminSetPassword(id, newPassword) {
  if (!USE_CLOUD()) return local.adminSetPassword(id, newPassword)
  try {
    if (!newPassword || newPassword.trim().length < 4) throw new Error('Password must be at least 4 characters')
    const { error } = await supabase.from('users').update({
      password_hash: await hashPassword(newPassword.trim()),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    try { await syncCloudToLocal() } catch {}
    return { success: true }
  } catch { return local.adminSetPassword(id, newPassword) }
}

export async function deleteUser(id) {
  if (!USE_CLOUD()) return local.deleteUser(id)
  try {
    const { error } = await supabase.from('users').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    try { await syncCloudToLocal() } catch {}
    return { success: true }
  } catch { return local.deleteUser(id) }
}

// ---------------------------------------------------------
// STATUS
// ---------------------------------------------------------
export async function updateStatus(manager_id, status) {
  if (!USE_CLOUD()) return local.updateStatus(manager_id, status)
  try {
    const { data, error } = await supabase.from('status_history').insert({ manager_id, status }).select().single()
    if (error) throw error
    local.patchTableRecord('status_history', 'INSERT', data)
    return data
  } catch(e) { 
    const localStatus = local.updateStatus(manager_id, status)
    queueOfflineAction('updateStatus', { manager_id, status, timestamp: localStatus.timestamp }, { table: 'status_history', priority: true })
    return localStatus 
  }
}

export function getCurrentStatus(manager_id) {
  return local.getCurrentStatus(manager_id)
}

// ---------------------------------------------------------
// VISITS
// ---------------------------------------------------------
export async function getTodayVisits(manager_id) {
  if (!USE_CLOUD()) return local.getTodayVisits(manager_id)
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('visits').select('*').eq('manager_id', manager_id).eq('visit_date', today).order('created_at', { ascending: true })
    return data || []
  } catch { return local.getTodayVisits(manager_id) }
}

export async function getAllVisits(manager_id) {
  if (!USE_CLOUD()) return local.getAllVisits(manager_id)
  try {
    const { data } = await supabase.from('visits').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })
    return data || []
  } catch { return local.getAllVisits(manager_id) }
}

export async function getAllVisitsAll() {
  if (!USE_CLOUD()) return local.getAllVisitsAll()
  try {
    const { data } = await supabase.from('visits').select('*').order('created_at', { ascending: false })
    return data || []
  } catch { return local.getAllVisitsAll() }
}

export async function createVisit(data) {
  if (!USE_CLOUD()) return local.createVisit(data)
  try {
    const newVisit = await insertVisitIntoCloud(data)
    try { local.patchTableRecord('visits', 'INSERT', newVisit) } catch {}
    return newVisit
  } catch(e) { 
    const localVisit = local.createVisit(data)
    queueOfflineAction('createVisit', { ...data, created_at: localVisit.created_at }, { table: 'visits', priority: true })
    return localVisit 
  }
}

export async function updateVisit(id, updates) {
  if (!USE_CLOUD()) return local.updateVisit(id, updates)
  try {
    const { data, error } = await supabase.from('visits').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch { return local.updateVisit(id, updates) }
}

// ---------------------------------------------------------
// TASKS & FOLLOW-UPS
// ---------------------------------------------------------
export async function getTasks(manager_id = null, filters = {}) {
  if (!USE_CLOUD()) return local.getTasks(manager_id, filters)
  try {
    let q = supabase.from('tasks').select('*').is('deleted_at', null)
    if (manager_id != null) q = q.eq('manager_id', manager_id)
    if (filters.customer_id != null) q = q.eq('customer_id', filters.customer_id)
    if (filters.status) q = q.eq('status', filters.status)
    const { data, error } = await q.order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch {
    return local.getTasks(manager_id, filters)
  }
}

export async function createTask(data) {
  if (!USE_CLOUD()) return local.createTask(data)
  try {
    const payload = {
      ...data,
      status: data.status || 'open',
      priority: data.priority || 'medium',
      reminder_type: data.reminder_type || 'push',
      source: data.source || 'app',
    }
    const task = await insertTaskIntoCloud(payload)
    try { local.patchTableRecord('tasks', 'INSERT', task) } catch {}
    return task
  } catch(e) {
    const localTask = local.createTask(data)
    queueOfflineAction('createTask', { ...data, created_at: localTask.created_at }, { table: 'tasks' })
    return localTask
  }
}

export async function updateTask(id, updates) {
  if (!USE_CLOUD()) return local.updateTask(id, updates)
  try {
    const nextStatus = updates.status
    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    }
    if (nextStatus === 'completed' && !payload.completed_at) {
      payload.completed_at = new Date().toISOString()
    }
    if (nextStatus && nextStatus !== 'completed') {
      payload.completed_at = null
    }
    const { data, error } = await supabase.from('tasks').update(payload).eq('id', id).select().single()
    if (error) throw error
    try { local.patchTableRecord('tasks', 'UPDATE', data) } catch {}
    return data
  } catch {
    return local.updateTask(id, updates)
  }
}

export async function deleteTask(id) {
  return updateTask(id, { deleted_at: new Date().toISOString() })
}

export async function getCustomerTimeline(customer_id, limit = 12) {
  if (!USE_CLOUD()) return local.getCustomerTimeline(customer_id, limit)
  try {
    const [visitsResult, tasksResult, notesResult] = await Promise.all([
      supabase.from('visits').select('*').eq('customer_id', customer_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit),
      supabase.from('tasks').select('*').eq('customer_id', customer_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit),
      supabase.from('visit_notes').select('*').eq('customer_id', customer_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit),
    ])

    if (visitsResult.error) throw visitsResult.error
    if (tasksResult.error) throw tasksResult.error
    if (notesResult.error) throw notesResult.error

    const timeline = [
      ...((visitsResult.data || []).map((visit) => ({
        id: `visit-${visit.id}`,
        type: 'visit',
        timestamp: visit.created_at || `${visit.visit_date || ''}T00:00:00.000Z`,
        title: visit.visit_type || 'Visit logged',
        subtitle: visit.location || '',
        detail: visit.notes || '',
        status: visit.status || 'Completed',
        meta: [visit.contact_person, visit.contact_phone].filter(Boolean).join(' • '),
        raw: visit,
      }))),
      ...((tasksResult.data || []).map((task) => ({
        id: `task-${task.id}`,
        type: 'task',
        timestamp: task.completed_at || task.due_at || task.created_at,
        title: task.title,
        subtitle: task.status === 'completed' ? 'Follow-up completed' : 'Follow-up task',
        detail: task.description || '',
        status: task.status || 'open',
        meta: task.due_at ? `Due ${new Date(task.due_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}` : '',
        raw: task,
      }))),
      ...((notesResult.data || []).map((note) => ({
        id: `note-${note.id}`,
        type: 'note',
        timestamp: note.created_at,
        title: note.note_type === 'visit_outcome' ? 'Visit outcome saved' : 'Customer note',
        subtitle: note.note_type?.replace(/_/g, ' ') || 'general',
        detail: note.note_text || '',
        status: 'logged',
        meta: '',
        raw: note,
      }))),
    ]

    return timeline
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, limit)
  } catch {
    return local.getCustomerTimeline(customer_id, limit)
  }
}

// ---------------------------------------------------------
// JOURNEYS
// ---------------------------------------------------------
export async function getActiveJourney(manager_id) {
  if (!USE_CLOUD()) return local.getActiveJourney(manager_id)
  try {
    const { data } = await supabase.from('journeys').select('*').eq('manager_id', manager_id).eq('status', 'active').single()
    return data || null
  } catch { return local.getActiveJourney(manager_id) }
}

export async function startJourney(manager_id, start_location, latitude, longitude) {
  if (!USE_CLOUD()) return local.startJourney(manager_id, start_location, latitude, longitude)
  try {
    const existing = await getActiveJourney(manager_id)
    if (existing) throw new Error('Journey already active')
    const today = new Date().toISOString().split('T')[0]
    const { data: journey, error } = await supabase.from('journeys').insert({
      manager_id, date: today,
      start_location: start_location || 'Starting Point',
      start_latitude: latitude || null,
      start_longitude: longitude || null,
      status: 'active',
    }).select().single()
    if (error) throw error
    // Add first GPS point
    if (latitude) {
      const { data: firstLoc } = await supabase
        .from('journey_locations')
        .insert({ journey_id: journey.id, manager_id, latitude, longitude, speed_kmh: 0, is_suspicious: false })
        .select()
        .single()
        .catch(() => ({ data: null }))
      if (firstLoc) {
        try { local.patchTableRecord('journey_locations', 'INSERT', firstLoc) } catch {}
      }
    }
    try { local.patchTableRecord('journeys', 'INSERT', journey) } catch {}
    return journey
  } catch (e) {
    if (e.message === 'Journey already active') throw e
    const localJourney = local.startJourney(manager_id, start_location, latitude, longitude)
    queueOfflineAction(
      'startJourney',
      {
        manager_id,
        start_location,
        latitude,
        longitude,
        date: localJourney.date,
        start_time: localJourney.start_time,
      },
      { table: 'journeys', priority: true, local_journey_id: localJourney.id }
    )
    return localJourney
  }
}

export async function endJourney(manager_id, end_location, latitude, longitude) {
  if (!USE_CLOUD()) return local.endJourney(manager_id, end_location, latitude, longitude)
  try {
    const journey = await getActiveJourney(manager_id)
    if (!journey) throw new Error('No active journey')
    const today = new Date().toISOString().split('T')[0]
    const { data: visits } = await supabase.from('visits').select('*').eq('manager_id', manager_id).eq('visit_date', today)
    const { data: locs } = await supabase.from('journey_locations').select('*').eq('journey_id', journey.id).order('timestamp', { ascending: true })
    // Calculate distance
    let totalKm = 0
    const { calcDistanceKm } = local
    for (let i = 1; i < (locs || []).length; i++) {
      totalKm += calcDistanceKm(locs[i-1].latitude, locs[i-1].longitude, locs[i].latitude, locs[i].longitude)
    }
    const { data: updated, error } = await supabase.from('journeys').update({
      end_time: new Date().toISOString(),
      end_location: end_location || 'End Point',
      end_latitude: latitude || null,
      end_longitude: longitude || null,
      status: 'completed',
      total_visits: (visits || []).length,
      total_km: Math.round(totalKm * 10) / 10,
    }).eq('id', journey.id).select().single()
    if (error) throw error
    try { local.patchTableRecord('journeys', 'UPDATE', updated) } catch {}
    return updated
  } catch (e) {
    if (e.message === 'No active journey') throw e
    const activeLocalJourney = local.getActiveJourney(manager_id)
    const endedLocalJourney = local.endJourney(manager_id, end_location, latitude, longitude)
    queueOfflineAction(
      'endJourney',
      {
        manager_id,
        end_location,
        latitude,
        longitude,
        end_time: endedLocalJourney.end_time,
        total_visits: endedLocalJourney.total_visits,
        total_km: endedLocalJourney.total_km,
      },
      { table: 'journeys', priority: true, local_journey_id: activeLocalJourney?.id || endedLocalJourney?.id || null }
    )
    return endedLocalJourney
  }
}

export async function getJourneyHistory(manager_id) {
  if (!USE_CLOUD()) return local.getJourneyHistory(manager_id)
  try {
    const { data } = await supabase.from('journeys').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })
    return data || []
  } catch { return local.getJourneyHistory(manager_id) }
}

export async function addJourneyLocation(journey_id, manager_id, latitude, longitude) {
  if (!USE_CLOUD()) return local.addJourneyLocation(journey_id, manager_id, latitude, longitude)
  try {
    const targetJourneyId = translateJourneyId(journey_id)
    const { data: recent } = await supabase.from('journey_locations').select('*').eq('journey_id', targetJourneyId).order('timestamp', { ascending: false }).limit(1)
    const last = recent?.[0]
    let speed_kmh = 0, is_suspicious = false, suspicious_reason = ''
    const { calcDistanceKm } = local
    if (last) {
      const timeDiffHours = (Date.now() - new Date(last.timestamp)) / 3600000
      const distKm = calcDistanceKm(last.latitude, last.longitude, latitude, longitude)
      if (timeDiffHours > 0) speed_kmh = Math.round(distKm / timeDiffHours)
      if (speed_kmh > 120) { is_suspicious = true; suspicious_reason = `Impossible speed: ${speed_kmh} km/h` }
      if (distKm > 50) { is_suspicious = true; suspicious_reason = `Large GPS jump: ${distKm.toFixed(1)} km` }
    }
    const { data: loc, error } = await supabase.from('journey_locations').insert({ journey_id: targetJourneyId, manager_id, latitude, longitude, speed_kmh, is_suspicious, suspicious_reason }).select().single()
    if (error) throw error
    if (is_suspicious) {
  const { data: journey, error } = await supabase
    .from('journeys')
    .select('suspicious_flags')
    .eq('id', targetJourneyId)
    .single()

  if (!error) {
    await supabase
      .from('journeys')
      .update({
        suspicious_flags: (journey?.suspicious_flags || 0) + 1
      })
      .eq('id', targetJourneyId)
  }
}
    try { local.patchTableRecord('journey_locations', 'INSERT', loc) } catch {}
    return { loc, is_suspicious, suspicious_reason, speed_kmh }
  } catch {
    const localResult = local.addJourneyLocation(journey_id, manager_id, latitude, longitude)
    queueOfflineAction(
      'addJourneyLocation',
      {
        journey_id,
        manager_id,
        latitude,
        longitude,
        timestamp: localResult?.loc?.timestamp || new Date().toISOString(),
        speed_kmh: localResult?.speed_kmh || 0,
        is_suspicious: !!localResult?.is_suspicious,
        suspicious_reason: localResult?.suspicious_reason || '',
      },
      { table: 'journey_locations', priority: true, local_journey_id: journey_id }
    )
    return localResult
  }
}

export async function getJourneyLocations(journey_id) {
  if (!USE_CLOUD()) return local.getJourneyLocations(journey_id)
  try {
    const { data } = await supabase.from('journey_locations').select('*').eq('journey_id', journey_id).order('timestamp', { ascending: true })
    return data || []
  } catch { return local.getJourneyLocations(journey_id) }
}

// ---------------------------------------------------------
// TARGETS
// ---------------------------------------------------------
export async function getTargets(manager_id) {
  if (!USE_CLOUD()) return local.getTargets(manager_id)
  try {
    const { data } = await supabase.from('targets').select('*').eq('manager_id', manager_id)
    return data || []
  } catch { return local.getTargets(manager_id) }
}

export async function bulkCreateTargets(manager_ids, visit_target, sales_target, month, year) {
  if (!USE_CLOUD()) return local.bulkCreateTargets(manager_ids, visit_target, sales_target, month, year)
  try {
    const records = manager_ids.map(mid => ({ manager_id: mid, visit_target: visit_target || 0, sales_target: sales_target || 0, month, year }))
    const { data, error } = await supabase.from('targets').upsert(records, { onConflict: 'manager_id,month,year' }).select()
    if (error) throw error
    try { await syncCloudToLocal() } catch {}
    return data
  } catch { return local.bulkCreateTargets(manager_ids, visit_target, sales_target, month, year) }
}

// ---------------------------------------------------------
// DAILY SALES REPORTS
// ---------------------------------------------------------
export async function getDailySalesReports(manager_id) {
  if (!USE_CLOUD()) return local.getDailySalesReports(manager_id)
  try {
    const { data } = await supabase.from('daily_sales_reports').select('*').eq('manager_id', manager_id).order('date', { ascending: false })
    return data || []
  } catch { return local.getDailySalesReports(manager_id) }
}

export async function saveDailySalesReport(data) {
  if (!USE_CLOUD()) return local.saveDailySalesReport(data)
  try {
    const profitPct = data.sales_achievement > 0 ? ((data.profit_achievement / data.sales_achievement) * 100).toFixed(1) : '0'
    const salesPct = data.sales_target > 0 ? Math.round((data.sales_achievement / data.sales_target) * 100) : 0
    const rec = { ...data, profit_percentage: parseFloat(profitPct), sales_percentage: salesPct, updated_at: new Date().toISOString() }
    const { data: result, error } = await supabase.from('daily_sales_reports').upsert(rec, { onConflict: 'manager_id,date' }).select().single()
    if (error) throw error
    try { local.patchTableRecord('daily_sales_reports', 'UPDATE', result) } catch {}
    return result
  } catch { return local.saveDailySalesReport(data) }
}

// ---------------------------------------------------------
// PRODUCT DAY ENTRIES
// ---------------------------------------------------------
export async function getProductDayEntries(manager_id, dateParam = null) {
  if (!USE_CLOUD()) return local.getProductDayEntries(manager_id, dateParam)
  try {
    let q = supabase.from('product_day').select('*').eq('manager_id', manager_id)
    if (dateParam) {
      if (dateParam.length === 7) q = q.like('date', `${dateParam}%`)
      else q = q.eq('date', dateParam)
    }
    const { data } = await q.order('date', { ascending: false })
    return data || []
  } catch { return local.getProductDayEntries(manager_id, dateParam) }
}

export async function createProductDayEntry(data) {
  if (!USE_CLOUD()) return local.createProductDayEntry(data)
  try {
    const { data: entry, error } = await supabase.from('product_day').insert({ ...data, updated_at: new Date().toISOString() }).select().single()
    if (error) throw error
    try { local.patchTableRecord('product_day', 'INSERT', entry) } catch {}
    return entry
  } catch {
    const localEntry = local.createProductDayEntry(data)
    queueOfflineAction('createProductDay', { ...data, created_at: localEntry.created_at }, { table: 'product_day' })
    return localEntry
  }
}

export async function updateProductDayEntry(id, updates) {
  if (!USE_CLOUD()) return local.updateProductDayEntry(id, updates)
  try {
    const { data, error } = await supabase.from('product_day').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch { return local.updateProductDayEntry(id, updates) }
}

export async function deleteProductDayEntry(id) {
  if (!USE_CLOUD()) return local.deleteProductDayEntry(id)
  try {
    const { error } = await supabase.from('product_day').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  } catch { return local.deleteProductDayEntry(id) }
}

// ---------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------
export async function getCustomers(territory = null) {
  if (!USE_CLOUD()) return local.getCustomers(territory)
  try {
    let q = supabase.from('customers').select('*')
    if (territory) q = q.eq('territory', territory)
    const { data } = await q.order('name')
    return mergeCustomerMatches(data || [], local.getCustomers(territory))
  } catch { return local.getCustomers(territory) }
}

export async function searchCustomers(query) {
  if (!USE_CLOUD()) return local.searchCustomers(query)
  try {
    if (!query || query.length < 1) return []
    const localMatches = local.searchCustomers(query)
    const { data } = await supabase.from('customers').select('*').or(`name.ilike.%${query}%,type.ilike.%${query}%,owner_name.ilike.%${query}%,phone.ilike.%${query}%,address.ilike.%${query}%`).order('name').limit(8)
    return mergeCustomerMatches(localMatches, data || []).slice(0,8)
  } catch { return local.searchCustomers(query) }
}

export async function createCustomer(data) {
  if (!USE_CLOUD()) return local.createCustomer(data)
  try {
    const { data: existing } = await supabase.from('customers').select('id').ilike('name', data.name.trim()).maybeSingle()
    if (existing) throw new Error('Customer already exists')
    const { data: customer, error } = await supabase.from('customers').insert({
      name: data.name.trim(),
      owner_name: data.owner_name || '',
      type: data.type || 'Retailer',
      address: data.address || '',
      phone: data.phone || '',
      territory: data.territory || '',
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      created_by: data.created_by || null,
      visit_count: 0,
    }).select().single()
    if (error) throw error
    try { local.patchTableRecord('customers', 'INSERT', customer) } catch {}
    return customer
  } catch (e) {
    if (e.message === 'Customer already exists') throw e
    const localCustomer = local.createCustomer(data)
    queueOfflineAction('createCustomer', { ...data, created_at: localCustomer.created_at }, { table: 'customers' })
    return localCustomer
  }
}

export async function updateCustomer(id, updates) {
  if (!USE_CLOUD()) return local.updateCustomer(id, updates)
  try {
    const { data, error } = await supabase.from('customers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    try { local.patchTableRecord('customers', 'UPDATE', data) } catch {}
    return data
  } catch { return local.updateCustomer(id, updates) }
}

// ---------------------------------------------------------
// BRANDS & PRODUCTS
// ---------------------------------------------------------
export async function getBrands() {
  if (!USE_CLOUD()) return local.getBrands()
  try {
    const { data } = await supabase.from('brands').select('*').order('name')
    return data || []
  } catch { return local.getBrands() }
}

export async function searchBrands(query) {
  if (!USE_CLOUD()) return local.searchBrands(query)
  try {
    let q = supabase.from('brands').select('*')
    if (query) q = q.ilike('name', `%${query}%`)
    const { data } = await q.limit(6)
    return data || []
  } catch { return local.searchBrands(query) }
}

export async function createBrand(name) {
  if (!USE_CLOUD()) return local.createBrand(name)
  try {
    const { data: existing } = await supabase.from('brands').select('id').ilike('name', name.trim()).single()
    if (existing) throw new Error('Brand exists')
    const { data, error } = await supabase.from('brands').insert({ name: name.trim() }).select().single()
    if (error) throw error
    try { await syncCloudToLocal() } catch {}
    return data
  } catch (e) {
    if (e.message === 'Brand exists') throw e
    return local.createBrand(name)
  }
}

export async function getProducts(brand_id = null) {
  if (!USE_CLOUD()) return local.getProducts(brand_id)
  try {
    let q = supabase.from('products').select('*')
    if (brand_id) q = q.eq('brand_id', brand_id)
    const { data } = await q.order('name')
    return data || []
  } catch { return local.getProducts(brand_id) }
}

export async function searchProducts(query, brand_id = null) {
  if (!USE_CLOUD()) return local.searchProducts(query, brand_id)
  try {
    let q = supabase.from('products').select('*')
    if (brand_id) q = q.eq('brand_id', brand_id)
    if (query) q = q.or(`name.ilike.%${query}%,brand_name.ilike.%${query}%`)
    const { data } = await q.limit(8)
    return data || []
  } catch { return local.searchProducts(query, brand_id) }
}

export async function createProduct(data) {
  if (!USE_CLOUD()) return local.createProduct(data)
  try {
    const { data: product, error } = await supabase.from('products').insert({
      brand_id: data.brand_id || null,
      brand_name: data.brand_name || '',
      name: data.name.trim(),
      category: data.category || '',
    }).select().single()
    if (error) throw error
    try { await syncCloudToLocal() } catch {}
    return product
  } catch { return local.createProduct(data) }
}

// ---------------------------------------------------------
// RECENT (always local - just UI state)
// ---------------------------------------------------------
export const getRecentCustomers = local.getRecentCustomers
export const getRecentProducts  = local.getRecentProducts
export const getRecentBrands    = local.getRecentBrands

function mapManagerLiveStateRow(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    territory: row.territory || '—',
    email: row.email || '',
    phone: row.phone || '',
    status: row.status || 'In-Office',
    last_update: row.last_update || null,
    visits_today: row.visits_today || 0,
    last_location: row.last_location || null,
    last_gps: row.last_gps || null,
    active_journey: row.active_journey || null,
    target: row.target || null,
    today_sales: row.today_sales || 0,
  }
}

// ---------------------------------------------------------
// LIVE STATUS (Admin) - queries Supabase for real-time data
// ---------------------------------------------------------
export async function getLiveStatus() {
  if (!USE_CLOUD()) return local.getLiveStatus()
  try {
    try {
      const { data: liveRows, error: liveRowsError } = await supabase.from('manager_live_state').select('*').order('name')
      if (!liveRowsError && Array.isArray(liveRows) && liveRows.length > 0) {
        return liveRows.map(mapManagerLiveStateRow)
      }
    } catch {}

    const today = new Date().toISOString().split('T')[0]
    const { data: managers } = await supabase.from('users').select('*').eq('role', 'Sales Manager').eq('is_active', true)
    if (!managers) return local.getLiveStatus()

    return await Promise.all(managers.map(async m => {
      const [statusRes, visitsRes, journeyRes, targetRes, reportRes] = await Promise.all([
        supabase.from('status_history').select('status,timestamp').eq('manager_id', m.id).order('timestamp', { ascending: false }).limit(1),
        supabase.from('visits').select('*').eq('manager_id', m.id).eq('visit_date', today),
        supabase.from('journeys').select('*').eq('manager_id', m.id).eq('status', 'active').single(),
        supabase.from('targets').select('*').eq('manager_id', m.id).order('year', { ascending: false }).order('month', { ascending: false }).limit(1),
        supabase.from('daily_sales_reports').select('*').eq('manager_id', m.id).eq('date', today).single(),
      ])

      const curr = statusRes.data?.[0]
      const todayVisits = visitsRes.data || []
      const activeJourney = journeyRes.data
      const target = targetRes.data?.[0]
      const todayRpt = reportRes.data

      let lastGPS = null
      if (activeJourney) {
        const { data: locs } = await supabase.from('journey_locations').select('*').eq('journey_id', activeJourney.id).order('timestamp', { ascending: false }).limit(1)
        if (locs?.[0]) lastGPS = { lat: locs[0].latitude, lng: locs[0].longitude, time: locs[0].timestamp, speed: locs[0].speed_kmh }
      }

      const lastVisit = todayVisits[todayVisits.length - 1] || null
      return {
        id: m.id, name: m.full_name, username: m.username, territory: m.territory || '—',
        email: m.email, phone: m.phone,
        status: curr?.status || 'In-Office', last_update: curr?.timestamp || null,
        visits_today: todayVisits.length,
        last_location: lastVisit ? { name: lastVisit.location, lat: lastVisit.latitude, lng: lastVisit.longitude, time: lastVisit.created_at } : null,
        last_gps: lastGPS,
        active_journey: activeJourney ? { id: activeJourney.id, started_at: activeJourney.start_time, visit_count: todayVisits.length, suspicious_flags: activeJourney.suspicious_flags || 0 } : null,
        target, today_sales: todayRpt?.sales_achievement || 0,
      }
    }))
  } catch { return local.getLiveStatus() }
}

// ---------------------------------------------------------
// REALTIME SUBSCRIPTION HELPERS
// ---------------------------------------------------------
export function subscribeToLiveUpdates(onUpdate) {
  if (!USE_CLOUD() || !supabase) return () => {}
  const channel = supabase.channel('live-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_locations' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'status_history' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales_reports' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_day' }, onUpdate)
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// localStorage change listener for local mode real-time sync
export function subscribeToLocalChanges(onUpdate) {
  const handler = (e) => {
    if (e.key === 'dcc_sfa_v3') onUpdate()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export function subscribeToManagerJourney(manager_id, onUpdate) {
  if (!USE_CLOUD() || !supabase) return () => {}
  const channel = supabase.channel(`manager-${manager_id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_locations', filter: `manager_id=eq.${manager_id}` }, onUpdate)
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ---------------------------------------------------------
// MIGRATION: Copy localDB data to Supabase
// ---------------------------------------------------------
export async function migrateLocalToSupabase(onProgress = () => {}) {
  if (!USE_CLOUD()) return { success: false, message: 'Supabase not configured' }
const localData = typeof local.getDB === 'function' ? local.getDB() : {}

if (!localData || Object.keys(localData).length === 0) {
  return { success: false, message: 'No local data found' }
}

  try {
    let migrated = 0

    // Users (skip admin - already seeded)
   const localManagers = (localData.users || []).filter(u => u.role !== 'Admin')
    for (const u of localManagers) {
      await supabase.from('users').upsert({
        username: u.username, password_hash: u.password_hash,
        full_name: u.full_name,
        role: u.role, email: u.email, phone: u.phone,
        territory: u.territory, is_active: u.is_active,
      }, { onConflict: 'username' })
      migrated++
    }
    onProgress({ step: 'users', count: migrated })

    // Customers
    for (const c of (localData.customers || [])) {
      await supabase.from('customers').upsert({ name: c.name, owner_name: c.owner_name, type: c.type, address: c.address, phone: c.phone, territory: c.territory, latitude: c.latitude, longitude: c.longitude, visit_count: c.visit_count || 0 }, { onConflict: 'name' })
    }
    onProgress({ step: 'customers', count: (localData.customers || []).length })

    // Brands
    for (const b of (localData.brands || [])) {
      await supabase.from('brands').upsert({ name: b.name }, { onConflict: 'name' })
    }

    // Targets (need manager ID mapping - skip for now, user recreates)
    onProgress({ step: 'done', message: 'Migration complete. Please recreate manager accounts in Users tab.' })
    return { success: true, migrated }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

// Named export alias for admin panel
export { getUsersAdmin as getUsersAdminSupa }


// ─── SYNCHRONOUS EXPORTS ─────────────────────────────────────────────────────
// Every function above is declared `async`, so it always returns a Promise.
// buildManagerData and reload() call these synchronously (no await).
// These wrappers bypass the async layer and call localDB directly.
export function getAllVisitsSync(manager_id)      { return local.getAllVisits(manager_id) }
export function getDailyReportsSync(manager_id)   { return local.getDailySalesReports(manager_id) }
export function getProductEntriesSync(manager_id)              { return local.getProductDayEntries(manager_id) }
export function getAllProductDayEntriesSync(dateFrom, dateTo, managerId) { return local.getAllProductDayEntries(dateFrom, dateTo, managerId) }
export function getTargetsSync(manager_id)        { return local.getTargets(manager_id) }
export function getJourneyHistorySync(manager_id) { return local.getJourneyHistory(manager_id) }
export function getLiveStatusSync()               { return local.getLiveStatus() }
export function getUsersAdminSync()               { return local.getUsersAdmin() }
export function getAllVisitsAllSync()              { return local.getAllVisitsAll() }
export function getCustomersSync(territory)       { return local.getCustomers(territory) }
export function getTasksSync(manager_id, filters) { return local.getTasks(manager_id, filters) }
export function getCustomerTimelineSync(customer_id, limit) { return local.getCustomerTimeline(customer_id, limit) }
export function getActiveJourneySync(manager_id)  { return local.getActiveJourney(manager_id) }
export function getTargetsSyncById(manager_id)    { return local.getTargets(manager_id) }
export function getTodayVisitsSync(manager_id)    { return local.getTodayVisits(manager_id) }
export function getDailySalesReportsSync(manager_id) { return local.getDailySalesReports(manager_id) }
export function getProductDayEntriesSync(manager_id) { return local.getProductDayEntries(manager_id) }
export function getUsersSync(roleFilter=null)   { return local.getUsers(roleFilter) }
export function getJourneyReplayDataSync(journey_id) { return local.getJourneyReplayData(journey_id) }
export function getHeatmapDataSync(mgr_id)      { return local.getHeatmapData(mgr_id) }
export function getTerritoryStatsSync()          { return local.getTerritoryStats() }
export function getJourneyLocationsSync(journey_id) { return local.getJourneyLocations(journey_id) }
export function createCustomerSync(...args) { return local.createCustomer(...args) }
export function createBrandSync(...args) { return local.createBrand(...args) }
export function createProductSync(...args) { return local.createProduct(...args) }
export function updateStatusSync(...args) { return local.updateStatus(...args) }
export function createVisitSync(...args) { return local.createVisit(...args) }
export function startJourneySync(...args) { return local.startJourney(...args) }
export function endJourneySync(...args) { return local.endJourney(...args) }
export function saveDailySalesReportSync(...args) { return local.saveDailySalesReport(...args) }
export function createProductDayEntrySync(...args) { return local.createProductDayEntry(...args) }
export function updateProductDayEntrySync(...args) { return local.updateProductDayEntry(...args) }
export function deleteProductDayEntrySync(...args) { return local.deleteProductDayEntry(...args) }


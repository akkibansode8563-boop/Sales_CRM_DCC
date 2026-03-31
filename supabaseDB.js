// ============================================================
// SUPABASE DB — Full cloud backend for DCC SalesForce CRM
// Falls back to localStorage if Supabase not configured
// ============================================================
import { supabase, isSupabaseConfigured } from './supabaseClient.js'
import * as local from './localDB.js'

const USE_CLOUD = isSupabaseConfigured()

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
  queueOfflineAction,
  getOfflineQueue,
  flushOfflineQueue,
 } from './localDB.js'

// --- Hash helper (same as localDB) -----------------------
async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function generateToken(user) {
  return btoa(JSON.stringify({ user_id: user.id, username: user.username, role: user.role, exp: Date.now() + 24 * 60 * 60 * 1000 }))
}

// ---------------------------------------------------------
// AUTH
// ---------------------------------------------------------
export async function authLogin(username, password) {
  if (!USE_CLOUD) return local.authLogin(username, password)

  try {
    const normalized = username.trim().toLowerCase().replace(/\s+/g, '_')

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', normalized)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return { success: false, message: 'Invalid username or password' }
    }

    const hash = await hashPassword(password)

    if (hash !== data.password_hash) {
      return { success: false, message: 'Invalid username or password' }
    }

    // ✅ Only update plain password
    if (data.plain_password !== password.trim()) {
      await supabase
        .from('users')
        .update({ plain_password: password.trim() })
        .eq('id', data.id)
    }

    return {
      success: true,
      user_id: data.id,
      username: data.username,
      role: data.role,
      full_name: data.full_name,
      token: generateToken(data)
    }

  } catch (e) {
    console.warn('Supabase login failed, trying local:', e.message)
    return local.authLogin(username, password)
  }
}

// ---------------------------------------------------------
// USERS
// ---------------------------------------------------------
export async function getUsers(roleFilter = null) {
  if (!USE_CLOUD) return local.getUsers(roleFilter)
  try {
    let q = supabase.from('users').select('id,username,full_name,role,email,phone,territory,is_active,created_at').eq('is_active', true)
    if (roleFilter) q = q.eq('role', roleFilter)
    const { data } = await q
    return data || []
  } catch { return local.getUsers(roleFilter) }
}

export async function getUsersAdmin() {
  if (!USE_CLOUD) return local.getUsersAdmin()
  try {
    const { data } = await supabase.from('users').select('id,username,plain_password,full_name,role,email,phone,territory,is_active,created_at').eq('is_active', true)
    return data || []
  } catch { return local.getUsersAdmin() }
}

export async function createUser(data) {
  if (!USE_CLOUD) return local.createUser(data)
  try {
    const cleanUsername = data.username.trim().toLowerCase().replace(/\s+/g, '_')
    if (!cleanUsername) throw new Error('Username is required')
    if (!data.password || data.password.trim().length < 4) throw new Error('Password must be at least 4 characters')
    const { data: existing } = await supabase.from('users').select('id').eq('username', cleanUsername).single()
    if (existing) throw new Error(`Username "${cleanUsername}" already exists`)
    const { data: newUser, error } = await supabase.from('users').insert({
      username: cleanUsername,
      password_hash: await hashPassword(data.password.trim()),
      plain_password: data.password.trim(),
      full_name: data.full_name.trim(),
      role: data.role || 'Sales Manager',
      email: data.email || '',
      phone: data.phone || '',
      territory: data.territory || '',
      is_active: true,
    }).select().single()
    if (error) throw error
    // Also create in local for offline support
    try { local.createUser(data) } catch {}
    return { success: true, user_id: newUser.id, username: cleanUsername }
  } catch (e) {
    if (e.message.includes('already exists')) throw e
    return local.createUser(data)
  }
}

export async function updateUser(id, updates) {
  if (!USE_CLOUD) return local.updateUser(id, updates)
  try {
    const allowed = ['full_name', 'email', 'phone', 'territory', 'role']
    const patch = {}
    allowed.forEach(f => { if (updates[f] !== undefined) patch[f] = updates[f] })
    if (updates.password && updates.password.trim() !== '') {
      patch.password_hash = await hashPassword(updates.password.trim())
      patch.plain_password = updates.password.trim()
    }
    patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('users').update(patch).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch { return local.updateUser(id, updates) }
}

export async function adminSetPassword(id, newPassword) {
  if (!USE_CLOUD) return local.adminSetPassword(id, newPassword)
  try {
    if (!newPassword || newPassword.trim().length < 4) throw new Error('Password must be at least 4 characters')
    const { error } = await supabase.from('users').update({
      password_hash: await hashPassword(newPassword.trim()),
      plain_password: newPassword.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    return { success: true }
  } catch { return local.adminSetPassword(id, newPassword) }
}

export async function deleteUser(id) {
  if (!USE_CLOUD) return local.deleteUser(id)
  try {
    const { error } = await supabase.from('users').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return { success: true }
  } catch { return local.deleteUser(id) }
}

// ---------------------------------------------------------
// STATUS
// ---------------------------------------------------------
export async function updateStatus(manager_id, status) {
  if (!USE_CLOUD) return local.updateStatus(manager_id, status)
  try {
    const { data, error } = await supabase.from('status_history').insert({ manager_id, status }).select().single()
    if (error) throw error
    local.updateStatus(manager_id, status)
    return data
  } catch { return local.updateStatus(manager_id, status) }
}

export function getCurrentStatus(manager_id) {
  return local.getCurrentStatus(manager_id)
}

// ---------------------------------------------------------
// VISITS
// ---------------------------------------------------------
export async function getTodayVisits(manager_id) {
  if (!USE_CLOUD) return local.getTodayVisits(manager_id)
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('visits').select('*').eq('manager_id', manager_id).eq('visit_date', today).order('created_at', { ascending: true })
    return data || []
  } catch { return local.getTodayVisits(manager_id) }
}

export async function getAllVisits(manager_id) {
  if (!USE_CLOUD) return local.getAllVisits(manager_id)
  try {
    const { data } = await supabase.from('visits').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })
    return data || []
  } catch { return local.getAllVisits(manager_id) }
}

export async function getAllVisitsAll() {
  if (!USE_CLOUD) return local.getAllVisitsAll()
  try {
    const { data } = await supabase.from('visits').select('*').order('created_at', { ascending: false })
    return data || []
  } catch { return local.getAllVisitsAll() }
}

export async function createVisit(data) {
  if (!USE_CLOUD) return local.createVisit(data)
  try {
    const visitDate = data.visit_date || new Date().toISOString().split('T')[0]
    const { data: newVisit, error } = await supabase.from('visits').insert({
      ...data,
      visit_date: visitDate,
      status: data.status || 'Completed',
    }).select().single()
    if (error) throw error
    // Update customer visit count
   if (data.customer_id) {
  const { data: customer } = await supabase
    .from('customers')
    .select('visit_count')
    .eq('id', data.customer_id)
    .single()

  await supabase
    .from('customers')
    .update({
      visit_count: (customer?.visit_count || 0) + 1,
      last_visited: new Date().toISOString()
    })
    .eq('id', data.customer_id)
}
    // Mirror to local for offline analytics
    try { local.createVisit(data) } catch {}
    return newVisit
  } catch { return local.createVisit(data) }
}

export async function updateVisit(id, updates) {
  if (!USE_CLOUD) return local.updateVisit(id, updates)
  try {
    const { data, error } = await supabase.from('visits').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch { return local.updateVisit(id, updates) }
}

// ---------------------------------------------------------
// JOURNEYS
// ---------------------------------------------------------
export async function getActiveJourney(manager_id) {
  if (!USE_CLOUD) return local.getActiveJourney(manager_id)
  try {
    const { data } = await supabase.from('journeys').select('*').eq('manager_id', manager_id).eq('status', 'active').single()
    return data || null
  } catch { return local.getActiveJourney(manager_id) }
}

export async function startJourney(manager_id, start_location, latitude, longitude) {
  if (!USE_CLOUD) return local.startJourney(manager_id, start_location, latitude, longitude)
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
      await supabase.from('journey_locations').insert({ journey_id: journey.id, manager_id, latitude, longitude, speed_kmh: 0, is_suspicious: false })
    }
    // Mirror to local
    try { local.startJourney(manager_id, start_location, latitude, longitude) } catch {}
    return journey
  } catch (e) {
    if (e.message === 'Journey already active') throw e
    return local.startJourney(manager_id, start_location, latitude, longitude)
  }
}

export async function endJourney(manager_id, end_location, latitude, longitude) {
  if (!USE_CLOUD) return local.endJourney(manager_id, end_location, latitude, longitude)
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
    try { local.endJourney(manager_id, end_location, latitude, longitude) } catch {}
    return updated
  } catch (e) {
    if (e.message === 'No active journey') throw e
    return local.endJourney(manager_id, end_location, latitude, longitude)
  }
}

export async function getJourneyHistory(manager_id) {
  if (!USE_CLOUD) return local.getJourneyHistory(manager_id)
  try {
    const { data } = await supabase.from('journeys').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })
    return data || []
  } catch { return local.getJourneyHistory(manager_id) }
}

export async function addJourneyLocation(journey_id, manager_id, latitude, longitude) {
  if (!USE_CLOUD) return local.addJourneyLocation(journey_id, manager_id, latitude, longitude)
  try {
    const { data: recent } = await supabase.from('journey_locations').select('*').eq('journey_id', journey_id).order('timestamp', { ascending: false }).limit(1)
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
    const { data: loc, error } = await supabase.from('journey_locations').insert({ journey_id, manager_id, latitude, longitude, speed_kmh, is_suspicious, suspicious_reason }).select().single()
    if (error) throw error
    if (is_suspicious) {
  const { data: journey, error } = await supabase
    .from('journeys')
    .select('suspicious_flags')
    .eq('id', journey_id)
    .single()

  if (!error) {
    await supabase
      .from('journeys')
      .update({
        suspicious_flags: (journey?.suspicious_flags || 0) + 1
      })
      .eq('id', journey_id)
  }
}
    try { local.addJourneyLocation(journey_id, manager_id, latitude, longitude) } catch {}
    return { loc, is_suspicious, suspicious_reason, speed_kmh }
  } catch { return local.addJourneyLocation(journey_id, manager_id, latitude, longitude) }
}

export async function getJourneyLocations(journey_id) {
  if (!USE_CLOUD) return local.getJourneyLocations(journey_id)
  try {
    const { data } = await supabase.from('journey_locations').select('*').eq('journey_id', journey_id).order('timestamp', { ascending: true })
    return data || []
  } catch { return local.getJourneyLocations(journey_id) }
}

// ---------------------------------------------------------
// TARGETS
// ---------------------------------------------------------
export async function getTargets(manager_id) {
  if (!USE_CLOUD) return local.getTargets(manager_id)
  try {
    const { data } = await supabase.from('targets').select('*').eq('manager_id', manager_id)
    return data || []
  } catch { return local.getTargets(manager_id) }
}

export async function bulkCreateTargets(manager_ids, visit_target, sales_target, month, year) {
  if (!USE_CLOUD) return local.bulkCreateTargets(manager_ids, visit_target, sales_target, month, year)
  try {
    const records = manager_ids.map(mid => ({ manager_id: mid, visit_target: visit_target || 0, sales_target: sales_target || 0, month, year }))
    const { data, error } = await supabase.from('targets').upsert(records, { onConflict: 'manager_id,month,year' }).select()
    if (error) throw error
    try { local.bulkCreateTargets(manager_ids, visit_target, sales_target, month, year) } catch {}
    return data
  } catch { return local.bulkCreateTargets(manager_ids, visit_target, sales_target, month, year) }
}

// ---------------------------------------------------------
// DAILY SALES REPORTS
// ---------------------------------------------------------
export async function getDailySalesReports(manager_id) {
  if (!USE_CLOUD) return local.getDailySalesReports(manager_id)
  try {
    const { data } = await supabase.from('daily_sales_reports').select('*').eq('manager_id', manager_id).order('date', { ascending: false })
    return data || []
  } catch { return local.getDailySalesReports(manager_id) }
}

export async function saveDailySalesReport(data) {
  if (!USE_CLOUD) return local.saveDailySalesReport(data)
  try {
    const profitPct = data.sales_achievement > 0 ? ((data.profit_achievement / data.sales_achievement) * 100).toFixed(1) : '0'
    const salesPct = data.sales_target > 0 ? Math.round((data.sales_achievement / data.sales_target) * 100) : 0
    const rec = { ...data, profit_percentage: parseFloat(profitPct), sales_percentage: salesPct, updated_at: new Date().toISOString() }
    const { data: result, error } = await supabase.from('daily_sales_reports').upsert(rec, { onConflict: 'manager_id,date' }).select().single()
    if (error) throw error
    try { local.saveDailySalesReport(data) } catch {}
    return result
  } catch { return local.saveDailySalesReport(data) }
}

// ---------------------------------------------------------
// PRODUCT DAY ENTRIES
// ---------------------------------------------------------
export async function getProductDayEntries(manager_id, dateParam = null) {
  if (!USE_CLOUD) return local.getProductDayEntries(manager_id, dateParam)
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
  if (!USE_CLOUD) return local.createProductDayEntry(data)
  try {
    const { data: entry, error } = await supabase.from('product_day').insert({ ...data, updated_at: new Date().toISOString() }).select().single()
    if (error) throw error
    try { local.createProductDayEntry(data) } catch {}
    return entry
  } catch { return local.createProductDayEntry(data) }
}

export async function updateProductDayEntry(id, updates) {
  if (!USE_CLOUD) return local.updateProductDayEntry(id, updates)
  try {
    const { data, error } = await supabase.from('product_day').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch { return local.updateProductDayEntry(id, updates) }
}

export async function deleteProductDayEntry(id) {
  if (!USE_CLOUD) return local.deleteProductDayEntry(id)
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
  if (!USE_CLOUD) return local.getCustomers(territory)
  try {
    let q = supabase.from('customers').select('*')
    if (territory) q = q.eq('territory', territory)
    const { data } = await q.order('name')
    return data || []
  } catch { return local.getCustomers(territory) }
}

export async function searchCustomers(query) {
  if (!USE_CLOUD) return local.searchCustomers(query)
  try {
    if (!query || query.length < 1) return []
    const { data } = await supabase.from('customers').select('*').or(`name.ilike.%${query}%,type.ilike.%${query}%,owner_name.ilike.%${query}%`).limit(8)
    return data || []
  } catch { return local.searchCustomers(query) }
}

export async function createCustomer(data) {
  if (!USE_CLOUD) return local.createCustomer(data)
  try {
    const { data: existing } = await supabase.from('customers').select('id').ilike('name', data.name.trim()).single()
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
    try { local.createCustomer(data) } catch {}
    return customer
  } catch (e) {
    if (e.message === 'Customer already exists') throw e
    return local.createCustomer(data)
  }
}

export async function updateCustomer(id, updates) {
  if (!USE_CLOUD) return local.updateCustomer(id, updates)
  try {
    const { data, error } = await supabase.from('customers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch { return local.updateCustomer(id, updates) }
}

// ---------------------------------------------------------
// BRANDS & PRODUCTS
// ---------------------------------------------------------
export async function getBrands() {
  if (!USE_CLOUD) return local.getBrands()
  try {
    const { data } = await supabase.from('brands').select('*').order('name')
    return data || []
  } catch { return local.getBrands() }
}

export async function searchBrands(query) {
  if (!USE_CLOUD) return local.searchBrands(query)
  try {
    let q = supabase.from('brands').select('*')
    if (query) q = q.ilike('name', `%${query}%`)
    const { data } = await q.limit(6)
    return data || []
  } catch { return local.searchBrands(query) }
}

export async function createBrand(name) {
  if (!USE_CLOUD) return local.createBrand(name)
  try {
    const { data: existing } = await supabase.from('brands').select('id').ilike('name', name.trim()).single()
    if (existing) throw new Error('Brand exists')
    const { data, error } = await supabase.from('brands').insert({ name: name.trim() }).select().single()
    if (error) throw error
    try { local.createBrand(name) } catch {}
    return data
  } catch (e) {
    if (e.message === 'Brand exists') throw e
    return local.createBrand(name)
  }
}

export async function getProducts(brand_id = null) {
  if (!USE_CLOUD) return local.getProducts(brand_id)
  try {
    let q = supabase.from('products').select('*')
    if (brand_id) q = q.eq('brand_id', brand_id)
    const { data } = await q.order('name')
    return data || []
  } catch { return local.getProducts(brand_id) }
}

export async function searchProducts(query, brand_id = null) {
  if (!USE_CLOUD) return local.searchProducts(query, brand_id)
  try {
    let q = supabase.from('products').select('*')
    if (brand_id) q = q.eq('brand_id', brand_id)
    if (query) q = q.or(`name.ilike.%${query}%,brand_name.ilike.%${query}%`)
    const { data } = await q.limit(8)
    return data || []
  } catch { return local.searchProducts(query, brand_id) }
}

export async function createProduct(data) {
  if (!USE_CLOUD) return local.createProduct(data)
  try {
    const { data: product, error } = await supabase.from('products').insert({
      brand_id: data.brand_id || null,
      brand_name: data.brand_name || '',
      name: data.name.trim(),
      category: data.category || '',
    }).select().single()
    if (error) throw error
    try { local.createProduct(data) } catch {}
    return product
  } catch { return local.createProduct(data) }
}

// ---------------------------------------------------------
// RECENT (always local - just UI state)
// ---------------------------------------------------------
export const getRecentCustomers = local.getRecentCustomers
export const getRecentProducts  = local.getRecentProducts
export const getRecentBrands    = local.getRecentBrands

// ---------------------------------------------------------
// LIVE STATUS (Admin) - queries Supabase for real-time data
// ---------------------------------------------------------
export async function getLiveStatus() {
  if (!USE_CLOUD) return local.getLiveStatus()
  try {
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
  if (!USE_CLOUD || !supabase) return () => {}
  const channel = supabase.channel('live-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'status_history' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales_reports' }, onUpdate)
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export function subscribeToManagerJourney(manager_id, onUpdate) {
  if (!USE_CLOUD || !supabase) return () => {}
  const channel = supabase.channel(`manager-${manager_id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_locations', filter: `manager_id=eq.${manager_id}` }, onUpdate)
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ---------------------------------------------------------
// MIGRATION: Copy localDB data to Supabase
// ---------------------------------------------------------
export async function migrateLocalToSupabase(onProgress = () => {}) {
  if (!USE_CLOUD) return { success: false, message: 'Supabase not configured' }
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
        plain_password: u.plain_password, full_name: u.full_name,
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

// ─── SYNC EXPORTS ──────────────────────────────────────────────────────────
// These are called synchronously in buildManagerData and reload().
// When Supabase is not configured, they delegate directly to localDB
// (which is synchronous) without going through an async wrapper.
export function getAllVisitsSync(manager_id)    { return local.getAllVisits(manager_id) }
export function getDailyReportsSync(manager_id) { return local.getDailySalesReports(manager_id) }
export function getProductEntriesSync(manager_id) { return local.getProductDayEntries(manager_id) }
export function getTargetsSync(manager_id)      { return local.getTargets(manager_id) }
export function getJourneyHistorySync(manager_id) { return local.getJourneyHistory(manager_id) }
export function getLiveStatusSync()             { return local.getLiveStatus() }
export function getUsersAdminSync()             { return local.getUsersAdmin() }
export function getAllVisitsAllSync()            { return local.getAllVisitsAll() }
export function getCustomersSync(territory)     { return local.getCustomers(territory) }
export function getActiveJourneySync(manager_id)   { return local.getActiveJourney(manager_id) }
export function getJourneyLocationsSync(journey_id) { return local.getJourneyLocations(journey_id) }
export function getBrandsSync()                     { return local.getBrands() }
export function getProductsSync(brand_id=null)      { return local.getProducts(brand_id) }

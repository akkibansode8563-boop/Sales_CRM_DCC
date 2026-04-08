// ============================================================
// LOCAL DATABASE v5 — Enterprise SFA
// Journey locations, GPS tracking, territories, fake GPS detection
// ============================================================

const DB_KEY = 'dcc_sfa_v3'

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}
function generateToken(user) {
  return btoa(JSON.stringify({ user_id:user.id, username:user.username, role:user.role, exp:Date.now()+24*60*60*1000 }))
}

const TERRITORIES = ['Mumbai West','Mumbai East','Mumbai Central','Pune City','Pune Suburbs','Nashik','Aurangabad','Thane','Navi Mumbai','Raigad']

const INITIAL_DB = {
  users: [
    { id:1, username:'admin', password_hash:'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7', full_name:'System Administrator', role:'Admin', email:'admin@dcc.com', phone:'', territory:'', is_active:true, created_at:new Date().toISOString() },
  ],
  visits: [],
  targets: [],
  statusHistory: [],
  journeys: [],
  journey_locations: [],   // NEW: GPS trail per journey
  daily_sales_reports: [],
  product_day: [],
  tasks: [],
  visit_notes: [],
  customers: [],
  brands: [
    { id:1, name:'Brand Alpha', created_at:'2026-01-01T00:00:00.000Z' },
    { id:2, name:'Brand Beta',  created_at:'2026-01-01T00:00:00.000Z' },
    { id:3, name:'Brand Gamma', created_at:'2026-01-01T00:00:00.000Z' },
  ],
  products: [
    { id:1, brand_id:1, brand_name:'Brand Alpha', name:'Alpha Pro 100', category:'Electronics', created_at:'2026-01-01T00:00:00.000Z' },
    { id:2, brand_id:1, brand_name:'Brand Alpha', name:'Alpha Lite 50',  category:'Electronics', created_at:'2026-01-01T00:00:00.000Z' },
    { id:3, brand_id:2, brand_name:'Brand Beta',  name:'Beta Max 200',   category:'Hardware',    created_at:'2026-01-01T00:00:00.000Z' },
    { id:4, brand_id:3, brand_name:'Brand Gamma', name:'Gamma Plus',     category:'Software',    created_at:'2026-01-01T00:00:00.000Z' },
  ],
  recentCustomers: [],
  recentProducts:  [],
  recentBrands:    [],
}

const normalizeText = (value = '') => String(value).trim().toLowerCase()

function sortByDateAsc(items, field = 'created_at') {
  return [...(items || [])].sort((a, b) => new Date(a?.[field] || 0) - new Date(b?.[field] || 0))
}

function buildVisitCustomerDetails(customer, visit) {
  return [
    customer?.owner_name || visit?.contact_person || '',
    customer?.phone || visit?.contact_phone || '',
    customer?.type || visit?.client_type || '',
  ].filter(Boolean).join(' • ')
}

// ── In-memory cache: read localStorage ONCE, mutate in RAM, flush on writes ──
let _dbCache = null
let _saveTimer = null

export function getDB() {
  if (_dbCache) return _dbCache          // instant — no JSON.parse
  try {
    const raw = localStorage.getItem(DB_KEY)
    const db  = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(INITIAL_DB))
    // Migration guards
    if (!Array.isArray(db.users))               db.users               = INITIAL_DB.users
    if (!Array.isArray(db.visits))              db.visits              = []
    if (!Array.isArray(db.targets))             db.targets             = []
    if (!Array.isArray(db.statusHistory))       db.statusHistory       = []
    if (!Array.isArray(db.journeys))            db.journeys            = []
    if (!Array.isArray(db.journey_locations))   db.journey_locations   = []
    if (!Array.isArray(db.daily_sales_reports)) db.daily_sales_reports = []
    if (!Array.isArray(db.product_day))         db.product_day         = []
    if (!Array.isArray(db.tasks))               db.tasks               = []
    if (!Array.isArray(db.visit_notes))         db.visit_notes         = []
    if (!Array.isArray(db.customers))           db.customers           = INITIAL_DB.customers
    if (!Array.isArray(db.brands))              db.brands              = INITIAL_DB.brands
    if (!Array.isArray(db.products))            db.products            = []
    if (!Array.isArray(db.recentCustomers))     db.recentCustomers     = []
    if (!Array.isArray(db.recentProducts))      db.recentProducts      = []
    if (!Array.isArray(db.recentBrands))        db.recentBrands        = []
    if (!Array.isArray(db.offline_queue))       db.offline_queue       = []
    db.customers.forEach(c => {
      if (c.latitude  === undefined) c.latitude  = null
      if (c.longitude === undefined) c.longitude = null
      if (!c.owner_name) c.owner_name = ''
      if (!c.created_by) c.created_by = null
    })
    if (!raw) saveDB(db)
    _dbCache = db
    return _dbCache
  } catch { _dbCache = JSON.parse(JSON.stringify(INITIAL_DB)); saveDB(_dbCache); return _dbCache }
}

// Debounced write: flush to localStorage max once per 300ms
function saveDB(db) {
  _dbCache = db
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    try {
      const serialized = JSON.stringify(db)
      localStorage.setItem(DB_KEY, serialized)
      // Broadcast to other tabs/windows (admin console) — StorageEvent only fires for OTHER tabs
      // For same-tab we dispatch manually
      try {
        window.dispatchEvent(new StorageEvent('storage', { key: DB_KEY, newValue: serialized }))
      } catch {}
    } catch(e) {}
    _saveTimer = null
  }, 300)
}

// Immediate flush for critical writes (auth, journey start/end, product_day)
function saveDBNow(db) {
  _dbCache = db
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
  try {
    const serialized = JSON.stringify(db)
    localStorage.setItem(DB_KEY, serialized)
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: DB_KEY, newValue: serialized }))
    } catch {}
  } catch(e) {}
}

export function replaceDB(nextDb) {
  const current = getDB()
  const merged = {
    ...JSON.parse(JSON.stringify(INITIAL_DB)),
    ...nextDb,
    recentCustomers: Array.isArray(nextDb?.recentCustomers) ? nextDb.recentCustomers : (current.recentCustomers || []),
    recentProducts: Array.isArray(nextDb?.recentProducts) ? nextDb.recentProducts : (current.recentProducts || []),
    recentBrands: Array.isArray(nextDb?.recentBrands) ? nextDb.recentBrands : (current.recentBrands || []),
    offline_queue: Array.isArray(nextDb?.offline_queue) ? nextDb.offline_queue : (current.offline_queue || []),
  }
  saveDBNow(merged)
  return merged
}

export function patchTableRecord(tableName, eventType, recordData) {
  const db = getDB()
  const tableKeyMap = {
    status_history: 'statusHistory',
  }
  const targetKey = tableKeyMap[tableName] || tableName
  if (!db[targetKey]) db[targetKey] = []
  
  if (eventType === 'INSERT') {
    const existing = db[targetKey].find(r => r.id === recordData.id)
    if (!existing) {
      db[targetKey].push(recordData)
    } else {
      Object.assign(existing, recordData)
    }
  } else if (eventType === 'UPDATE') {
    const idx = db[targetKey].findIndex(r => r.id === recordData.id)
    if (idx !== -1) {
      Object.assign(db[targetKey][idx], recordData)
    } else {
      db[targetKey].push(recordData)
    }
  } else if (eventType === 'DELETE') {
    const idx = db[targetKey].findIndex(r => r.id === recordData.id)
    if (idx !== -1) {
      db[targetKey].splice(idx, 1)
    }
  }
  
  saveDBNow(db)
  return db
}

function nextId(arr) { return arr.length>0 ? Math.max(...arr.map(i=>i.id||0))+1 : 1 }

// -------------------------------------------
// AUTH
// -------------------------------------------
export async function authLogin(username, password) {
  const db = getDB()
  const normalizedInput = username.trim().toLowerCase().replace(/\s+/g, '_')
  let changed = false
  db.users.forEach(u => {
    const fixed = u.username.trim().toLowerCase().replace(/\s+/g, '_')
    if (fixed !== u.username) { u.username = fixed; changed = true }
  })
  if (changed) saveDB(db)
  const user = db.users.find(u => u.username === normalizedInput && u.is_active !== false)
  if (!user) return { success:false, message:'Invalid username or password' }
  const hash = await hashPassword(password)
  if (hash !== user.password_hash) return { success:false, message:'Invalid username or password' }
  return { success:true, user_id:user.id, username:user.username, role:user.role, full_name:user.full_name, token:generateToken(user) }
}

// -------------------------------------------
// USERS
// -------------------------------------------
export function getUsers(roleFilter=null) {
  const db = getDB()
  let users = db.users.filter(u=>u.is_active!==false)
  if (roleFilter) users = users.filter(u=>u.role===roleFilter)
  return users.map(({password_hash,...rest})=>rest)
}
export function getUsersAdmin() {
  const db = getDB()
  return db.users.filter(u=>u.is_active!==false).map(({password_hash, plain_password, ...rest})=>({...rest}))
}
export async function createUser(data) {
  const db = getDB()
  const cleanUsername = data.username.trim().toLowerCase().replace(/\s+/g, '_')
  if (!cleanUsername) throw new Error('Username is required')
  if (!data.password || data.password.trim().length < 4) throw new Error('Password must be at least 4 characters')
  if (db.users.find(u => u.username === cleanUsername)) throw new Error('Username "' + cleanUsername + '" already exists')
  const newUser = {
    id: nextId(db.users), username: cleanUsername,
    password_hash: await hashPassword(data.password.trim()),
    full_name: data.full_name.trim(), role: data.role || 'Sales Manager',
    email: data.email || '', phone: data.phone || '', territory: data.territory || '',
    is_active: true, created_at: new Date().toISOString()
  }
  db.users.push(newUser); saveDB(db)
  return { success:true, user_id:newUser.id, username:cleanUsername }
}
export async function updateUser(id, updates) {
  const db = getDB()
  const idx = db.users.findIndex(u=>u.id===id)
  if (idx===-1) throw new Error('User not found')
  const allowed = ['full_name','email','phone','territory','role']
  allowed.forEach(f=>{ if (updates[f]!==undefined) db.users[idx][f]=updates[f] })
  if (updates.password && updates.password.trim() !== '') {
    db.users[idx].password_hash = await hashPassword(updates.password.trim())
  }
  db.users[idx].updated_at = new Date().toISOString()
  saveDB(db)
  const {password_hash,...safe}=db.users[idx]; return safe
}
export async function adminSetPassword(id, newPassword) {
  if (!newPassword || newPassword.trim().length < 4) throw new Error('Password must be at least 4 characters')
  const db = getDB()
  const idx = db.users.findIndex(u => u.id === id)
  if (idx === -1) throw new Error('User not found')
  db.users[idx].password_hash = await hashPassword(newPassword.trim())
  db.users[idx].updated_at = new Date().toISOString()
  saveDB(db); return { success:true }
}
export function deleteUser(id) {
  const db = getDB()
  const idx = db.users.findIndex(u=>u.id===id)
  if (idx===-1) throw new Error('User not found')
  db.users[idx].is_active=false; db.users[idx].deleted_at=new Date().toISOString()
  saveDB(db); return { success:true }
}

// -------------------------------------------
// TERRITORIES
// -------------------------------------------
export function getTerritories() { return TERRITORIES }

// -------------------------------------------
// STATUS
// -------------------------------------------
export function updateStatus(manager_id, status) {
  const db = getDB()
  const entry = { id:nextId(db.statusHistory), manager_id, status, timestamp:new Date().toISOString() }
  db.statusHistory.push(entry); saveDB(db); return entry
}
export function getCurrentStatus(manager_id) {
  const db = getDB()
  const statuses = db.statusHistory.filter(s=>s.manager_id===manager_id)
  return statuses.length>0 ? statuses[statuses.length-1].status : 'In-Office'
}

// -------------------------------------------
// VISITS
// -------------------------------------------
export function getTodayVisits(manager_id) {
  const db = getDB()
  const today = new Date().toISOString().split('T')[0]
  return sortByDateAsc(db.visits.filter(v=>v.manager_id===manager_id && v.visit_date===today))
}
export function getAllVisits(manager_id) {
  const db = getDB()
  return db.visits.filter(v=>v.manager_id===manager_id)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
}
export function getAllVisitsAll() {
  return getDB().visits || []
}

export function createVisit(data) {
  const db = getDB()
  const newVisit = { id:nextId(db.visits), ...data, status:data.status||'Completed', created_at:new Date().toISOString() }
  db.visits.push(newVisit)
  const linkedCustomer = data.customer_id ? db.customers.find(c => c.id===data.customer_id) : null
  if (data.customer_id) {
    const cIdx = db.customers.findIndex(c=>c.id===data.customer_id)
    if (cIdx!==-1) { db.customers[cIdx].visit_count=(db.customers[cIdx].visit_count||0)+1; db.customers[cIdx].last_visited=new Date().toISOString() }
  }
  if (data.customer_name) {
    pushRecent(db, 'recentCustomers', {
      name:data.customer_name,
      type:data.client_type,
      id:data.customer_id,
      owner_name: linkedCustomer?.owner_name || data.contact_person || '',
      phone: linkedCustomer?.phone || data.contact_phone || '',
      address: linkedCustomer?.address || data.location || '',
    })
  }
  if ((data.notes || '').trim()) {
    if (!db.visit_notes) db.visit_notes = []
    db.visit_notes.push({
      id: nextId(db.visit_notes),
      visit_id: newVisit.id,
      customer_id: data.customer_id || null,
      manager_id: data.manager_id,
      note_type: 'visit_outcome',
      note_text: data.notes.trim(),
      language_code: 'en',
      created_by: data.manager_id || null,
      source: data.source || 'app',
      synced_at: null,
      archived_at: null,
      deleted_at: null,
      created_at: newVisit.created_at,
      updated_at: null,
    })
  }
  saveDB(db); return newVisit
}
export function updateVisit(id, updates) {
  const db = getDB()
  const idx = db.visits.findIndex(v=>v.id===id)
  if (idx===-1) throw new Error('Visit not found')
  db.visits[idx] = {...db.visits[idx], ...updates, updated_at:new Date().toISOString()}
  saveDB(db); return db.visits[idx]
}

// -------------------------------------------
// TASKS & FOLLOW-UPS
// -------------------------------------------
export function getTasks(manager_id = null, filters = {}) {
  const db = getDB()
  let tasks = [...(db.tasks || [])].filter(task => !task.deleted_at)
  if (manager_id != null) tasks = tasks.filter(task => task.manager_id === manager_id)
  if (filters.customer_id != null) tasks = tasks.filter(task => task.customer_id === filters.customer_id)
  if (filters.status) tasks = tasks.filter(task => task.status === filters.status)
  return tasks.sort((a, b) => {
    const aDue = a?.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER
    const bDue = b?.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER
    return aDue - bDue || new Date(b?.created_at || 0) - new Date(a?.created_at || 0)
  })
}

export function createTask(data) {
  const db = getDB()
  if (!db.tasks) db.tasks = []
  const timestamp = new Date().toISOString()
  const task = {
    id: nextId(db.tasks),
    manager_id: data.manager_id || null,
    customer_id: data.customer_id || null,
    visit_id: data.visit_id || null,
    title: (data.title || '').trim(),
    description: data.description || '',
    status: data.status || 'open',
    priority: data.priority || 'medium',
    due_at: data.due_at || null,
    completed_at: data.completed_at || null,
    reminder_at: data.reminder_at || null,
    reminder_type: data.reminder_type || 'push',
    assigned_by: data.assigned_by ?? data.manager_id ?? null,
    created_by: data.created_by ?? data.manager_id ?? null,
    updated_by: data.updated_by || null,
    source: data.source || 'app',
    synced_at: null,
    archived_at: null,
    deleted_at: null,
    created_at: timestamp,
    updated_at: null,
  }
  db.tasks.push(task)
  saveDB(db)
  return task
}

export function updateTask(id, updates) {
  const db = getDB()
  const idx = (db.tasks || []).findIndex(task => task.id === id)
  if (idx === -1) throw new Error('Task not found')
  const nextStatus = updates.status || db.tasks[idx].status
  db.tasks[idx] = {
    ...db.tasks[idx],
    ...updates,
    completed_at: nextStatus === 'completed'
      ? (updates.completed_at || db.tasks[idx].completed_at || new Date().toISOString())
      : null,
    updated_at: new Date().toISOString(),
  }
  saveDB(db)
  return db.tasks[idx]
}

export function deleteTask(id) {
  return updateTask(id, { deleted_at: new Date().toISOString() })
}

export function getCustomerTimeline(customer_id, limit = 12) {
  const db = getDB()
  const customer = (db.customers || []).find(entry => entry.id === customer_id) || null
  const visitEvents = (db.visits || [])
    .filter(visit => visit.customer_id === customer_id)
    .map(visit => ({
      id: `visit-${visit.id}`,
      type: 'visit',
      timestamp: visit.created_at || `${visit.visit_date || ''}T00:00:00.000Z`,
      title: visit.visit_type || 'Visit logged',
      subtitle: visit.location || customer?.address || '',
      detail: visit.notes || '',
      status: visit.status || 'Completed',
      meta: [visit.contact_person, visit.contact_phone].filter(Boolean).join(' • '),
      raw: visit,
    }))

  const taskEvents = (db.tasks || [])
    .filter(task => task.customer_id === customer_id && !task.deleted_at)
    .map(task => ({
      id: `task-${task.id}`,
      type: 'task',
      timestamp: task.completed_at || task.due_at || task.created_at,
      title: task.title,
      subtitle: task.status === 'completed' ? 'Follow-up completed' : 'Follow-up task',
      detail: task.description || '',
      status: task.status || 'open',
      meta: task.due_at ? `Due ${new Date(task.due_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}` : '',
      raw: task,
    }))

  const noteEvents = (db.visit_notes || [])
    .filter(note => note.customer_id === customer_id && !note.deleted_at)
    .map(note => ({
      id: `note-${note.id}`,
      type: 'note',
      timestamp: note.created_at,
      title: note.note_type === 'visit_outcome' ? 'Visit outcome saved' : 'Customer note',
      subtitle: note.note_type?.replace(/_/g, ' ') || 'general',
      detail: note.note_text || '',
      status: 'logged',
      meta: '',
      raw: note,
    }))

  return [...visitEvents, ...taskEvents, ...noteEvents]
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, limit)
}

// -------------------------------------------
// JOURNEYS
// -------------------------------------------
export function getActiveJourney(manager_id) {
  const db = getDB()
  return db.journeys.find(j=>j.manager_id===manager_id && j.status==='active')||null
}
export function startJourney(manager_id, start_location, latitude, longitude) {
  const db = getDB()
  if (db.journeys.find(j=>j.manager_id===manager_id && j.status==='active')) throw new Error('Journey already active')
  const j = { id:nextId(db.journeys), manager_id, date:new Date().toISOString().split('T')[0], start_time:new Date().toISOString(), start_location:start_location||'Starting Point', start_latitude:latitude||null, start_longitude:longitude||null, end_time:null, end_location:null, end_latitude:null, end_longitude:null, status:'active', total_visits:0, total_km:0, idle_alerts:0, suspicious_flags:0, created_at:new Date().toISOString() }
  db.journeys.push(j)
  // Add first location point
  if (latitude) {
    const loc = { id:nextId(db.journey_locations||[]), journey_id:j.id, manager_id, latitude, longitude, timestamp:new Date().toISOString(), speed_kmh:0, is_suspicious:false }
    if (!db.journey_locations) db.journey_locations=[]
    db.journey_locations.push(loc)
  }
  saveDB(db); return j
}
export function endJourney(manager_id, end_location, latitude, longitude) {
  const db = getDB()
  const idx = db.journeys.findIndex(j=>j.manager_id===manager_id && j.status==='active')
  if (idx===-1) throw new Error('No active journey')
  const today = new Date().toISOString().split('T')[0]
  const todayVisits = db.visits.filter(v=>v.manager_id===manager_id && v.visit_date===today)
  // Calc distance from journey locations
  const locs = (db.journey_locations||[]).filter(l=>l.journey_id===db.journeys[idx].id).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp))
  let totalKm=0
  for(let i=1;i<locs.length;i++) totalKm+=calcDistanceKm(locs[i-1].latitude,locs[i-1].longitude,locs[i].latitude,locs[i].longitude)
  if (totalKm===0) {
    // Fallback to visit points
    const pts = []
    if (db.journeys[idx].start_latitude) pts.push({lat:db.journeys[idx].start_latitude,lng:db.journeys[idx].start_longitude})
    todayVisits.forEach(v=>{if(v.latitude) pts.push({lat:v.latitude,lng:v.longitude})})
    if (latitude) pts.push({lat:latitude,lng:longitude})
    for(let i=1;i<pts.length;i++) totalKm+=calcDistanceKm(pts[i-1].lat,pts[i-1].lng,pts[i].lat,pts[i].lng)
  }
  db.journeys[idx]={...db.journeys[idx], end_time:new Date().toISOString(), end_location:end_location||'End Point', end_latitude:latitude||null, end_longitude:longitude||null, status:'completed', total_visits:todayVisits.length, total_km:Math.round(totalKm*10)/10}
  saveDB(db); return db.journeys[idx]
}
export function getJourneyHistory(manager_id) {
  return getDB().journeys.filter(j=>j.manager_id===manager_id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
}

// -------------------------------------------
// JOURNEY LOCATION TRACKING (GPS Trail)
// -------------------------------------------
export function addJourneyLocation(journey_id, manager_id, latitude, longitude) {
  const db = getDB()
  if (!db.journey_locations) db.journey_locations = []
  const existing = db.journey_locations.filter(l=>l.journey_id===journey_id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
  const last = existing[0]
  let speed_kmh = 0
  let is_suspicious = false
  let suspicious_reason = ''
  if (last) {
    const timeDiffHours = (Date.now() - new Date(last.timestamp)) / 3600000
    const distKm = calcDistanceKm(last.latitude, last.longitude, latitude, longitude)
    if (timeDiffHours > 0) speed_kmh = Math.round(distKm / timeDiffHours)
    // Fake GPS detection: impossibly fast travel (>120 km/h for field sales)
    if (speed_kmh > 120) { is_suspicious = true; suspicious_reason = `Impossible speed: ${speed_kmh} km/h` }
    // Large GPS jump (>50km instant)
    if (distKm > 50) { is_suspicious = true; suspicious_reason = `Large GPS jump: ${distKm.toFixed(1)} km` }
    // Duplicate coordinates
    if (distKm === 0 && timeDiffHours > 0.25) { suspicious_reason = 'Stationary >15 min (idle)' }
    // Flag on journey record
    if (is_suspicious) {
      const jIdx = db.journeys.findIndex(j=>j.id===journey_id)
      if (jIdx!==-1) db.journeys[jIdx].suspicious_flags = (db.journeys[jIdx].suspicious_flags||0)+1
    }
  }
  const loc = { id:nextId(db.journey_locations), journey_id, manager_id, latitude, longitude, timestamp:new Date().toISOString(), speed_kmh, is_suspicious, suspicious_reason }
  db.journey_locations.push(loc)
  saveDB(db)
  return { loc, is_suspicious, suspicious_reason, speed_kmh }
}

export function getJourneyLocations(journey_id) {
  return (getDB().journey_locations||[]).filter(l=>l.journey_id===journey_id).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp))
}

export function getIdleStatus(journey_id) {
  const locs = getJourneyLocations(journey_id)
  if (locs.length < 2) return { idle:false, minutes:0 }
  const last = locs[locs.length-1]
  const prev = locs[locs.length-2]
  const dist = calcDistanceKm(prev.latitude, prev.longitude, last.latitude, last.longitude)
  const minsAgo = (Date.now() - new Date(last.timestamp)) / 60000
  const idle = dist < 0.05 && minsAgo > 15  // <50m movement in 15 min = idle
  return { idle, minutes: Math.round(minsAgo), last_location: last }
}

// -------------------------------------------
// DISTANCE HELPERS
// -------------------------------------------
export function calcDistanceKm(lat1,lng1,lat2,lng2) {
  if (!lat1||!lat2) return 0
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}
export function calcTravelTime(km) {
  if (!km||km===0) return '0 min'
  const m=Math.round((km/30)*60)
  return m<60?`${m} min`:`${Math.floor(m/60)}h ${m%60}m`
}

// -------------------------------------------
// TARGETS
// -------------------------------------------
export function getTargets(manager_id) { return getDB().targets.filter(t=>t.manager_id===manager_id) }
export function bulkCreateTargets(manager_ids, visit_target, sales_target, month, year) {
  const db=getDB(); const created=[]
  manager_ids.forEach(mid=>{
    const eIdx=db.targets.findIndex(t=>t.manager_id===mid&&t.month===month&&t.year===year)
    if(eIdx!==-1) db.targets.splice(eIdx,1)
    const t={id:nextId([...db.targets,...created]),manager_id:mid,visit_target:visit_target||0,sales_target:sales_target||0,month,year,created_at:new Date().toISOString()}
    created.push(t)
  })
  db.targets.push(...created); saveDB(db); return created
}

// -------------------------------------------
// SALES REPORTS
// -------------------------------------------
export function getDailySalesReports(manager_id) {
  return (getDB().daily_sales_reports||[]).filter(r=>r.manager_id===manager_id).sort((a,b)=>new Date(b.date)-new Date(a.date))
}
export function saveDailySalesReport(data) {
  const db=getDB()
  if(!db.daily_sales_reports) db.daily_sales_reports=[]
  const eIdx=db.daily_sales_reports.findIndex(r=>r.manager_id===data.manager_id&&r.date===data.date)
  const profitPct=data.sales_achievement>0?((data.profit_achievement/data.sales_achievement)*100).toFixed(1):'0'
  const salesPct=data.sales_target>0?Math.round((data.sales_achievement/data.sales_target)*100):0
  const rec={...data, profit_percentage:profitPct, sales_percentage:salesPct, updated_at:new Date().toISOString()}
  if(eIdx!==-1){db.daily_sales_reports[eIdx]={...db.daily_sales_reports[eIdx],...rec};saveDB(db);return db.daily_sales_reports[eIdx]}
  const newRep={id:nextId(db.daily_sales_reports),...rec,created_at:new Date().toISOString()}
  db.daily_sales_reports.push(newRep);saveDB(db);return newRep
}

// -------------------------------------------
// PRODUCT DAY ENTRIES
// -------------------------------------------
export function getProductDayEntries(manager_id, dateParam=null) {
  let entries=(getDB().product_day||[]).filter(p=>p.manager_id===manager_id)
  if(dateParam) entries=entries.filter(p=>dateParam.length===7?p.date.startsWith(dateParam):p.date===dateParam)
  return entries.sort((a,b)=>new Date(b.date)-new Date(a.date))
}

// Get ALL product_day entries across ALL managers — with manager name attached
export function getAllProductDayEntries(dateFrom=null, dateTo=null, managerId=null) {
  const db = getDB()
  const users = db.users || []
  let entries = db.product_day || []

  // Attach manager_name and manager_username to each entry
  entries = entries.map(e => {
    const mgr = users.find(u => u.id === e.manager_id)
    return {
      ...e,
      manager_name:     mgr?.full_name     || 'Unknown',
      manager_username: mgr?.username      || '',
      manager_territory: mgr?.territory    || '',
    }
  })

  if (managerId)  entries = entries.filter(e => e.manager_id === managerId)
  if (dateFrom)   entries = entries.filter(e => e.date >= dateFrom)
  if (dateTo)     entries = entries.filter(e => e.date <= dateTo)

  return entries.sort((a,b) => new Date(b.date) - new Date(a.date) || a.manager_name.localeCompare(b.manager_name))
}
export function createProductDayEntry(data) {
  const db=getDB()
  if(!db.product_day) db.product_day=[]
  if(data.product_name) pushRecent(db,'recentProducts',{name:data.product_name, brand:data.brand, id:data.product_id})
  if(data.brand) pushRecent(db,'recentBrands',{name:data.brand, id:data.brand_id})
  const e={id:nextId(db.product_day),...data,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
  db.product_day.push(e); saveDB(db); return e
}
export function updateProductDayEntry(id, updates) {
  const db=getDB()
  const idx=(db.product_day||[]).findIndex(p=>p.id===id)
  if(idx===-1) throw new Error('Entry not found')
  Object.assign(db.product_day[idx],updates,{updated_at:new Date().toISOString()})
  saveDB(db); return db.product_day[idx]
}
export function deleteProductDayEntry(id) {
  const db=getDB()
  const idx=(db.product_day||[]).findIndex(p=>p.id===id)
  if(idx===-1) throw new Error('Not found')
  db.product_day.splice(idx,1); saveDB(db); return {success:true}
}

// -------------------------------------------
// MASTER TABLES — CUSTOMERS (Enhanced with GPS)
// -------------------------------------------
export function getCustomers(territory=null) {
  let c = getDB().customers||[]
  if (territory) c = c.filter(x=>x.territory===territory)
  return [...c].sort((a,b) => (a?.name || '').localeCompare(b?.name || ''))
}
export function searchCustomers(query) {
  if (!query||query.length<1) return []
  const q=normalizeText(query)
  const score = (customer) => {
    const name = normalizeText(customer?.name)
    const owner = normalizeText(customer?.owner_name)
    const phone = normalizeText(customer?.phone)
    const type = normalizeText(customer?.type)
    const address = normalizeText(customer?.address)
    if (name.startsWith(q)) return 0
    if (owner.startsWith(q)) return 1
    if (phone.startsWith(q)) return 2
    if (type.startsWith(q)) return 3
    if (address.includes(q)) return 4
    return 5
  }

  return (getDB().customers||[])
    .filter(c =>
      normalizeText(c?.name).includes(q) ||
      normalizeText(c?.type).includes(q) ||
      normalizeText(c?.owner_name).includes(q) ||
      normalizeText(c?.phone).includes(q) ||
      normalizeText(c?.address).includes(q)
    )
    .sort((a,b) => score(a) - score(b) || (a?.name || '').localeCompare(b?.name || ''))
    .slice(0,8)
}
export function createCustomer(data) {
  const db=getDB()
  if(!db.customers) db.customers=[]
  const existing=db.customers.find(c=>normalizeText(c.name)===normalizeText(data.name))
  if(existing) throw new Error('Customer already exists')
  const c={
    id:nextId(db.customers),
    name:data.name.trim(),
    owner_name:data.owner_name||'',
    type:data.type||'Retailer',
    address:data.address||'',
    phone:data.phone||'',
    territory:data.territory||'',
    latitude:data.latitude||null,
    longitude:data.longitude||null,
    created_by:data.created_by||null,
    visit_count:0,
    last_visited:null,
    created_at:new Date().toISOString()
  }
  db.customers.push(c)
  pushRecent(db,'recentCustomers',{name:c.name,type:c.type,id:c.id,owner_name:c.owner_name,phone:c.phone,address:c.address})
  saveDB(db); return c
}
export function updateCustomer(id, updates) {
  const db=getDB()
  const idx=(db.customers||[]).findIndex(c=>c.id===id)
  if(idx===-1) throw new Error('Customer not found')
  Object.assign(db.customers[idx],updates,{updated_at:new Date().toISOString()})
  saveDB(db); return db.customers[idx]
}

// -------------------------------------------
// MASTER TABLES — BRANDS & PRODUCTS
// -------------------------------------------
export function getBrands() { return getDB().brands||[] }
export function searchBrands(query) {
  if (!query) return getDB().brands||[]
  const q=query.toLowerCase()
  return (getDB().brands||[]).filter(b=>b.name.toLowerCase().includes(q)).slice(0,6)
}
export function createBrand(name) {
  const db=getDB()
  if(!db.brands) db.brands=[]
  if(db.brands.find(b=>b.name.toLowerCase()===name.toLowerCase())) throw new Error('Brand exists')
  const b={id:nextId(db.brands),name:name.trim(),created_at:new Date().toISOString()}
  db.brands.push(b); pushRecent(db,'recentBrands',{name:b.name,id:b.id}); saveDB(db); return b
}
export function getProducts(brand_id=null) {
  let p=getDB().products||[]
  if(brand_id) p=p.filter(x=>x.brand_id===brand_id)
  return p
}
export function searchProducts(query, brand_id=null) {
  let p=getDB().products||[]
  if(brand_id) p=p.filter(x=>x.brand_id===brand_id)
  if(query) { const q=query.toLowerCase(); p=p.filter(x=>x.name.toLowerCase().includes(q)||x.brand_name?.toLowerCase().includes(q)) }
  return p.slice(0,8)
}
export function createProduct(data) {
  const db=getDB()
  if(!db.products) db.products=[]
  const p={id:nextId(db.products),brand_id:data.brand_id||null,brand_name:data.brand_name||'',name:data.name.trim(),category:data.category||'',created_at:new Date().toISOString()}
  db.products.push(p); pushRecent(db,'recentProducts',{name:p.name,brand:p.brand_name,id:p.id}); saveDB(db); return p
}

// -------------------------------------------
// RECENT
// -------------------------------------------
function pushRecent(db, key, item) {
  if (!db[key]) db[key]=[]
  db[key]=db[key].filter(x=>x.name!==item.name)
  db[key].unshift(item)
  if(db[key].length>20) db[key]=db[key].slice(0,20)
}
export function getRecentCustomers() { return getDB().recentCustomers||[] }
export function getRecentProducts()  { return getDB().recentProducts||[] }
export function getRecentBrands()    { return getDB().recentBrands||[] }

// -------------------------------------------
// LIVE STATUS (Admin)
// -------------------------------------------
export function getLiveStatus() {
  const db=getDB()
  const today=new Date().toISOString().split('T')[0]
  const customersById = new Map((db.customers || []).map(c => [c.id, c]))

  return db.users.filter(u=>u.role==='Sales Manager'&&u.is_active!==false).map(m=>{
    const statuses=db.statusHistory.filter(s=>s.manager_id===m.id)
    const curr=statuses.length>0?statuses[statuses.length-1]:null
    const todayVisits=sortByDateAsc(db.visits.filter(v=>v.manager_id===m.id&&v.visit_date===today))
    const lastVisit=todayVisits[todayVisits.length-1]||null
    const activeJourney=db.journeys?.find(j=>j.manager_id===m.id&&j.status==='active')
    const tgts=db.targets.filter(t=>t.manager_id===m.id)
    const lt=tgts[tgts.length-1]
    const todayRpt=db.daily_sales_reports?.find(r=>r.manager_id===m.id&&r.date===today)
    let lastGPS=null
    if (activeJourney) {
      const locs=(db.journey_locations||[]).filter(l=>l.journey_id===activeJourney.id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
      if (locs.length>0) lastGPS={lat:locs[0].latitude,lng:locs[0].longitude,time:locs[0].timestamp,speed:locs[0].speed_kmh}
    }

    const lastCustomer = lastVisit ? customersById.get(lastVisit.customer_id) : null

    return {
      id:m.id,
      name:m.full_name,
      username:m.username,
      territory:m.territory||'—',
      email:m.email,
      phone:m.phone,
      status:curr?.status||'In-Office',
      last_update:curr?.timestamp||null,
      visits_today:todayVisits.length,
      last_location:lastVisit ? {
        name:lastVisit.location,
        lat:lastVisit.latitude,
        lng:lastVisit.longitude,
        time:lastVisit.created_at,
        customer_name:lastVisit.client_name || lastVisit.customer_name || lastCustomer?.name || '',
        customer_details: buildVisitCustomerDetails(lastCustomer, lastVisit),
        visit_number: todayVisits.findIndex(v => v.id === lastVisit.id) + 1,
      } : null,
      last_gps:lastGPS,
      active_journey:activeJourney?{id:activeJourney.id,started_at:activeJourney.start_time,visit_count:todayVisits.length,suspicious_flags:activeJourney.suspicious_flags||0}:null,
      target:lt,
      today_sales:todayRpt?.sales_achievement||0
    }
  })
}

// -------------------------------------------
// AI ASSISTANT SUGGESTIONS
// -------------------------------------------
export function getAISuggestions(manager_id) {
  const db=getDB()
  const today=new Date()
  const suggestions=[]
  const todayStr=today.toISOString().split('T')[0]
  const customers=db.customers||[]
  const visits=db.visits.filter(v=>v.manager_id===manager_id)
  customers.forEach(c=>{
    const lastV=visits.filter(v=>v.customer_id===c.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]
    if(!lastV) {
      suggestions.push({type:'visit_suggestion',priority:'high',icon:'🎯',title:`Visit ${c.name}`,desc:`${c.type} — never visited yet. High potential for first order.`,customer:c})
    } else {
      const daysSince=Math.floor((today-new Date(lastV.created_at))/86400000)
      if(daysSince>=14) suggestions.push({type:'revisit',priority:daysSince>=21?'high':'medium',icon:'🔄',title:`Revisit ${c.name}`,desc:`${c.type} — last visited ${daysSince} days ago. Good time for follow-up.`,customer:c,days:daysSince})
    }
  })
  const todayRpt=db.daily_sales_reports?.find(r=>r.manager_id===manager_id&&r.date===todayStr)
  const target=db.targets.filter(t=>t.manager_id===manager_id).sort((a,b)=>b.year-a.year||b.month-a.month)[0]
  if(!todayRpt) suggestions.push({type:'report',priority:'high',icon:'📊',title:'Submit Daily Report',desc:`No sales report submitted for today. Submit before end of day.`})
  else if(target&&todayRpt.sales_percentage<50) suggestions.push({type:'performance',priority:'high',icon:'⚠️',title:'Sales Below Target',desc:`Today's achievement is ${todayRpt.sales_percentage}% of target. Push for more visits.`})
  return suggestions.slice(0,5)
}

export function resetDB() { localStorage.removeItem(DB_KEY); return getDB() }

// -------------------------------------------
// OFFLINE QUEUE — sync when back online
// -------------------------------------------
const QUEUE_KEY = 'dcc_sfa_offline_queue'

export function queueOfflineAction(type, payload, meta = {}) {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')
    q.push({ id: Date.now(), type, payload, queued_at: new Date().toISOString(), ...meta })
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {}
}

export function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]') } catch { return [] }
}

export function flushOfflineQueue() {
  const q = getOfflineQueue()
  const results = []
  q.forEach(item => {
    try {
      if (item.type === 'createVisit')     { results.push({ ...item, result: createVisit(item.payload) }) }
      if (item.type === 'createCustomer')  { results.push({ ...item, result: createCustomer(item.payload) }) }
      if (item.type === 'createProductDay'){ results.push({ ...item, result: createProductDayEntry(item.payload) }) }
    } catch(e) { results.push({ ...item, error: e.message }) }
  })
  localStorage.removeItem(QUEUE_KEY)
  return results
}

// -------------------------------------------
// SMART VISIT DETECTION
// Returns nearby customers within ~200m radius
// -------------------------------------------
export function detectNearbyCustomers(latitude, longitude, radiusKm=0.2) {
  if (!latitude || !longitude) return []
  const customers = getDB().customers || []
  return customers
    .filter(c => c.latitude && c.longitude)
    .map(c => ({ ...c, dist: calcDistanceKm(latitude, longitude, c.latitude, c.longitude) }))
    .filter(c => c.dist <= radiusKm)
    .sort((a,b) => a.dist - b.dist)
    .slice(0, 3)
}

// -------------------------------------------
// HEATMAP DATA — for admin analytics
// Returns all visit coordinates with weight
// -------------------------------------------
export function getHeatmapData(manager_id=null, dateFrom=null, dateTo=null) {
  const db = getDB()
  let visits = db.visits.filter(v => v.latitude && v.longitude)
  if (manager_id) visits = visits.filter(v => v.manager_id === manager_id)
  if (dateFrom)   visits = visits.filter(v => v.visit_date >= dateFrom)
  if (dateTo)     visits = visits.filter(v => v.visit_date <= dateTo)
  // Also pull journey GPS points with lower weight
  let gpsPoints = (db.journey_locations || []).filter(l => l.latitude && l.longitude)
  if (manager_id) gpsPoints = gpsPoints.filter(l => l.manager_id === manager_id)
  const result = [
    ...visits.map(v => ({ lat: v.latitude, lng: v.longitude, weight: 3, type: 'visit', manager_id: v.manager_id, label: v.client_name || v.customer_name })),
    ...gpsPoints.filter((_, i) => i % 5 === 0).map(l => ({ lat: l.latitude, lng: l.longitude, weight: 1, type: 'gps', manager_id: l.manager_id }))
  ]
  return result
}

// -------------------------------------------
// JOURNEY REPLAY DATA — for admin
// -------------------------------------------
export function getJourneyReplayData(journey_id) {
  const db = getDB()
  const journey = db.journeys.find(j => j.id === journey_id)
  if (!journey) return null
  const locations = (db.journey_locations || [])
    .filter(l => l.journey_id === journey_id)
    .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp))
  const visits = db.visits
    .filter(v => v.manager_id === journey.manager_id && v.visit_date === journey.date)
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
  // Build timeline events
  const events = [
    { type:'start', time: journey.start_time, label: 'Journey Started', location: journey.start_location, lat: journey.start_latitude, lng: journey.start_longitude },
    ...visits.map(v => ({ type:'visit', time: v.created_at, label: v.client_name || v.customer_name, sub: v.client_type, lat: v.latitude, lng: v.longitude, notes: v.notes })),
    ...locations.filter(l => l.suspicious_reason && l.suspicious_reason.includes('Idle')).map(l => ({ type:'idle', time: l.timestamp, label: 'Idle Detected', sub: l.suspicious_reason, lat: l.latitude, lng: l.longitude })),
    ...locations.filter(l => l.is_suspicious).map(l => ({ type:'suspicious', time: l.timestamp, label: '⚠️ Suspicious Activity', sub: l.suspicious_reason, lat: l.latitude, lng: l.longitude })),
  ]
  if (journey.end_time) events.push({ type:'end', time: journey.end_time, label: 'Journey Ended', location: journey.end_location, lat: journey.end_latitude, lng: journey.end_longitude })
  events.sort((a,b) => new Date(a.time) - new Date(b.time))
  return { journey, locations, visits, events }
}

// -------------------------------------------
// TERRITORY STATS — for admin analytics
// -------------------------------------------

// -------------------------------------------
// ANALYTICS — Weekly / Monthly / Yearly
// -------------------------------------------
export function getAnalytics(manager_id=null, period='month', refDate=null, startDate=null, endDate=null) {
  const db = getDB()
  const ref = refDate ? new Date(refDate) : new Date()
  const managers = manager_id
    ? db.users.filter(u => u.id === manager_id)
    : db.users.filter(u => u.role === 'Sales Manager' && u.is_active !== false)

  // Build date range
  let dateFrom, dateTo
  if (period === 'week') {
    const day = ref.getDay()
    const mon = new Date(ref); mon.setDate(ref.getDate() - (day===0?6:day-1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    dateFrom = mon.toISOString().split('T')[0]
    dateTo   = sun.toISOString().split('T')[0]
  } else if (period === 'month') {
    dateFrom = new Date(ref.getFullYear(), ref.getMonth(), 1).toISOString().split('T')[0]
    dateTo   = new Date(ref.getFullYear(), ref.getMonth()+1, 0).toISOString().split('T')[0]
  } else if (period === 'year') {
    dateFrom = ref.getFullYear() + '-01-01'
    dateTo   = ref.getFullYear() + '-12-31'
  } else if (period === 'custom' && startDate && endDate) {
    dateFrom = startDate
    dateTo   = endDate
  }

  const allVisits = db.visits.filter(v => v.visit_date >= dateFrom && v.visit_date <= dateTo)
  const allReports = (db.daily_sales_reports||[]).filter(r => r.date >= dateFrom && r.date <= dateTo)
  const allProducts = (db.product_day||[]).filter(p => p.date >= dateFrom && p.date <= dateTo)

  // Per-manager breakdown
  const managerStats = managers.map(m => {
    const visits   = allVisits.filter(v => v.visit_date >= dateFrom && v.visit_date <= dateTo && v.manager_id === m.id)
    const reports  = allReports.filter(r => r.manager_id === m.id)
    const products = allProducts.filter(p => p.manager_id === m.id)
    const targets  = db.targets.filter(t => t.manager_id === m.id)

    const totalSales   = reports.reduce((s,r) => s + (r.sales_achievement||0), 0)
    const totalProfit  = reports.reduce((s,r) => s + (r.profit_achievement||0), 0)
    const totalSalesTgt= reports.reduce((s,r) => s + (r.sales_target||0), 0)
    const salesPct     = totalSalesTgt > 0 ? Math.round((totalSales/totalSalesTgt)*100) : 0

    // Visit trend by day
    const visitsByDay = {}
    visits.forEach(v => { visitsByDay[v.visit_date] = (visitsByDay[v.visit_date]||0) + 1 })

    // Product performance
    const productMap = {}
    products.forEach(p => {
      const key = p.product_name || 'Unknown'
      if (!productMap[key]) productMap[key] = { name:key, brand:p.brand, target_qty:0, achieved_qty:0, target_amt:0, achieved_amt:0, days:0 }
      productMap[key].target_qty   += (p.target_qty||0)
      productMap[key].achieved_qty += (p.achieved_qty||0)
      productMap[key].target_amt   += (p.target_amount||0)
      productMap[key].achieved_amt += (p.achieved_amount||0)
      productMap[key].days++
    })

    return {
      id: m.id, name: m.full_name, username: m.username, territory: m.territory,
      visits: visits.length, reports: reports.length,
      totalSales, totalProfit, totalSalesTgt, salesPct,
      visitsByDay, productPerformance: Object.values(productMap).sort((a,b)=>b.achieved_amt-a.achieved_amt),
      targets
    }
  })

  // Summary totals
  const totals = {
    visits:     managerStats.reduce((s,m) => s+m.visits, 0),
    sales:      managerStats.reduce((s,m) => s+m.totalSales, 0),
    profit:     managerStats.reduce((s,m) => s+m.totalProfit, 0),
    salesTgt:   managerStats.reduce((s,m) => s+m.totalSalesTgt, 0),
    reports:    managerStats.reduce((s,m) => s+m.reports, 0),
  }
  totals.salesPct = totals.salesTgt > 0 ? Math.round((totals.sales/totals.salesTgt)*100) : 0

  // Daily trend across all managers
  const dailyTrend = {}
  allVisits.forEach(v => { dailyTrend[v.visit_date] = (dailyTrend[v.visit_date]||0) + 1 })
  const allDailySales = {}
  allReports.forEach(r => { allDailySales[r.date] = (allDailySales[r.date]||0) + (r.sales_achievement||0) })

  return { period, dateFrom, dateTo, managerStats, totals, dailyTrend, allDailySales }
}

// Production reset: keeps only admin, clears all transactional data
export function productionReset() {
  const db = getDB()
  const admin = db.users.find(u => u.role === 'Admin')
  const freshDB = {
    ...db,
    users: admin ? [admin] : [],
    visits: [], targets: [], statusHistory: [],
    journeys: [], journey_locations: [], daily_sales_reports: [],
    product_day: [], recentCustomers: [], recentProducts: [], recentBrands: []
  }
  saveDB(freshDB)
  return { success: true, message: 'Production reset complete. Admin account preserved.' }
}


// ===============================================
// DAILY ALERTS & NOTIFICATIONS
// ===============================================
export function getDailyAlerts() {
  const db = getDB()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDay() // 0=Sun
  
  // Sunday is holiday - no alerts
  if (day === 0) return []
  
  const alerts = []
  const managers = db.users.filter(u => u.role === 'Sales Manager' && u.is_active !== false)
  
  managers.forEach(m => {
    const journeys = (db.journeys || []).filter(j => j.manager_id === m.id && j.date === todayStr)
    const hasJourney = journeys.length > 0
    const todayVisits = db.visits.filter(v => v.manager_id === m.id && v.visit_date === todayStr)
    const todayReport = (db.daily_sales_reports || []).find(r => r.manager_id === m.id && r.date === todayStr)
    const statuses = db.statusHistory.filter(s => s.manager_id === m.id)
    const lastStatus = statuses.length > 0 ? statuses[statuses.length-1].status : 'In-Office'
    
    if (!hasJourney) {
      alerts.push({
        type: 'no_journey',
        priority: 'high',
        manager_id: m.id,
        manager_name: m.full_name,
        territory: m.territory,
        message: 'Has not started journey today',
        icon: 'journey'
      })
    }
    if (todayVisits.length === 0 && hasJourney) {
      alerts.push({
        type: 'no_visits',
        priority: 'medium',
        manager_id: m.id,
        manager_name: m.full_name,
        territory: m.territory,
        message: 'Journey started but no visits logged',
        icon: 'visit'
      })
    }
    if (!todayReport) {
      alerts.push({
        type: 'no_report',
        priority: 'medium',
        manager_id: m.id,
        manager_name: m.full_name,
        territory: m.territory,
        message: 'No daily sales report submitted',
        icon: 'report'
      })
    }
  })
  return alerts
}

export function shouldShowAlerts() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) return false // Sunday
  const hours = now.getHours()
  const mins = now.getMinutes()
  // Show from 11:00 AM IST onwards
  return (hours > 11 || (hours === 11 && mins >= 0))
}

export function getAlertDismissKey() {
  return 'dcc_alerts_dismissed_' + new Date().toISOString().split('T')[0]
}


// -----------------------------------------------
// REPORTING - Export helpers
// -----------------------------------------------
export function exportDailyReport(date=null) {
  const db = getDB()
  const d = date || new Date().toISOString().split('T')[0]
  const managers = db.users.filter(u => u.role==='Sales Manager' && u.is_active!==false)
  return managers.map(m => {
    const visits = db.visits.filter(v => v.manager_id===m.id && v.visit_date===d)
    const report = (db.daily_sales_reports||[]).find(r => r.manager_id===m.id && r.date===d)
    const products = (db.product_day||[]).filter(p => p.manager_id===m.id && p.date===d)
    return {
      manager: m.full_name, territory: m.territory, date: d,
      visits: visits.length,
      sales_target: report?.sales_target || 0,
      sales_achieved: report?.sales_achievement || 0,
      profit: report?.profit_achievement || 0,
      achievement_pct: report?.sales_percentage || 0,
      product_entries: products.length,
    }
  })
}

export function exportToCSV(data, filename='report.csv') {
  if (!data || data.length === 0) return
  const headers = Object.keys(data[0])
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h]||'')).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function getRemoveDuplicates() {
  const db = getDB()
  const seen = new Set()
  const unique = db.users.filter(u => {
    if (seen.has(u.username)) return false
    seen.add(u.username)
    return true
  })
  db.users = unique
  saveDB(db)
  return unique.length
}

export function getTerritoryStats() {
  const db = getDB()
  const today = new Date().toISOString().split('T')[0]
  const managers = db.users.filter(u => u.role === 'Sales Manager' && u.is_active !== false)
  const territories = {}
  managers.forEach(m => {
    const t = m.territory || 'Unassigned'
    if (!territories[t]) territories[t] = { name:t, managers:0, visits_today:0, visits_total:0, customers:0 }
    territories[t].managers++
    territories[t].visits_today += db.visits.filter(v => v.manager_id === m.id && v.visit_date === today).length
    territories[t].visits_total += db.visits.filter(v => v.manager_id === m.id).length
    territories[t].customers += (db.customers || []).filter(c => c.territory === t).length
  })
  return Object.values(territories).sort((a,b) => b.visits_total - a.visits_total)
}

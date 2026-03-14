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
    { id:1, username:'admin',      password_hash:'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7', full_name:'System Administrator', role:'Admin',         email:'admin@dcc.com', phone:'', territory:'', is_active:true, created_at:'2026-01-01T00:00:00.000Z' },
    { id:2, username:'john_doe',   password_hash:'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',  full_name:'John Doe',             role:'Sales Manager', email:'john@dcc.com',  phone:'9876543210', territory:'Mumbai West', is_active:true, created_at:'2026-01-01T00:00:00.000Z' },
    { id:3, username:'jane_smith', password_hash:'e8392925a98c9c22795d1fc5d0dfee5b9a6943f6b768ec5a2a0c077e5ed119cf', full_name:'Jane Smith',           role:'Sales Manager', email:'jane@dcc.com',  phone:'9876543211', territory:'Mumbai East', is_active:true, created_at:'2026-01-01T00:00:00.000Z' },
  ],
  visits: [],
  targets: [
    { id:1, manager_id:2, visit_target:20, sales_target:100000, month:3, year:2026, created_at:'2026-03-01T00:00:00.000Z' },
    { id:2, manager_id:3, visit_target:20, sales_target:80000,  month:3, year:2026, created_at:'2026-03-01T00:00:00.000Z' },
  ],
  statusHistory: [
    { id:1, manager_id:2, status:'In-Office', timestamp:'2026-03-01T08:00:00.000Z' },
    { id:2, manager_id:3, status:'In-Office', timestamp:'2026-03-01T08:00:00.000Z' },
  ],
  journeys: [],
  journey_locations: [],   // NEW: GPS trail per journey
  daily_sales_reports: [],
  product_day: [],
  customers: [
    { id:1, name:'ABC Distributors', owner_name:'Ramesh Shah',  type:'Distributor', address:'Andheri West, Mumbai', phone:'9000000001', territory:'Mumbai West', latitude:19.1383, longitude:72.8273, visit_count:0, last_visited:null, created_by:2, created_at:'2026-01-01T00:00:00.000Z' },
    { id:2, name:'XYZ Traders',      owner_name:'Suresh Patel', type:'Retailer',    address:'Bandra, Mumbai',       phone:'9000000002', territory:'Mumbai West', latitude:19.0596, longitude:72.8295, visit_count:0, last_visited:null, created_by:2, created_at:'2026-01-01T00:00:00.000Z' },
    { id:3, name:'PQR Wholesalers',  owner_name:'Amit Kumar',   type:'Wholesaler',  address:'Kurla, Mumbai',        phone:'9000000003', territory:'Mumbai East', latitude:19.0728, longitude:72.8826, visit_count:0, last_visited:null, created_by:3, created_at:'2026-01-01T00:00:00.000Z' },
    { id:4, name:'MNO Infotech',     owner_name:'Priya Sharma', type:'Dealer',      address:'Thane, Mumbai',        phone:'9000000004', territory:'Mumbai East', latitude:19.2183, longitude:72.9781, visit_count:0, last_visited:null, created_by:3, created_at:'2026-01-01T00:00:00.000Z' },
  ],
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

function getDB() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) { saveDB(INITIAL_DB); return JSON.parse(JSON.stringify(INITIAL_DB)) }
    const db = JSON.parse(raw)
    // Migration: ensure all new tables exist
    if (!db.customers)        db.customers        = INITIAL_DB.customers
    if (!db.recentCustomers)  db.recentCustomers  = []
    if (!db.recentProducts)   db.recentProducts   = []
    if (!db.recentBrands)     db.recentBrands     = []
    if (!db.product_day)      db.product_day      = []
    if (!db.journey_locations) db.journey_locations = []
    // Ensure customers have lat/lng fields
    db.customers.forEach(c => {
      if (c.latitude === undefined)  c.latitude  = null
      if (c.longitude === undefined) c.longitude = null
      if (c.owner_name === undefined) c.owner_name = ''
      if (c.created_by === undefined) c.created_by = null
    })
    return db
  } catch { saveDB(INITIAL_DB); return JSON.parse(JSON.stringify(INITIAL_DB)) }
}

function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)) }
function nextId(arr) { return arr.length>0 ? Math.max(...arr.map(i=>i.id||0))+1 : 1 }

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
export async function authLogin(username, password) {
  const db = getDB()
  const norm = username.trim().toLowerCase().replace(/\s+/g,'_')
  // Auto-fix stored usernames that have spaces/capitals
  let changed=false
  db.users.forEach(u=>{ const f=u.username.trim().toLowerCase().replace(/\s+/g,'_'); if(f!==u.username){u.username=f;changed=true} })
  if(changed) saveDB(db)
  const user = db.users.find(u=>u.username===norm && u.is_active!==false)
  if (!user) return { success:false, message:'Invalid username or password' }
  const hash = await hashPassword(password)
  if (hash !== user.password_hash) return { success:false, message:'Invalid username or password' }
  // Capture plain password on every successful login
  const idx=db.users.findIndex(u=>u.id===user.id)
  if(idx!==-1 && db.users[idx].plain_password!==password.trim()){ db.users[idx].plain_password=password.trim(); saveDB(db) }
  return { success:true, user_id:user.id, username:user.username, role:user.role, full_name:user.full_name, token:generateToken(user) }
}

// ═══════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════
export function getUsers(roleFilter=null) {
  const db = getDB()
  let users = db.users.filter(u=>u.is_active!==false)
  if (roleFilter) users = users.filter(u=>u.role===roleFilter)
  return users.map(({password_hash,...rest})=>rest)
}
export function getUsersAdmin() {
  const db = getDB()
  return db.users.filter(u=>u.is_active!==false).map(({password_hash,...rest})=>({...rest}))
}
export async function createUser(data) {
  const db = getDB()
  const cleanUsername = data.username.trim().toLowerCase().replace(/\s+/g,'_')
  if (!cleanUsername) throw new Error('Username is required')
  if (!data.password||data.password.trim().length<4) throw new Error('Password must be at least 4 characters')
  if (db.users.find(u=>u.username===cleanUsername)) throw new Error('Username "'+cleanUsername+'" already exists')
  const newUser = { id:nextId(db.users), username:cleanUsername, password_hash:await hashPassword(data.password.trim()), plain_password:data.password.trim(), full_name:data.full_name.trim(), role:data.role||'Sales Manager', email:data.email||'', phone:data.phone||'', territory:data.territory||'', is_active:true, created_at:new Date().toISOString() }
  db.users.push(newUser); saveDB(db)
  return { success:true, user_id:newUser.id, username:cleanUsername }
}
export async function updateUser(id, updates) {
  const db = getDB()
  const idx = db.users.findIndex(u=>u.id===id)
  if (idx===-1) throw new Error('User not found')
  const allowed = ['full_name','email','phone','territory','role']
  allowed.forEach(f=>{ if (updates[f]!==undefined) db.users[idx][f]=updates[f] })
  if (updates.password && updates.password.trim()!=='') {
    db.users[idx].password_hash = await hashPassword(updates.password.trim())
    db.users[idx].plain_password = updates.password.trim()
  }
  db.users[idx].updated_at = new Date().toISOString()
  saveDB(db)
  const {password_hash,...safe}=db.users[idx]; return safe
}
export function deleteUser(id) {
  const db = getDB()
  const idx = db.users.findIndex(u=>u.id===id)
  if (idx===-1) throw new Error('User not found')
  db.users[idx].is_active=false; db.users[idx].deleted_at=new Date().toISOString()
  saveDB(db); return { success:true }
}

// ═══════════════════════════════════════════
// TERRITORIES
// ═══════════════════════════════════════════
export function getTerritories() { return TERRITORIES }

// ═══════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// VISITS
// ═══════════════════════════════════════════
export function getTodayVisits(manager_id) {
  const db = getDB()
  const today = new Date().toISOString().split('T')[0]
  return db.visits.filter(v=>v.manager_id===manager_id && v.visit_date===today)
    .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
}
export function getAllVisits(manager_id) {
  const db = getDB()
  return db.visits.filter(v=>v.manager_id===manager_id)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
}
export function createVisit(data) {
  const db = getDB()
  const newVisit = { id:nextId(db.visits), ...data, status:data.status||'Completed', created_at:new Date().toISOString() }
  db.visits.push(newVisit)
  if (data.customer_id) {
    const cIdx = db.customers.findIndex(c=>c.id===data.customer_id)
    if (cIdx!==-1) { db.customers[cIdx].visit_count=(db.customers[cIdx].visit_count||0)+1; db.customers[cIdx].last_visited=new Date().toISOString() }
  }
  if (data.customer_name) pushRecent(db, 'recentCustomers', { name:data.customer_name, type:data.client_type, id:data.customer_id })
  saveDB(db); return newVisit
}
export function updateVisit(id, updates) {
  const db = getDB()
  const idx = db.visits.findIndex(v=>v.id===id)
  if (idx===-1) throw new Error('Visit not found')
  db.visits[idx] = {...db.visits[idx], ...updates, updated_at:new Date().toISOString()}
  saveDB(db); return db.visits[idx]
}

// ═══════════════════════════════════════════
// JOURNEYS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// JOURNEY LOCATION TRACKING (GPS Trail)
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// DISTANCE HELPERS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// TARGETS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// SALES REPORTS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// PRODUCT DAY ENTRIES
// ═══════════════════════════════════════════
export function getProductDayEntries(manager_id, dateParam=null) {
  let entries=(getDB().product_day||[]).filter(p=>p.manager_id===manager_id)
  if(dateParam) entries=entries.filter(p=>dateParam.length===7?p.date.startsWith(dateParam):p.date===dateParam)
  return entries.sort((a,b)=>new Date(b.date)-new Date(a.date))
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

// ═══════════════════════════════════════════
// MASTER TABLES — CUSTOMERS (Enhanced with GPS)
// ═══════════════════════════════════════════
export function getCustomers(territory=null) {
  let c = getDB().customers||[]
  if (territory) c = c.filter(x=>x.territory===territory)
  return c
}
export function searchCustomers(query) {
  if (!query||query.length<1) return []
  const q=query.toLowerCase()
  return (getDB().customers||[]).filter(c=>c.name.toLowerCase().includes(q)||c.type?.toLowerCase().includes(q)||c.owner_name?.toLowerCase().includes(q)).slice(0,8)
}
export function createCustomer(data) {
  const db=getDB()
  if(!db.customers) db.customers=[]
  const existing=db.customers.find(c=>c.name.toLowerCase()===data.name.toLowerCase())
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
  pushRecent(db,'recentCustomers',{name:c.name,type:c.type,id:c.id})
  saveDB(db); return c
}
export function updateCustomer(id, updates) {
  const db=getDB()
  const idx=(db.customers||[]).findIndex(c=>c.id===id)
  if(idx===-1) throw new Error('Customer not found')
  Object.assign(db.customers[idx],updates,{updated_at:new Date().toISOString()})
  saveDB(db); return db.customers[idx]
}

// ═══════════════════════════════════════════
// MASTER TABLES — BRANDS & PRODUCTS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// RECENT
// ═══════════════════════════════════════════
function pushRecent(db, key, item) {
  if (!db[key]) db[key]=[]
  db[key]=db[key].filter(x=>x.name!==item.name)
  db[key].unshift(item)
  if(db[key].length>20) db[key]=db[key].slice(0,20)
}
export function getRecentCustomers() { return getDB().recentCustomers||[] }
export function getRecentProducts()  { return getDB().recentProducts||[] }
export function getRecentBrands()    { return getDB().recentBrands||[] }

// ═══════════════════════════════════════════
// LIVE STATUS (Admin)
// ═══════════════════════════════════════════
export function getLiveStatus() {
  const db=getDB()
  const today=new Date().toISOString().split('T')[0]
  return db.users.filter(u=>u.role==='Sales Manager'&&u.is_active!==false).map(m=>{
    const statuses=db.statusHistory.filter(s=>s.manager_id===m.id)
    const curr=statuses.length>0?statuses[statuses.length-1]:null
    const todayVisits=db.visits.filter(v=>v.manager_id===m.id&&v.visit_date===today)
    const lastVisit=todayVisits[todayVisits.length-1]||null
    const activeJourney=db.journeys?.find(j=>j.manager_id===m.id&&j.status==='active')
    const tgts=db.targets.filter(t=>t.manager_id===m.id)
    const lt=tgts[tgts.length-1]
    const todayRpt=db.daily_sales_reports?.find(r=>r.manager_id===m.id&&r.date===today)
    // Get last GPS location from journey_locations
    let lastGPS=null
    if (activeJourney) {
      const locs=(db.journey_locations||[]).filter(l=>l.journey_id===activeJourney.id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
      if (locs.length>0) lastGPS={lat:locs[0].latitude,lng:locs[0].longitude,time:locs[0].timestamp,speed:locs[0].speed_kmh}
    }
    return { id:m.id, name:m.full_name, username:m.username, territory:m.territory||'—', email:m.email, phone:m.phone, status:curr?.status||'In-Office', last_update:curr?.timestamp||null, visits_today:todayVisits.length, last_location:lastVisit?{name:lastVisit.location,lat:lastVisit.latitude,lng:lastVisit.longitude,time:lastVisit.created_at}:null, last_gps:lastGPS, active_journey:activeJourney?{id:activeJourney.id,started_at:activeJourney.start_time,visit_count:todayVisits.length,suspicious_flags:activeJourney.suspicious_flags||0}:null, target:lt, today_sales:todayRpt?.sales_achievement||0 }
  })
}

// ═══════════════════════════════════════════
// AI ASSISTANT SUGGESTIONS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// OFFLINE QUEUE — sync when back online
// ═══════════════════════════════════════════
const QUEUE_KEY = 'dcc_sfa_offline_queue'

export function queueOfflineAction(type, payload) {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')
    q.push({ id: Date.now(), type, payload, queued_at: new Date().toISOString() })
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

// ═══════════════════════════════════════════
// SMART VISIT DETECTION
// Returns nearby customers within ~200m radius
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// HEATMAP DATA — for admin analytics
// Returns all visit coordinates with weight
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// JOURNEY REPLAY DATA — for admin
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// TERRITORY STATS — for admin analytics
// ═══════════════════════════════════════════
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

// Admin: directly set password for any user (no old password needed)
export async function adminSetPassword(id, newPassword) {
  if (!newPassword || newPassword.trim().length < 4) throw new Error('Password must be at least 4 characters')
  const db = getDB()
  const idx = db.users.findIndex(u => u.id === id)
  if (idx === -1) throw new Error('User not found')
  db.users[idx].password_hash = await hashPassword(newPassword.trim())
  db.users[idx].plain_password = newPassword.trim()
  db.users[idx].updated_at = new Date().toISOString()
  saveDB(db)
  return { success: true }
}

// Admin: remove duplicate users (keep only the most recent one per username)
export function removeDuplicateUsers() {
  const db = getDB()
  const seen = {}
  const toKeep = []
  // Process in reverse so we keep the latest
  ;[...db.users].reverse().forEach(u => {
    if (!seen[u.username]) { seen[u.username] = true; toKeep.push(u) }
  })
  db.users = toKeep.reverse()
  saveDB(db)
  return db.users.filter(u => u.is_active !== false).length
}

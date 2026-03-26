import { useState, useEffect, useCallback, useMemo } from 'react'
import useAuthStore from '../store/authStore'
import dccLogo from '../assets/dcc-logo.png'
import dccLogoWhite from '../assets/dcc-logo-white.png'
import {
    getUsers, createUser, updateUser, deleteUser, adminSetPassword,
    getAnalytics, productionReset, getDailyAlerts, shouldShowAlerts, getAlertDismissKey,
    bulkCreateTargets, calcDistanceKm, calcTravelTime,
    getTerritoryStats, getAISuggestions,
    subscribeToLiveUpdates, subscribeToLocalChanges, migrateLocalToSupabase,
    exportToCSV, exportDailyReport,
    getLiveStatusSync      as getLiveStatus,
    getUsersAdminSync      as getUsersAdmin,
    getAllVisitsSync        as getAllVisits,
    getDailyReportsSync    as getDailySalesReports,
    getProductEntriesSync  as getProductDayEntries,
    getAllProductDayEntriesSync,
    getTargetsSync         as getTargets,
    getJourneyHistorySync  as getJourneyHistory,
    getAllVisitsAllSync,
    getCustomersSync
  } from '../utils/supabaseDB'
import { lazy, Suspense } from 'react'
import { getStorageMode, isSupabaseConfigured } from '../utils/supabaseClient'
import { downloadPDFReport, downloadCSVReport } from '../utils/reportGenerator'
import { KPICard, SectionHeader, EmptyState, StatusBadge, Badge, ProgressBar } from '../components/ui/index'

// Heavy components — lazy loaded only when their tab is opened
const JourneyReplay   = lazy(() => import('../components/JourneyReplay'))
const SalesHeatmap    = lazy(() => import('../components/SalesHeatmap'))
const LiveLocationMonitor = lazy(() => import('../components/maps/LiveLocationMonitor'))
const LiveManagerMap  = lazy(() => import('../components/maps/LiveManagerMap'))

// Chart components — imported directly (used on multiple tabs)
import { DailySalesTrendChart, VisitBarChart, ProductBarChart, MonthlyComparisonChart } from '../components/charts/SalesChart'

// Dashboard widgets
const Leaderboard          = lazy(() => import('../components/dashboard/Leaderboard'))
const AIInsights           = lazy(() => import('../components/dashboard/AIInsights'))
const CustomerIntelligence = lazy(() => import('../components/dashboard/CustomerIntelligence'))
const ProductPerformance   = lazy(() => import('../components/dashboard/ProductPerformance'))
const ProductDayAdmin      = lazy(() => import('../components/dashboard/ProductDayAdmin'))
// merged into main supabaseDB import above
import { startAutoSync, startRealtimeSync, getQueueCount, onSyncStatusChange } from '../services/syncService'
import './AdminDashboard.css'

const STATUS_META = {
  'In-Office':      { color:'#2563EB', bg:'#EFF6FF' },
  'On Field':       { color:'#10B981', bg:'#ECFDF5' },
  'Lunch Break':    { color:'#F59E0B', bg:'#FFFBEB' },
  'Travel':         { color:'#7C3AED', bg:'#F5F3FF' },
  'Meeting':        { color:'#EC4899', bg:'#FDF2F8' },
  'Work From Home': { color:'#6B7280', bg:'#F3F4F6' },
}
const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#8B5CF6','#84CC16']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const fmt          = v => v ? '\u20B9' + Number(v).toLocaleString('en-IN') : '\u20B90'
const fmtTime      = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '--'
const fmtDate      = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '--'
const fmtDateShort = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '--'

const NAV = [
  { id:'overview',  lbl:'Overview',  ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { id:'managers',  lbl:'Managers',  ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
  { id:'drilldown', lbl:'Detail',    ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
  { id:'livemap',   lbl:'Live Map',  ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> },
  { id:'heatmap',   lbl:'Heatmap',   ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z"/><circle cx="12" cy="9" r="2.5"/></svg> },
  { id:'targets',   lbl:'Targets',   ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  { id:'analytics', lbl:'Analytics', ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { id:'customers', lbl:'Customers', ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id:'products',  lbl:'Products',  ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
  { id:'users',     lbl:'Users',     ico: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
]

export default function AdminDashboard() {
  const { user, logout } = useAuthStore()
  const [tab,             setTab]           = useState('overview')
  const [managers,        setManagers]      = useState([])
  const [users,           setUsers]         = useState([])
  const [toast,           setToast]         = useState(null)
  const [selectedMgrs,    setSelectedMgrs]  = useState([])
  const [userModal,       setUserModal]     = useState(false)
  const [targetModal,     setTargetModal]   = useState(false)
  const [editingUser,     setEditingUser]   = useState(null)
  const [editCreds,       setEditCreds]     = useState({username:'',password:'',show:false})
  const [pwdEdit,         setPwdEdit]       = useState({})
  const [drillManager,    setDrillManager]  = useState(null)
  const [showReplay,      setShowReplay]    = useState(false)
  const [terrStats,       setTerrStats]     = useState([])
  const [drillDate,       setDrillDate]     = useState(new Date().toISOString().split('T')[0])
  const [filterDate,      setFilterDate]    = useState(new Date().toISOString().split('T')[0])
  const [sidebarOpen,     setSidebarOpen]   = useState(false)
  const [analyticsPeriod, setAnalyticsPeriod] = useState('month')
  const [analyticsDate,   setAnalyticsDate]   = useState(new Date().toISOString().split('T')[0])
  const [analyticsData,   setAnalyticsData]   = useState(null)
  const [analyticsMgrId,  setAnalyticsMgrId]  = useState(null)
  const [alerts,          setAlerts]          = useState([])
  const [alertsOpen,      setAlertsOpen]      = useState(false)
  const [alertsDismissed, setAlertsDismissed] = useState(false)
  const [leaderPeriod,    setLeaderPeriod]    = useState('month')
  const [aiMgrId,         setAiMgrId]         = useState(null)
  const [overviewChartType, setOverviewChartType] = useState('sales')
  const [allCustomers,    setAllCustomers]    = useState([])
  const [allVisitsData,   setAllVisitsData]   = useState([])
  const [offlineCount,    setOfflineCount]    = useState(0)
  const [syncStatus,      setSyncStatus]      = useState('idle')

  const initUF = { username:'',password:'',full_name:'',email:'',phone:'',territory:'',role:'Sales Manager' }
  const initTF = { visit_target:'',sales_target:'',month:new Date().getMonth()+1,year:new Date().getFullYear() }
  const [uf, setUf] = useState(initUF)
  const [tf, setTf] = useState(initTF)

  const today    = new Date().toISOString().split('T')[0]
  const toastMsg = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3200) }

  const reload = useCallback(() => {
    try { const m = getLiveStatus();   setManagers(Array.isArray(m) ? m : []) }     catch(e) { console.error('getLiveStatus',e);   setManagers([]) }
    try { const u = getUsersAdmin();   setUsers(Array.isArray(u) ? u : []) }         catch(e) { console.error('getUsersAdmin',e);   setUsers([]) }
    try { const t = getTerritoryStats(); setTerrStats(Array.isArray(t) ? t : []) }   catch(e) { console.error('getTerritoryStats',e); setTerrStats([]) }
    try { const c = getCustomersSync(); setAllCustomers(Array.isArray(c) ? c : []) } catch(e) { console.error('getCustomers',e);     setAllCustomers([]) }
    try { const v = getAllVisitsAllSync(); setAllVisitsData(Array.isArray(v) ? v : []) } catch(e) { console.error('getAllVisitsAll',e); setAllVisitsData([]) }
    try { setOfflineCount(getQueueCount() || 0) } catch(e) { setOfflineCount(0) }
  }, [])

  useEffect(() => {
    startAutoSync(30000)
    const unsub = onSyncStatusChange(s => {
      setSyncStatus(s.syncing ? 'syncing' : s.status || 'idle')
      setOfflineCount(s.count || 0)
    })
    return unsub
  }, [])

  const loadAnalytics = useCallback((period, date, mgrId=null) => {
    try { setAnalyticsData(getAnalytics(mgrId, period, date) || null) }
    catch(e) { console.error('getAnalytics', e); setAnalyticsData(null) }
  }, [])
  useEffect(() => { loadAnalytics(analyticsPeriod, analyticsDate, analyticsMgrId) }, [analyticsPeriod, analyticsDate, analyticsMgrId, loadAnalytics])

  useEffect(() => {
    const loadAlerts = () => {
      if (shouldShowAlerts()) {
        const dismissed = localStorage.getItem(getAlertDismissKey())
        setAlertsDismissed(!!dismissed)
        setAlerts(getDailyAlerts())
      } else { setAlerts([]) }
    }
    loadAlerts()
    const interval = setInterval(loadAlerts, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const doProductionReset = () => {
    if (!window.confirm('PRODUCTION RESET: Delete ALL managers, visits, journeys. Keep Admin only.')) return
    if (window.prompt('Type YES to confirm:') !== 'YES') return toastMsg('Cancelled', 'error')
    productionReset(); reload(); toastMsg('Production reset complete.')
  }

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    const unsub = subscribeToLiveUpdates(() => { setTimeout(reload, 800) })
    return unsub
  }, [reload])

  // Local mode: listen for product_day changes from manager dashboard (same browser, other tab)
  useEffect(() => {
    const unsub = subscribeToLocalChanges(() => { setTimeout(reload, 400) })
    return unsub
  }, [reload])

  // Cloud mode: Supabase realtime subscription for instant sync
  useEffect(() => {
    const unsub = startRealtimeSync(() => { setTimeout(reload, 300) })
    return unsub
  }, [reload])

  const doCreateUser = async () => {
    const cleanUsername = uf.username.trim().toLowerCase().replace(/\s+/g, '_')
    if (!cleanUsername || !uf.full_name.trim()) return toastMsg('Username & full name required', 'error')
    if (!editingUser && !uf.password.trim()) return toastMsg('Password is required', 'error')
    if (!editingUser && uf.password.trim().length < 4) return toastMsg('Password must be at least 4 characters', 'error')
    const finalUf = { ...uf, username: cleanUsername, full_name: uf.full_name.trim() }
    try {
      if (editingUser) { await updateUser(editingUser.id, finalUf); toastMsg('User updated') }
      else { await createUser(finalUf); toastMsg('User "' + cleanUsername + '" created! pwd: ' + uf.password.trim()) }
      setUserModal(false); setEditingUser(null); setUf(initUF); reload()
    } catch(e) { toastMsg(e.message, 'error') }
  }
  const doAdminSetPwd = async (userId, newPwd) => {
    if (!newPwd || newPwd.trim().length < 4) return toastMsg('Min 4 characters', 'error')
    try { await adminSetPassword(userId, newPwd.trim()); setPwdEdit({}); reload(); toastMsg('Password updated') }
    catch(e) { toastMsg(e.message, 'error') }
  }
  const doDeleteUser = (id, name) => {
    if (!window.confirm('Delete ' + name + '?')) return
    try { deleteUser(id); reload(); toastMsg('User deleted') } catch(e) { toastMsg(e.message,'error') }
  }
  const openEditUser = u => {
    setEditingUser(u)
    setEditCreds({username:u.username, password:u.plain_password||'', show:false})
    setUf({username:u.username,password:'',full_name:u.full_name,email:u.email||'',phone:u.phone||'',territory:u.territory||'',role:u.role,_showPwd:false})
    setUserModal(true)
  }
  const doAssignTargets = () => {
    if (!selectedMgrs.length) return toastMsg('Select at least one manager','error')
    bulkCreateTargets(selectedMgrs,parseInt(tf.visit_target)||0,parseFloat(tf.sales_target)||0,tf.month,tf.year)
    setTargetModal(false); setSelectedMgrs([])
    toastMsg('Targets set for ' + selectedMgrs.length + ' manager(s)'); reload()
  }

    const salesManagers    = Array.isArray(users)    ? users.filter(u=>u.role==='Sales Manager') : []
  const onField          = Array.isArray(managers) ? managers.filter(m=>m.status==='On Field').length : 0
  const totalVisitsToday = Array.isArray(managers) ? managers.reduce((s,m)=>s+(m.visits_today||0),0) : 0
  const activeJourneys   = Array.isArray(managers) ? managers.filter(m=>m.active_journey).length : 0
  const totalSalesToday  = Array.isArray(managers) ? managers.reduce((s,m)=>s+(m.today_sales||0),0) : 0

  const buildManagerData = useCallback((date=today) => {
    return salesManagers.map((m,i) => {
      const mVisits = getAllVisits(m.id) || []
      const dayVisits   = mVisits.filter(v=>v.visit_date===date)
      const reports = getDailySalesReports(m.id) || []
      const dayReport   = reports.find(r=>r.date===date)
     const allProds = getProductDayEntries(m.id) || []
      const dayProducts = allProds.filter(p=>p.date===date)
      const targets = getTargets(m.id) || []
      const monthTarget = targets.find(t=>t.month===new Date(date).getMonth()+1&&t.year===new Date(date).getFullYear())
                       || targets.sort((a,b)=>b.year-a.year||b.month-a.month)[0]
      const journeys = getJourneyHistory(m.id) || []
      const liveData = managers.find(mg => mg.id === m.id) || {}
      const salesPct    = monthTarget?.sales_target&&dayReport ? Math.round((dayReport.sales_achievement/monthTarget.sales_target)*100) : 0
      const visitPct    = monthTarget?.visit_target&&dayVisits.length ? Math.round((dayVisits.length/monthTarget.visit_target)*100) : 0
      const totalProdAchieved = dayProducts.reduce((s,p)=>s+p.achieved_amount,0)
      const totalProdTarget   = dayProducts.reduce((s,p)=>s+p.target_amount,0)
      return {
        ...m, color: AVATAR_COLORS[i%AVATAR_COLORS.length],
        dayVisits, dayReport, dayProducts, monthTarget, journeys, liveData,
        salesPct, visitPct, totalProdAchieved, totalProdTarget,
        allVisitsCount: mVisits.length, totalReports: reports.length, totalProducts: allProds.length,
      }
    })
  }, [salesManagers, managers, today])
const [managerRows, setManagerRows] = useState([])
useEffect(() => {
  if (!salesManagers || salesManagers.length === 0) {
    setManagerRows([])
    return
  }

  try {
    const data = buildManagerData(filterDate)
    setManagerRows(data)
  } catch (err) {
    console.error("ManagerRows Error:", err)
    setManagerRows([])
  }
}, [salesManagers, filterDate, buildManagerData])
  const drillData   = useMemo(() => drillManager ? buildManagerData(drillDate).find(m=>m.id===drillManager.id) : null, [buildManagerData, drillDate, drillManager])

  // Pre-computed — avoids IIFE patterns inside JSX which break esbuild's JSX parser
  const overviewChartData = useMemo(() => {
  const vbd = {}
  const sbd = {}

  managerRows.forEach(m => {
        (m.dayVisits || []).forEach(v => {
      const date = v.visit_date || 'unknown'
      vbd[date] = (vbd[date] || 0) + 1
    })
  
    if (m.dayReport) {
      const date = m.dayReport.date
      sbd[date] = (sbd[date] || 0) + (m.dayReport.sales_achievement || 0)
    }
  })

  const allDays = [...new Set([
    ...Object.keys(vbd),
    ...Object.keys(sbd)
  ])].sort()

  return allDays.map(d => ({
    date: d,
    visits: vbd[d] || 0,
    sales: sbd[d] || 0
  }))
}, [managerRows])
  const leaderboardData = useMemo(() => {
    const a = getAnalytics(null, leaderPeriod, filterDate)
    return a ? a.managerStats : []
  }, [leaderPeriod, filterDate])

  const openDrilldown = (mgr) => {
    setDrillManager(mgr); setDrillDate(filterDate); setTab('drilldown'); setSidebarOpen(false)
  }

  const KPIs = () => (
    <div className="kpi-bar-4">
      {[
        { n:salesManagers.length, l:'Total Managers', ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>, bg:'#EFF6FF', tc:'#2563EB', pill:users.length + ' total users' },
        { n:onField,              l:'On Field Now',   ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>, bg:'#ECFDF5', tc:'#059669', pill:onField>0?'Active':'None' },
        { n:totalVisitsToday,     l:'Visits Today',   ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>, bg:'#FFFBEB', tc:'#D97706', pill:activeJourneys + ' live routes' },
        { n:fmt(totalSalesToday), l:'Sales Today',    ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>, bg:'#F5F3FF', tc:'#7C3AED', pill:'all managers' },
      ].map((k,i) => (
        <div key={i} className="akpi">
          <div className="akpi-top">
            <div className="akpi-ico" style={{background:k.bg}}>{k.ico}</div>
            <span className="akpi-pill" style={{background:k.bg,color:k.tc}}>{k.pill}</span>
          </div>
          <div className="akpi-val" style={{fontSize:typeof k.n==='string'?'1.1rem':'1.8rem'}}>{k.n}</div>
          <div className="akpi-lbl">{k.l}</div>
        </div>
      ))}
    </div>
  )



  return (
    <div className="admin-root">
      {toast && <div className={'toast toast-' + toast.type}>{toast.msg}</div>}
      <>
      {sidebarOpen && <div className="sb-overlay" onClick={()=>setSidebarOpen(false)}/>}
      <aside className={'sidebar ' + (sidebarOpen ? 'sb-open' : '')}>
        <div className="sb-header">
          <div className="sb-logo">
            <div className="sb-logo-icon"><img src={dccLogo} alt="DCC Logo" className="sb-logo-img"/></div>
            <div>
              <div className="sb-logo-name">DCC SalesForce</div>
              <div className="sb-logo-sub">Admin Console</div>
            </div>
          </div>
        </div>
        <nav className="sb-nav">
          <span className="sb-grp-lbl">Dashboard</span>
          {NAV.slice(0,3).map(n => (
            <button key={n.id} className={'sb-item ' + (tab===n.id ? 'sb-active' : '')} onClick={()=>{setTab(n.id);setSidebarOpen(false)}}>
              <div className="sb-item-ico-wrap">{n.ico}</div>
              <span className="sb-item-lbl">{n.lbl}</span>
              {n.id==='overview' && onField>0 && <span className="sb-live-badge">{onField} live</span>}
            </button>
          ))}
          <span className="sb-grp-lbl">Field</span>
          {NAV.slice(3,6).map(n => (
            <button key={n.id} className={'sb-item ' + (tab===n.id ? 'sb-active' : '')} onClick={()=>{setTab(n.id);setSidebarOpen(false)}}>
              <div className="sb-item-ico-wrap">{n.ico}</div>
              <span className="sb-item-lbl">{n.lbl}</span>
            </button>
          ))}
          <span className="sb-grp-lbl">Analytics</span>
          {NAV.slice(6,9).map(n => (
            <button key={n.id} className={'sb-item ' + (tab===n.id ? 'sb-active' : '')} onClick={()=>{setTab(n.id);setSidebarOpen(false)}}>
              <div className="sb-item-ico-wrap">{n.ico}</div>
              <span className="sb-item-lbl">{n.lbl}</span>
            </button>
          ))}
          <span className="sb-grp-lbl">Settings</span>
          {NAV.slice(9).map(n => (
            <button key={n.id} className={'sb-item ' + (tab===n.id ? 'sb-active' : '')} onClick={()=>{setTab(n.id);setSidebarOpen(false)}}>
              <div className="sb-item-ico-wrap">{n.ico}</div>
              <span className="sb-item-lbl">{n.lbl}</span>
            </button>
          ))}
          {offlineCount > 0 && (
            <div style={{margin:'10px 8px',padding:'8px 12px',background:'#FFFBEB',borderRadius:8,border:'1px solid #FDE68A',fontSize:'0.72rem',color:'#D97706',fontWeight:700}}>
              &#x26A0; {offlineCount} actions pending sync
            </div>
          )}
        </nav>
        <div className="sb-footer">
          <div style={{padding:'6px 12px 0'}}>
            {isSupabaseConfigured()
              ? <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'#ECFDF5',borderRadius:8,fontSize:'0.68rem',fontWeight:700,color:'#059669'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:'#10B981',display:'inline-block'}}/>
                  Cloud sync active
                </div>
              : <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'#FFFBEB',borderRadius:8,fontSize:'0.68rem',fontWeight:700,color:'#D97706'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:'#F59E0B',display:'inline-block'}}/>
                  Local storage only
                </div>
            }
          </div>
          <div className="sb-user">
            <div className="sb-user-avatar">{user?.full_name?.[0]}</div>
            <div>
              <div className="sb-user-name">{user?.full_name}</div>
              <div className="sb-user-role">Administrator</div>
            </div>
            <button className="sb-logout" onClick={logout} title="Sign out">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 12H3a1 1 0 01-1-1V3a1 1 0 011-1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </aside>
    </>
      <div className="admin-main">

        <div className="admin-mobile-header">
          <button className="amh-menu" onClick={()=>setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
          <div className="amh-logo">
            <div className="amh-logo-ico"><img src={dccLogo} alt="DCC" className="amh-logo-img"/></div>
            <span className="amh-logo-name">Admin Console</span>
          </div>
          <div className="amh-actions">
            {offlineCount > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:4,padding:'4px 8px',background:'#FFFBEB',borderRadius:20,border:'1px solid #FDE68A',fontSize:'0.65rem',fontWeight:800,color:'#D97706'}}>
                &#x26A0; {offlineCount}
              </div>
            )}
            {alerts.length > 0 && !alertsDismissed && (
              <button onClick={()=>setAlertsOpen(o=>!o)} style={{background:'#FEF2F2',border:'1.5px solid #FECACA',borderRadius:8,padding:'5px 8px',cursor:'pointer',fontSize:'0.72rem',fontWeight:700,color:'#DC2626',display:'flex',alignItems:'center',gap:3}}>
                &#x1F514; {alerts.length}
              </button>
            )}
            <button className="amh-btn" onClick={reload}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M13 7.5A5.5 5.5 0 112.5 5M2 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="amh-btn" onClick={logout}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M5 13H3a1 1 0 01-1-1V3a1 1 0 011-1h2M10 10l3-3-3-3M13 7H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>

        <div className="admin-mobile-tabs">
          {NAV.map(n => (
            <button key={n.id} className={'amt ' + (tab===n.id ? 'amt-active' : '')} onClick={()=>setTab(n.id)}>
              <span className="amt-ico">{n.ico}</span> {n.lbl}
            </button>
          ))}
        </div>

        <div className="admin-topbar">
          <div>
            <div className="atb-title" style={{display:'flex',alignItems:'center',gap:6}}>
              {NAV.find(n=>n.id===tab)?.ico}
              <span>{NAV.find(n=>n.id===tab)?.lbl}</span>
            </div>
            <div className="atb-sub">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
          </div>
          <div className="atb-right">
            {(tab==='overview'||tab==='managers') && (
              <div className="atb-date-wrap">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 1v2M9 1v2M1 5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} className="atb-date"/>
              </div>
            )}
            {alerts.length > 0 && !alertsDismissed && (
              <button onClick={()=>setAlertsOpen(o=>!o)} style={{position:'relative',background:alertsOpen?'#fee2e2':'#fff5f5',border:'1.5px solid #fca5a5',borderRadius:8,padding:'7px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:'0.78rem',fontWeight:700,color:'#dc2626'}}>
                <span style={{fontSize:'1rem'}}>&#x1F514;</span>
                {alerts.length} Alert{alerts.length>1?'s':''}
                <span style={{position:'absolute',top:-4,right:-4,width:16,height:16,background:'#ef4444',borderRadius:'50%',fontSize:'0.6rem',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800}}>{alerts.length}</span>
              </button>
            )}
            <button className="atb-btn" onClick={reload}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5A4.5 4.5 0 102.5 4M2 2v2.5H4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Refresh
            </button>
            {tab==='users' && <button className="atb-btn-primary" onClick={()=>{setEditingUser(null);setUf(initUF);setUserModal(true)}}>+ New User</button>}
            {tab==='targets' && selectedMgrs.length>0 && <button className="atb-btn-primary" onClick={()=>setTargetModal(true)}>Set Targets ({selectedMgrs.length})</button>}
          </div>
        </div>

        <div className="admin-content">

          {/* TAB: OVERVIEW */}
          {tab==='overview' && (
            <>
              <KPIs/>
              <div className="overview-grid-main">
                <div className="panel">
                  <div className="panel-hdr">
                    <div className="panel-title">Performance Trends</div>
                    <div style={{display:'flex',gap:6}}>
                      {[{id:'sales',lbl:'Sales'},{id:'visits',lbl:'Visits'}].map(c => (
                        <button key={c.id} onClick={()=>setOverviewChartType(c.id)}
                          style={{padding:'4px 12px',borderRadius:20,border:'1.5px solid',fontWeight:700,fontSize:'0.72rem',cursor:'pointer',background:overviewChartType===c.id?'#2563eb':'#f9fafb',color:overviewChartType===c.id?'#fff':'#6b7280',borderColor:overviewChartType===c.id?'#2563eb':'#e5e7eb'}}>
                          {c.lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="panel-body" style={{padding:'16px 12px 8px'}}>
                    {overviewChartData.length === 0
                      ? <div className="empty" style={{padding:'24px'}}><div style={{fontSize:'2rem',marginBottom:8}}>&#x1F4C8;</div><div className="empty-txt">No data yet for selected date.</div></div>
                      : overviewChartType === 'sales'
                        ? <DailySalesTrendChart data={overviewChartData}/>
                        : <VisitBarChart data={overviewChartData}/>
                    }
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-hdr">
                    <div className="panel-title">&#x1F3C6; Leaderboard</div>
                    <div style={{display:'flex',gap:5}}>
                      {['week','month'].map(p => (
                        <button key={p} onClick={()=>setLeaderPeriod(p)}
                          style={{padding:'3px 10px',borderRadius:20,border:'1.5px solid',fontWeight:700,fontSize:'0.68rem',cursor:'pointer',background:leaderPeriod===p?'#111827':'#f9fafb',color:leaderPeriod===p?'#fff':'#6b7280',borderColor:leaderPeriod===p?'#111827':'#e5e7eb'}}>
                          {p.charAt(0).toUpperCase()+p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="panel-body" style={{padding:'12px 16px'}}>
                    <Suspense fallback={null}><Leaderboard managers={leaderboardData} period={leaderPeriod}/></Suspense>
                  </div>
                </div>
              </div>

              <div className="overview-grid-side">
                <div className="panel">
                  <div className="panel-hdr">
                    <div className="panel-title">Team Activity &mdash; {fmtDate(filterDate)}</div>
                    <span className="panel-count">{salesManagers.length} managers</span>
                  </div>
                  <div className="panel-body" style={{overflowX:'auto'}}>
                    {(managerRows || []).length === 0
                      ? <div className="empty"><div className="empty-ico">&#x1F465;</div><div className="empty-txt">No managers yet.</div></div>
                      : (
                        <table className="analytics-table">
                          <thead className="at-head">
                            <tr><th>Manager</th><th>Status</th><th>Visits</th><th>Sales</th><th>Achv%</th><th>Journey</th><th></th></tr>
                          </thead>
                          <tbody className="at-body">
                            {(managerRows || []).map(m => {
                              const sm = STATUS_META[m.liveData?.status] || STATUS_META['In-Office']
                              return (
                                <tr key={m.id}>
                                  <td>
                                    <div className="at-mgr">
                                      <div className="at-av" style={{background:m.color}}>{m.full_name?.[0]}</div>
                                      <div>
                                        <div className="at-name">{m.full_name}</div>
                                        <div className="at-sub">{m.territory||'—'}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="at-status-chip" style={{background:sm.bg,color:sm.color}}>
                                      <span style={{width:5,height:5,borderRadius:'50%',background:sm.color,display:'inline-block',marginRight:4,flexShrink:0}}/>
                                      {m.liveData?.status||'In-Office'}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="at-visits-cell">
                                      <span className="at-mono">{(m.dayVisits || []).length}</span>
                                      {m.monthTarget?.visit_target && <span className="at-of">/{m.monthTarget.visit_target}</span>}
                                    </div>
                                  </td>
                                  <td><span className="at-mono">{m.dayReport ? fmt(m.dayReport.sales_achievement) : '—'}</span></td>
                                  <td>
                                    {m.salesPct > 0
                                      ? <span className="at-pct-badge" style={{background:m.salesPct>=100?'#ECFDF5':m.salesPct>=75?'#EFF6FF':'#FFFBEB',color:m.salesPct>=100?'#059669':m.salesPct>=75?'#2563EB':'#D97706'}}>{m.salesPct}%</span>
                                      : <span style={{color:'#9CA3AF',fontSize:'0.8rem'}}>—</span>
                                    }
                                  </td>
                                  <td>
                                    <span style={{fontSize:'0.75rem',fontWeight:700,color:m.liveData?.active_journey?'#059669':'#9CA3AF'}}>
                                      {m.liveData?.active_journey ? '&#x1F7E2; Active' : '&#x26AB; Idle'}
                                    </span>
                                  </td>
                                  <td><button className="at-drill-btn" onClick={()=>openDrilldown(m)}>Detail &#x2192;</button></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )
                    }
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-hdr ai-hdr">
                    <div className="panel-title">🤖 AI Insights</div>
                    <select onChange={e=>setAiMgrId(e.target.value?+e.target.value:null)} value={aiMgrId||''} className="ai-mgr-select">
                      <option value="">Select manager</option>
                      {salesManagers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  </div>
                  <div className="panel-body" style={{padding:'12px'}}>
                    <Suspense fallback={null}><AIInsights suggestions={aiMgrId ? getAISuggestions(aiMgrId) : []} managerName={salesManagers.find(m=>m.id===aiMgrId)?.full_name}/></Suspense>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-hdr lfs-hdr">
                  <div className="panel-title">🔴 Live Field Status</div>
                  <div className="lfs-actions">
                    <button className="panel-action" onClick={()=>setShowReplay(true)}>▶ Replay</button>
                    <button className="panel-action" onClick={()=>setTab('heatmap')}>🔥 Heatmap</button>
                    <button className="panel-action" onClick={reload}>↺ Refresh</button>
                  </div>
                </div>
                <div className="panel-body">
                  {managers.length===0
                    ? <div className="empty"><div className="empty-ico">&#x1F4E1;</div><div className="empty-txt">No field data yet.</div></div>
                    : <div className="live-grid">
                      {managers.map((m,i) => {
                        const sm = STATUS_META[m.status] || STATUS_META['In-Office']
                        return (
                          <div key={m.id} className="live-card" onClick={()=>openDrilldown(m)}>
                            <div className="lc-top">
                              <div className="lc-avatar" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{m.name?.[0]}</div>
                              <div className="lc-info">
                                <div className="lc-name">{m.name}</div>
                                <div className="lc-territory">&#x1F4CD; {m.territory||'—'}</div>
                              </div>
                              <div className="lc-status" style={{background:sm.bg,color:sm.color}}>
                                <span style={{width:6,height:6,borderRadius:'50%',background:sm.color,display:'inline-block',animation:m.status==='On Field'?'pulse 1.5s infinite':'none'}}/>
                                {m.status}
                              </div>
                            </div>
                            <div className="lc-metrics">
                              <div className="lc-metric"><div className="lc-metric-val">{m.visits_today}</div><div className="lc-metric-lbl">Visits</div></div>
                              <div className="lc-metric"><div className="lc-metric-val" style={{color:m.today_sales>0?'#2563EB':'#9CA3AF',fontSize:'0.78rem'}}>{fmt(m.today_sales)}</div><div className="lc-metric-lbl">Sales</div></div>
                              <div className="lc-metric">
                                <div className="lc-metric-val" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                                  <span style={{width:10,height:10,borderRadius:'50%',background:m.active_journey?'#10B981':'#9CA3AF',display:'inline-block',flexShrink:0}}/>
                                </div>
                                <div className="lc-metric-lbl">Journey</div>
                              </div>
                            </div>
                            {m.last_location && (
                              <div className="lc-location">&#x1F4CD; {(m.last_location?.name||'').split(',').slice(0,2).join(', ')} &middot; {fmtTime(m.last_location?.time)}</div>
                            )}
                            <div className="lc-drill-hint">Tap for full detail &#x2192;</div>
                          </div>
                        )
                      })}
                    </div>
                  }
                </div>
              </div>
            </>
          )}

          {/* TAB: MANAGERS LIST */}
          {tab==='managers' && (
            <>
              <KPIs/>
              <div className="panel">
                <div className="panel-hdr">
                  <div className="panel-title">All Managers &nbsp; {fmtDate(filterDate)}</div>
                  <span className="panel-count">{salesManagers.length} managers</span>
                </div>
                <div className="mgr-cards-grid">
                 {(managerRows || []).length === 0
  ? (
    <div className="empty" style={{gridColumn:'1/-1'}}>
      <div className="empty-ico"></div>
      <div className="empty-txt">No managers found.</div>
    </div>
  )
  : (managerRows || []).map(m => {
      const sm = STATUS_META[m.liveData?.status] || STATUS_META['In-Office']

      return (
        <div key={m.id} className="mgr-full-card">
                          <div className="mfc-header">
                            <div className="mfc-avatar" style={{background:m.color}}>{m.full_name?.[0]}</div>
                            <div className="mfc-info">
                              <div className="mfc-name">{m.full_name}</div>
                              <div className="mfc-meta">@{m.username}&nbsp;&nbsp;{m.territory||'No territory'}</div>
                            </div>
                            <span className="mfc-status" style={{background:sm.bg,color:sm.color}}>
                              <span style={{width:5,height:5,borderRadius:'50%',background:sm.color,display:'inline-block',marginRight:4,animation:m.liveData?.status==='On Field'?'pulse 1.5s infinite':'none'}}/>
                              {m.liveData?.status||'In-Office'}
                            </span>
                          </div>
                          <div className="mfc-section-lbl">Sales Performance</div>
                          <div className="mfc-sales-row">
                            <div className="mfc-sales-num">{m.dayReport ? fmt(m.dayReport.sales_achievement) : '\u20B90'}</div>
                            <div className="mfc-sales-of">of {m.monthTarget ? fmt(m.monthTarget.sales_target) : ''}</div>
                            {m.salesPct > 0 && (
                              <span className="mfc-pct" style={{background:m.salesPct>=100?'#ECFDF5':m.salesPct>=75?'#EFF6FF':'#FFFBEB',color:m.salesPct>=100?'#059669':m.salesPct>=75?'#2563EB':'#D97706'}}>
                                {m.salesPct}%
                              </span>
                            )}
                          </div>
                          {m.monthTarget?.sales_target > 0 && (
                            <div className="mfc-bar">
                              <div className="mfc-bar-fill" style={{width:Math.min(m.salesPct,100)+'%',background:m.salesPct>=100?'#10B981':m.salesPct>=75?'#2563EB':'#F59E0B'}}/>
                            </div>
                          )}
                          <div className="mfc-kpi-row">
                            <div className="mfc-kpi"><div className="mfc-kpi-val">{(m.dayVisits || []).length}</div><div className="mfc-kpi-lbl">Visits Today</div></div>
                            <div className="mfc-kpi"><div className="mfc-kpi-val">{m.dayReport ? fmt(m.dayReport.profit_achievement || 0) : ''}</div><div className="mfc-kpi-lbl">Profit</div></div>
                            <div className="mfc-kpi"><div className="mfc-kpi-val">{(m.dayProducts || []).length}</div><div className="mfc-kpi-lbl">Products</div></div>
                            <div className="mfc-kpi">
                            <div className="mfc-kpi-val" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:22}}>
                              <span style={{width:10,height:10,borderRadius:'50%',background:m.liveData?.active_journey?'#10B981':'#9CA3AF',display:'inline-block'}}/>
                            </div>
                            <div className="mfc-kpi-lbl">Journey</div>
                          </div>
                          </div>
                          {(m.dayVisits || []).length > 0 && (
                            <div className="mfc-visits-strip">
                              <div className="mfc-section-lbl">Today's Visits</div>
                              {m.dayVisits.slice(0,3).map((v,i) => (
                                <div key={v.id} className="mfc-visit-row">
                                  <span className="mfc-visit-num" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{i+1}</span>
                                  <div className="mfc-visit-body">
                                    <div className="mfc-visit-name">{v.client_name||v.customer_name}</div>
                                    <div className="mfc-visit-meta">{v.client_type}&nbsp;&nbsp;{v.location?.split(',')[0]}</div>
                                  </div>
                                  <span className="mfc-visit-time">{fmtTime(v.created_at)}</span>
                                </div>
                              ))}
                              {(m.dayVisits || []).length > 3 && <div className="mfc-more">+{(m.dayVisits || []).length-3} more visits</div>}
                            </div>
                          )}
                          {(m.dayProducts || []).length > 0 && (
                            <div className="mfc-products-strip">
                              <div className="mfc-section-lbl">Product Entries</div>
                              {m.dayProducts.slice(0,2).map(p => {
                                const pct = p.target_qty > 0 ? Math.round((p.achieved_qty/p.target_qty)*100) : 0
                                return (
                                  <div key={p.id} className="mfc-prod-row">
                                    <div>
                                      <div className="mfc-prod-brand">{p.brand}</div>
                                      <div className="mfc-prod-name">{p.product_name}</div>
                                    </div>
                                    <div className="mfc-prod-right">
                                      <div className="mfc-prod-val">{fmt(p.achieved_amount)}</div>
                                      <span className="mfc-prod-pct" style={{color:pct>=100?'#059669':pct>=75?'#2563EB':'#D97706'}}>{pct}%</span>
                                    </div>
                                  </div>
                                )
                              })}
                              {(m.dayProducts || []).length > 2 && <div className="mfc-more">+{(m.dayProducts || []).length-2} more products</div>}
                            </div>
                          )}
                          <button className="mfc-drill-btn" onClick={()=>openDrilldown(m)}>
                            View Full Detail
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6 2.5L9.5 6 6 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      )
                    })
                  }
                </div>
              </div>
            </>
          )}

          {/* TAB: MANAGER DRILLDOWN */}
          {tab==='drilldown' && (
            <>
              {!drillManager
                ? (
                  <div className="panel">
                    <div className="panel-body">
                      <div className="empty">
                        <div className="empty-ico"></div>
                        <div className="empty-txt">Select a manager from the Overview or Managers tab to view their full activity.</div>
                        <button className="empty-cta" onClick={()=>setTab('managers')}>Go to Managers</button>
                      </div>
                    </div>
                  </div>
                )
                : drillData && (
                  <>
                    <div className="drill-header">
                      <button className="drill-back" onClick={()=>setTab('managers')}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8 2L4 6.5 8 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Back
                      </button>
                      <div className="drill-profile">
                        <div className="drill-avatar" style={{background:drillData.color}}>{drillData.full_name?.[0]}</div>
                        <div>
                          <div className="drill-name">{drillData.full_name}</div>
                          <div className="drill-meta">@{drillData.username}&nbsp;&nbsp;{drillData.territory||'No territory'}&nbsp;&nbsp;{drillData.email||''}</div>
                        </div>
                      </div>
                      <div className="drill-date-wrap">
                        <label>Viewing date:</label>
                        <input type="date" value={drillDate} onChange={e=>setDrillDate(e.target.value)} className="atb-date"/>
                      </div>
                    </div>

                    <div className="drill-kpi-row">
                      {[
                        { ico:'', v:(drillData?.dayVisits || []).length, l:'Visits', bg:'#ECFDF5', tc:'#059669', sub:'Target: '+(drillData.monthTarget?.visit_target||'') },
                        { ico:'', v:drillData.dayReport?fmt(drillData.dayReport.sales_achievement):'\u20B90', l:'Sales', bg:'#EFF6FF', tc:'#2563EB', sub:drillData.salesPct>0?(drillData.salesPct+'% of target'):'No target set' },
                        { ico:'', v:drillData.dayReport?fmt(drillData.dayReport.profit_achievement):'\u20B90', l:'Profit', bg:'#ECFDF5', tc:'#059669', sub:drillData.dayReport?((drillData.dayReport.profit_percentage||0)+'% margin'):'' },
                        { ico:'', v: (drillData?.dayProducts || []).length, l:'Products', bg:'#F5F3FF', tc:'#7C3AED', sub:'\u20B9'+Number(drillData.totalProdAchieved).toLocaleString('en-IN')+' value' },
                        { ico:'', v:drillData.liveData?.active_journey?'Active':'Idle', l:'Journey', bg:drillData.liveData?.active_journey?'#ECFDF5':'#F3F4F6', tc:drillData.liveData?.active_journey?'#059669':'#6B7280', sub:drillData.liveData?.status||'In-Office' },
                        { ico:'', v:drillData.allVisitsCount, l:'Total Visits', bg:'#FFFBEB', tc:'#D97706', sub:drillData.totalReports+' reports' },
                      ].map((k,i) => (
                        <div key={i} className="drill-kpi">
                          <div className="drill-kpi-ico" style={{background:k.bg}}>{k.ico}</div>
                          <div className="drill-kpi-val">{k.v}</div>
                          <div className="drill-kpi-lbl">{k.l}</div>
                          <div className="drill-kpi-sub">{k.sub}</div>
                        </div>
                      ))}
                    </div>

                    <div className="content-grid two">
                      <div className="panel">
                        <div className="panel-hdr">
                          <div className="panel-title">Sales Report &nbsp; {fmtDateShort(drillDate)}</div>
                        </div>
                        <div className="panel-body" style={{padding:18}}>
                          {drillData.dayReport ? (
                            <>
                              <div className="dr-metric-grid">
                                {[
                                  {l:'Sales Target',    v:fmt(drillData.dayReport.sales_target),    c:'#6B7280'},
                                  {l:'Sales Achieved',  v:fmt(drillData.dayReport.sales_achievement),c:'#2563EB'},
                                  {l:'Profit Target',   v:fmt(drillData.dayReport.profit_target),   c:'#6B7280'},
                                  {l:'Profit Achieved', v:fmt(drillData.dayReport.profit_achievement),c:'#10B981'},
                                ].map((r,i) => (
                                  <div key={i} className="dr-metric">
                                    <div className="dr-metric-lbl">{r.l}</div>
                                    <div className="dr-metric-val" style={{color:r.c}}>{r.v}</div>
                                  </div>
                                ))}
                              </div>
                              <div className="dr-bar-section">
                                <div className="dr-bar-lbl">
                                  <span>Sales Achievement</span>
                                  <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:drillData.salesPct>=100?'#059669':drillData.salesPct>=75?'#2563EB':'#D97706'}}>{drillData.salesPct}%</span>
                                </div>
                                <div className="dr-bar">
                                  <div className="dr-bar-fill" style={{width:Math.min(drillData.salesPct,100)+'%',background:drillData.salesPct>=100?'#10B981':drillData.salesPct>=75?'#2563EB':'#F59E0B'}}/>
                                </div>
                                {drillData.dayReport.profit_percentage && (
                                  <div className="dr-bar-lbl" style={{marginTop:10}}>
                                    <span>Profit Margin</span>
                                    <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:'#10B981'}}>{drillData.dayReport.profit_percentage}%</span>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="empty" style={{padding:'32px 0'}}>
                              <div className="empty-ico"></div>
                              <div className="empty-txt">No sales report submitted for {fmtDateShort(drillDate)}.</div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="panel">
                        <div className="panel-hdr">
                          <div className="panel-title">Visits &nbsp; {fmtDateShort(drillDate)}</div>
                          <span className="panel-count">{(drillData?.dayVisits || []).length} visits</span>
                        </div>
                        <div className="panel-body">
                          {(drillData?.dayVisits || []).length===0
                            ? <div className="empty" style={{padding:'32px 0'}}><div className="empty-ico"></div><div className="empty-txt">No visits on {fmtDateShort(drillDate)}.</div></div>
                            : (drillData?.dayVisits || []).map((v,i) => (
                              <div key={v.id} className="dd-visit-row">
                                <div className="ddv-num" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{i+1}</div>
                                <div className="ddv-body">
                                  <div className="ddv-name">{v.client_name||v.customer_name}</div>
                                  <div className="ddv-meta">
                                    <span className="ddv-tag">{v.client_type}</span>
                                    <span>{v.location?.split(',')[0]}</span>
                                  </div>
                                  {v.notes && <div className="ddv-notes">{v.notes}</div>}
                                  <div className="ddv-type">{v.visit_type}</div>
                                </div>
                                <div className="ddv-time">{fmtTime(v.created_at)}</div>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-hdr">
                        <div className="panel-title">Product Day Entries &nbsp; {fmtDateShort(drillDate)}</div>
                        <span className="panel-count">{(drillData?.dayProducts || []).length} entries</span>
                      </div>
                      <div className="panel-body">
                        {(drillData?.dayProducts || []).length===0
                          ? <div className="empty" style={{padding:'32px 0'}}><div className="empty-ico"></div><div className="empty-txt">No product entries on {fmtDateShort(drillDate)}.</div></div>
                          : (
                            <div style={{overflowX:'auto'}}>
                              <table className="analytics-table">
                                <thead className="at-head">
                                  <tr><th>Brand</th><th>Product</th><th>Target Qty</th><th>Achieved Qty</th><th>Performance %</th><th>Target Value</th><th>Achieved Value</th></tr>
                                </thead>
                                <tbody className="at-body">
                                  {(drillData?.dayProducts || []).map(p => {
                                    const pct = p.target_qty > 0 ? Math.round((p.achieved_qty/p.target_qty)*100) : 0
                                    const c   = pct>=100?'#059669':pct>=75?'#2563EB':'#D97706'
                                    const bg  = pct>=100?'#ECFDF5':pct>=75?'#EFF6FF':'#FFFBEB'
                                    return (
                                      <tr key={p.id}>
                                        <td><span className="prod-brand-tag">{p.brand}</span></td>
                                        <td><span className="at-name">{p.product_name}</span></td>
                                        <td><span className="at-mono">{p.target_qty}</span></td>
                                        <td><span className="at-mono">{p.achieved_qty}</span></td>
                                        <td>
                                          <div className="prod-pct-cell">
                                            <div className="prod-mini-bar"><div style={{width:Math.min(pct,100)+'%',height:'100%',background:c,borderRadius:99}}/></div>
                                            <span className="at-pct-badge" style={{background:bg,color:c}}>{pct}%</span>
                                          </div>
                                        </td>
                                        <td><span className="at-mono">{fmt(p.target_amount)}</span></td>
                                        <td><span className="at-mono" style={{color:'#2563EB',fontWeight:700}}>{fmt(p.achieved_amount)}</span></td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="prod-total-row">
                                    <td colSpan={5} style={{padding:'10px 14px',fontWeight:800,color:'#374151',fontSize:'0.78rem'}}>TOTAL</td>
                                    <td><span className="at-mono" style={{fontWeight:800}}>{fmt(drillData.totalProdTarget)}</span></td>
                                    <td><span className="at-mono" style={{fontWeight:800,color:'#2563EB'}}>{fmt(drillData.totalProdAchieved)}</span></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )
                        }
                      </div>
                    </div>

                    <div className="panel">
                      <div className="panel-hdr">
                        <div className="panel-title">Sales History &nbsp; All Reports</div>
                        <span className="panel-count">{getDailySalesReports(drillData.id).length} reports</span>
                      </div>
                      <div className="panel-body" style={{overflowX:'auto'}}>
                        {getDailySalesReports(drillData.id).length===0
                          ? <div className="empty" style={{padding:32}}><div className="empty-ico"></div><div className="empty-txt">No history yet.</div></div>
                          : (
                            <table className="analytics-table">
                              <thead className="at-head">
                                <tr><th>Date</th><th>Sales Target</th><th>Sales Done</th><th>Achievement</th><th>Profit</th><th>Margin</th></tr>
                              </thead>
                              <tbody className="at-body">
                                {getDailySalesReports(drillData.id).map(r => {
                                  const pct = r.sales_percentage || 0
                                  const c   = pct>=100?'#059669':pct>=75?'#2563EB':'#D97706'
                                  const bg  = pct>=100?'#ECFDF5':pct>=75?'#EFF6FF':'#FFFBEB'
                                  return (
                                    <tr key={r.id}>
                                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem'}}>{fmtDate(r.date)}</span></td>
                                      <td><span className="at-mono">{fmt(r.sales_target)}</span></td>
                                      <td><span className="at-mono">{fmt(r.sales_achievement)}</span></td>
                                      <td>{pct>0 ? <span className="at-pct-badge" style={{background:bg,color:c}}>{pct}%</span> : <span style={{color:'#9CA3AF'}}>—</span>}</td>
                                      <td><span className="at-mono">{fmt(r.profit_achievement)}</span></td>
                                      <td><span className="at-mono">{r.profit_percentage||0}%</span></td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )
                        }
                      </div>
                    </div>
                  </>
                )
              }
            </>
          )}

          {/* TAB: HEATMAP */}
          {tab==='heatmap' && (
            <>
              <KPIs/>
              <div className="panel">
                <div className="panel-hdr">
                  <div className="panel-title">Territory Performance</div>
                  <button className="panel-action" onClick={reload}>Refresh</button>
                </div>
                <div className="panel-body" style={{overflowX:'auto'}}>
                  {terrStats.length===0
                    ? <div className="empty"><div className="empty-ico"></div><div className="empty-txt">No territory data yet.</div></div>
                    : (
                      <table className="analytics-table">
                        <thead className="at-head">
                          <tr><th>Territory</th><th>Managers</th><th>Customers</th><th>Total Visits</th><th>Today</th></tr>
                        </thead>
                        <tbody className="at-body">
                          {terrStats.map((t,i) => (
                            <tr key={t.name}>
                              <td><div className="at-mgr"><div className="at-av" style={{background:['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED'][i%5],fontSize:'0.65rem'}}>{t.name?.[0]}</div><div className="at-name">{t.name}</div></div></td>
                              <td><span className="at-mono">{t.managers}</span></td>
                              <td><span className="at-mono">{t.customers}</span></td>
                              <td><span className="at-mono">{t.visits_total}</span></td>
                              <td>{t.visits_today>0 ? <span className="at-pct-badge" style={{background:'#ECFDF5',color:'#059669'}}>{t.visits_today}</span> : <span style={{color:'#9CA3AF'}}>—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }
                </div>
              </div>
              <div className="heatmap-action-row">
                <div className="hmap-action-card" onClick={()=>setShowReplay(true)}>
                  <div className="hmap-card-ico"></div>
                  <div className="hmap-card-title">Journey Replay</div>
                  <div className="hmap-card-sub">Replay any salesperson's full day route with timeline and suspicious activity flags</div>
                  <div className="hmap-card-btn">Open Replay</div>
                </div>
                <div className="hmap-action-card" onClick={()=>{ document.getElementById('shm-inline-trigger')?.click() }}>
                  <div className="hmap-card-ico"></div>
                  <div className="hmap-card-title">Sales Heatmap</div>
                  <div className="hmap-card-sub">Interactive map showing visit density, GPS trails, and territory coverage analysis</div>
                  <div className="hmap-card-btn">Open Heatmap</div>
                </div>
              </div>
            </>
          )}

          {/* TAB: TARGETS */}
          {tab==='targets' && (
            <div className="panel">
              <div className="panel-hdr">
                <div className="panel-title">Assign Monthly Targets</div>
                {selectedMgrs.length>0 && <button className="panel-action" onClick={()=>setTargetModal(true)}>Set for {selectedMgrs.length}</button>}
              </div>
              <div className="panel-body">
                {salesManagers.length===0
                  ? <div className="empty"><div className="empty-ico"></div><div className="empty-txt">No managers yet.</div></div>
                  : <>
                    <div className="target-hint">Select managers to bulk-assign monthly targets.</div>
                    {salesManagers.map((m,i) => {
                      const sel  = selectedMgrs.includes(m.id)
                      const tgts = getTargets(m.id)
                      const lt   = tgts.sort((a,b)=>b.year-a.year||b.month-a.month)[0]
                      return (
                        <div key={m.id} className={'mgr-select ' + (sel ? 'mgr-sel' : '')}
                          onClick={()=>setSelectedMgrs(p=>p.includes(m.id)?p.filter(x=>x!==m.id):[...p,m.id])}>
                          <div className="ms-av" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{m.full_name?.[0]}</div>
                          <div className="ms-info">
                            <div className="ms-name">{m.full_name}</div>
                            <div className="ms-sub">@{m.username}&nbsp;&nbsp;{m.territory||'No territory'}</div>
                            {lt && <div className="ms-tgt">Current: {lt.visit_target} visits &nbsp; {fmt(lt.sales_target)}/mo &nbsp; {MONTHS[lt.month-1]} {lt.year}</div>}
                          </div>
                          <div className="ms-check">
                            {sel
                              ? <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" fill="#2563EB"/><path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              : <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#D1D5DB" strokeWidth="1.3"/></svg>
                            }
                          </div>
                        </div>
                      )
                    })}
                    {selectedMgrs.length > 0 && (
                      <button className="assign-btn" onClick={()=>setTargetModal(true)}>Set Targets for {selectedMgrs.length} Manager(s)</button>
                    )}
                  </>
                }
              </div>
            </div>
          )}

          {/* TAB: ANALYTICS */}
          {tab==='analytics' && (
            <div>
              <div style={{background:'#fff',borderRadius:12,padding:'14px 18px',boxShadow:'0 1px 4px rgba(0,0,0,0.07)',marginBottom:16}}>
                <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}}>
                  <div style={{fontWeight:800,fontSize:'0.9rem',color:'#111827'}}>Analytics</div>
                  {['week','month','year'].map(p => (
                    <button key={p} onClick={()=>setAnalyticsPeriod(p)}
                      style={{padding:'6px 16px',borderRadius:8,border:'1.5px solid',fontWeight:700,fontSize:'0.8rem',cursor:'pointer',background:analyticsPeriod===p?'#2563eb':'#f9fafb',color:analyticsPeriod===p?'#fff':'#6b7280',borderColor:analyticsPeriod===p?'#2563eb':'#e5e7eb'}}>
                      {p.charAt(0).toUpperCase()+p.slice(1)}
                    </button>
                  ))}
                  <input type="date" value={analyticsDate} onChange={e=>setAnalyticsDate(e.target.value)} style={{padding:'6px 10px',border:'1.5px solid #e5e7eb',borderRadius:8,fontSize:'0.8rem',color:'#374151'}}/>
                  {analyticsData && (
                    <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:'0.75rem',color:'#9ca3af',fontWeight:600}}>{analyticsData.dateFrom} to {analyticsData.dateTo}</span>
                      <button onClick={()=>{downloadCSVReport(analyticsData,'dcc_'+analyticsPeriod+'_'+analyticsDate+'.csv');toastMsg('CSV downloaded')}}
                        style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',background:'#ECFDF5',border:'1.5px solid #6EE7B7',borderRadius:8,fontSize:'0.72rem',fontWeight:700,color:'#059669',cursor:'pointer'}}>
                        &#x1F4E5; CSV
                      </button>
                      <button onClick={()=>{const meta=analyticsMgrId?{filteredManager:salesManagers.find(m=>m.id===analyticsMgrId)?.full_name}:{};downloadPDFReport(analyticsData,meta);toastMsg('PDF opening...')}}
                        style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',background:'#EFF6FF',border:'1.5px solid #BFDBFE',borderRadius:8,fontSize:'0.72rem',fontWeight:700,color:'#2563EB',cursor:'pointer'}}>
                        &#x1F4C4; PDF
                      </button>
                    </span>
                  )}
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:'0.72rem',fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.05em'}}>Filter:</span>
                  <button onClick={()=>setAnalyticsMgrId(null)} style={{padding:'5px 14px',borderRadius:20,border:'1.5px solid',fontWeight:700,fontSize:'0.75rem',cursor:'pointer',background:analyticsMgrId===null?'#111827':'#f9fafb',color:analyticsMgrId===null?'#fff':'#6b7280',borderColor:analyticsMgrId===null?'#111827':'#e5e7eb'}}>All</button>
                  {salesManagers.map((m,i) => (
                    <button key={m.id} onClick={()=>setAnalyticsMgrId(m.id)}
                      style={{padding:'5px 14px',borderRadius:20,border:'1.5px solid',fontWeight:700,fontSize:'0.75rem',cursor:'pointer',background:analyticsMgrId===m.id?AVATAR_COLORS[i%AVATAR_COLORS.length]:'#f9fafb',color:analyticsMgrId===m.id?'#fff':'#374151',borderColor:analyticsMgrId===m.id?AVATAR_COLORS[i%AVATAR_COLORS.length]:'#e5e7eb',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{width:18,height:18,borderRadius:'50%',background:analyticsMgrId===m.id?'rgba(255,255,255,0.3)':AVATAR_COLORS[i%AVATAR_COLORS.length],color:'#fff',fontSize:'0.6rem',fontWeight:800,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{m.full_name?.[0]}</span>
                      {m.full_name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {analyticsData && (
                <div>
                  <div className="kpi-bar-4" style={{marginBottom:18}}>
                    {[
                      {ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>,n:analyticsData.totals.visits,    l:'Total Visits', bg:'#ECFDF5',tc:'#059669'},
                      {ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,n:fmt(analyticsData.totals.sales), l:'Total Sales',  bg:'#EFF6FF',tc:'#2563EB'},
                      {ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,n:fmt(analyticsData.totals.profit),l:'Total Profit', bg:'#F5F3FF',tc:'#7C3AED'},
                      {ico:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,n:analyticsData.totals.salesPct+'%',l:'Achievement',bg:'#FFFBEB',tc:'#D97706'},
                    ].map((k,i) => (
                      <div key={i} className="akpi">
                        <div className="akpi-top"><div className="akpi-ico" style={{background:k.bg}}>{k.ico}</div></div>
                        <div className="akpi-val" style={{fontSize:'1.5rem'}}>{k.n}</div>
                        <div className="akpi-lbl">{k.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="analytics-charts-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:18}}>
                    <div className="panel">
                      <div className="panel-hdr"><div className="panel-title">&#x1F4C8; Sales Trend</div></div>
                      <div className="panel-body" style={{padding:'16px 12px 8px'}}>
                        {Object.keys(analyticsData.allDailySales).length === 0
                          ? <div className="empty" style={{padding:'24px'}}><div className="empty-ico">&#x1F4C8;</div><div className="empty-txt">No sales data.</div></div>
                          : <DailySalesTrendChart data={Object.entries(analyticsData.allDailySales).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,sales])=>({date,sales}))}/>
                        }
                      </div>
                    </div>
                    <div className="panel">
                      <div className="panel-hdr"><div className="panel-title">&#x1F4CD; Visit Trend</div></div>
                      <div className="panel-body" style={{padding:'16px 12px 8px'}}>
                        {Object.keys(analyticsData.dailyTrend).length === 0
                          ? <div className="empty" style={{padding:'24px'}}><div className="empty-ico">&#x1F4CD;</div><div className="empty-txt">No visits.</div></div>
                          : <VisitBarChart data={Object.entries(analyticsData.dailyTrend).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,visits])=>({date,visits}))}/>
                        }
                      </div>
                    </div>
                  </div>
                  <div className="panel" style={{marginBottom:18}}>
                    <div className="panel-hdr">
                      <div className="panel-title">&#x1F465; Manager Performance</div>
                      <span className="panel-count">{analyticsData.managerStats.length} managers</span>
                    </div>
                    <div className="panel-body" style={{overflowX:'auto'}}>
                      {analyticsData.managerStats.length===0
                        ? <div className="empty"><div className="empty-ico">&#x1F465;</div><div className="empty-txt">No managers yet.</div></div>
                        : (
                          <table className="analytics-table">
                            <thead className="at-head">
                              <tr><th>Manager</th><th>Territory</th><th>Visits</th><th>Sales</th><th>Profit</th><th>Achievement</th></tr>
                            </thead>
                            <tbody className="at-body">
                              {analyticsData.managerStats.sort((a,b)=>b.totalSales-a.totalSales).map((m,i) => {
                                const c  = m.salesPct>=100?'#059669':m.salesPct>=75?'#2563EB':'#D97706'
                                const bg = m.salesPct>=100?'#ECFDF5':m.salesPct>=75?'#EFF6FF':'#FFFBEB'
                                return (
                                  <tr key={m.id}>
                                    <td><div className="at-mgr"><div className="at-av" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{m.name?.[0]}</div><div><div className="at-name">{m.name}</div><div className="at-sub">@{m.username}</div></div></div></td>
                                    <td><span style={{fontSize:'0.78rem',color:'#6b7280'}}>{m.territory||'—'}</span></td>
                                    <td><span className="at-mono">{m.visits}</span></td>
                                    <td><span className="at-mono">{fmt(m.totalSales)}</span></td>
                                    <td><span className="at-mono">{fmt(m.totalProfit)}</span></td>
                                    <td>{m.salesPct>0 ? <span className="at-pct-badge" style={{background:bg,color:c}}>{m.salesPct}%</span> : <span style={{color:'#9CA3AF'}}>—</span>}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )
                      }
                    </div>
                  </div>
                  {analyticsData.managerStats.some(m=>m.productPerformance.length>0) && (
                    <div className="analytics-product-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
                      <div className="panel">
                        <div className="panel-hdr"><div className="panel-title">&#x1F4E6; Product Performance</div></div>
                        <div className="panel-body" style={{padding:'16px 12px 8px'}}>
                          <ProductBarChart data={analyticsData.managerStats.flatMap(m=>m.productPerformance).slice(0,8).map(p=>({name:p.name.length>12?p.name.slice(0,12)+'...':p.name,achieved:p.achieved_amt,target:p.target_amt}))}/>
                        </div>
                      </div>
                      <div className="panel">
                        <div className="panel-hdr"><div className="panel-title">&#x1F3C6; Top Leaderboard</div></div>
                        <div className="panel-body" style={{padding:'12px 16px'}}>
                          <Leaderboard managers={analyticsData.managerStats} period={analyticsPeriod}/>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: LIVE MAP */}
          {tab==='livemap' && (
            <div className="livemap-container">
              <div className="panel livemap-panel">
                <Suspense fallback={
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,gap:10,color:'#6B7280'}}>
                    <div style={{width:18,height:18,border:'2.5px solid #E5E7EB',borderTopColor:'#2563EB',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
                    Loading map…
                  </div>
                }>
                  <LiveLocationMonitor
                    managers={managers}
                    salesManagers={salesManagers}
                    onRefresh={reload}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* TAB: CUSTOMERS */}
          {tab==='customers' && (
            <div className="panel">
              <SectionHeader title="&#x1F3EA; Customer Intelligence" count={allCustomers.length} subtitle="Visit history, purchase patterns and priority scoring" actions={<button className="panel-action" onClick={reload}>Refresh</button>}/>
              <div className="panel-body" style={{padding:'16px'}}>
                <Suspense fallback={null}><CustomerIntelligence customers={allCustomers} visits={allVisitsData} managers={salesManagers}/></Suspense>
              </div>
            </div>
          )}

          {/* TAB: PRODUCTS */}
          {tab==='products' && (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>

              {/* ── Real-time Product Day Dashboard ── */}
              <div className="panel">
                <div className="panel-hdr">
                  <div>
                    <div className="panel-title">📦 Product Day — Live Activity</div>
                    <div style={{fontSize:'0.7rem',color:'#9CA3AF',marginTop:2}}>
                      All managers' daily product targets & achievements · synced in real-time
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{background:'#ECFDF5',color:'#059669',fontSize:'0.62rem',fontWeight:800,padding:'3px 9px',borderRadius:99,border:'1px solid #BBF7D0'}}>
                      ● Live
                    </span>
                  </div>
                </div>
                <div className="panel-body" style={{padding:'16px'}}>
                  <Suspense fallback={
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'24px',color:'#9CA3AF',fontSize:'0.8rem'}}>
                      <div style={{width:16,height:16,border:'2px solid #E5E7EB',borderTopColor:'#2563EB',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
                      Loading product data…
                    </div>
                  }>
                    <ProductDayAdmin managers={users} onRefresh={reload}/>
                  </Suspense>
                </div>
              </div>

              {/* ── Analytics-period chart (legacy) ── */}
              <div className="panel">
                <SectionHeader title="📊 Product Performance Chart" subtitle="Aggregated over selected period"
                  actions={
                    <div style={{display:'flex',gap:6}}>
                      {['week','month','year'].map(p => (
                        <button key={p} onClick={()=>setAnalyticsPeriod(p)}
                          style={{padding:'4px 12px',borderRadius:20,border:'1.5px solid',fontWeight:700,fontSize:'0.72rem',cursor:'pointer',background:analyticsPeriod===p?'#2563eb':'#f9fafb',color:analyticsPeriod===p?'#fff':'#6b7280',borderColor:analyticsPeriod===p?'#2563eb':'#e5e7eb'}}>
                          {p.charAt(0).toUpperCase()+p.slice(1)}
                        </button>
                      ))}
                    </div>
                  }
                />
                <div className="panel-body" style={{padding:'16px'}}>
                  <Suspense fallback={null}>
                    <ProductPerformance productEntries={analyticsData?.managerStats?.flatMap(m=>m.productPerformance)||[]} period={analyticsPeriod}/>
                  </Suspense>
                </div>
              </div>

            </div>
          )}

          {/* TAB: USERS */}
          {tab==='users' && (
            <div className="panel">
              <div className="panel-hdr">
                <div className="panel-title">All Users</div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span className="panel-count">{users.length} users</span>
                  <button className="panel-action" onClick={doProductionReset} style={{color:'#ef4444',borderColor:'#fca5a5'}}>Reset Data</button>
                  <button className="panel-action" onClick={()=>{setEditingUser(null);setUf(initUF);setUserModal(true)}}>+ New User</button>
                </div>
              </div>
              <div className="panel-body">
                {users.map((u,i) => (
                  <div key={u.id} className="user-row">
                    <div className="ur-avatar" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{u.full_name?.[0]}</div>
                    <div className="ur-info" style={{flex:1,minWidth:0}}>
                      <div className="ur-name">{u.full_name}</div>
                      <div className="ur-meta">@{u.username}{u.territory ? '  ' + u.territory : ''}</div>
                    </div>
                    <span className={'ur-badge ' + (u.role==='Admin' ? 'ur-badge-admin' : 'ur-badge-manager')}>{u.role==='Admin' ? 'Admin' : 'Manager'}</span>
                    <div className="ur-actions">
                      {user?.role==='Admin' && <button className="ur-btn" onClick={()=>openEditUser(u)} title="Edit">&#x270F;</button>}
                      {user?.role==='Admin' && u.role!=='Admin' && u.id!==user?.id && <button className="ur-btn ur-btn-del" onClick={()=>doDeleteUser(u.id,u.full_name)} title="Delete">&#x1F5D1;</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>{/* admin-content */}
      </div>{/* admin-main */}

      {/* USER MODAL */}
      {userModal && (
        <div className="modal-overlay" onClick={()=>setUserModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:'500px',width:'96%'}}>
            <div className="modal-hdr">
              <div className="modal-title">{editingUser ? 'Edit User' : 'Create New User'}</div>
              <button className="modal-close" onClick={()=>setUserModal(false)}>&#x2715;</button>
            </div>
            <div className="modal-body">
              {editingUser && (
                <div style={{background:'#eff6ff',border:'2px solid #2563eb',borderRadius:'10px',padding:'14px',marginBottom:'16px'}}>
                  <div style={{fontSize:'0.7rem',fontWeight:800,color:'#1d4ed8',letterSpacing:'0.08em',marginBottom:'10px'}}>CURRENT LOGIN CREDENTIALS</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'#374151',marginBottom:'4px'}}>USERNAME</div>
                      <div style={{background:'#fff',border:'1px solid #93c5fd',borderRadius:'7px',padding:'7px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'6px'}}>
                        <code style={{fontSize:'0.88rem',color:'#1e3a8a',fontWeight:800,flex:1}}>{editCreds.username}</code>
                        <button type="button" onClick={()=>{navigator.clipboard.writeText(editCreds.username);toastMsg('Copied!')}} style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}>&#x1F4CB;</button>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'#374151',marginBottom:'4px'}}>
                        PASSWORD{!editCreds.password && <span style={{color:'#f59e0b'}}> not recorded</span>}
                      </div>
                      <div style={{background:'#fff',border:'1px solid #93c5fd',borderRadius:'7px',padding:'7px 10px',display:'flex',alignItems:'center',gap:'4px'}}>
                        <code style={{fontSize:'0.88rem',color:editCreds.password?'#1e3a8a':'#9ca3af',fontWeight:800,flex:1}}>
                          {editCreds.password ? (editCreds.show ? editCreds.password : '••••••') : 'login once to capture'}
                        </code>
                        {editCreds.password && <>
                          <button type="button" onClick={()=>setEditCreds(p=>({...p,show:!p.show}))} style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}>{editCreds.show ? '&#x1F648;' : '&#x1F441;'}</button>
                          <button type="button" onClick={()=>{navigator.clipboard.writeText(editCreds.password);toastMsg('Password copied!')}} style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}>&#x1F4CB;</button>
                        </>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="row-2">
                <div className="fg"><label>Full Name *</label><input value={uf.full_name} onChange={e=>setUf(p=>({...p,full_name:e.target.value}))} placeholder="e.g. Akshay Bansode"/></div>
                <div className="fg">
                  <label>Username *</label>
                  <input value={uf.username} onChange={e=>setUf(p=>({...p,username:e.target.value.toLowerCase().replace(/\s+/g,'_')}))} placeholder="e.g. akshay_bansode" disabled={!!editingUser} style={editingUser?{background:'#f3f4f6',cursor:'not-allowed'}:{}}/>
                  {!editingUser && <small style={{color:'#6b7280',fontSize:'0.7rem'}}>Auto lowercase, spaces to _</small>}
                </div>
              </div>
              <div className="fg">
                <label>{editingUser ? 'Change Password (blank = keep current)' : 'Password *'}</label>
                <div style={{position:'relative',display:'flex',alignItems:'center'}}>
                  <input type={uf._showPwd?'text':'password'} value={uf.password} onChange={e=>setUf(p=>({...p,password:e.target.value}))} placeholder={editingUser?'Type to change password...':'Min. 4 characters'} style={{width:'100%',paddingRight:'40px'}}/>
                  <button type="button" onClick={()=>setUf(p=>({...p,_showPwd:!p._showPwd}))} style={{position:'absolute',right:'10px',background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}} tabIndex={-1}>{uf._showPwd ? '&#x1F648;' : '&#x1F441;'}</button>
                </div>
              </div>
              <div className="row-2">
                <div className="fg"><label>Email</label><input type="email" value={uf.email} onChange={e=>setUf(p=>({...p,email:e.target.value}))} placeholder="email@company.com"/></div>
                <div className="fg"><label>Phone</label><input value={uf.phone} onChange={e=>setUf(p=>({...p,phone:e.target.value}))} placeholder="+91 9999999999"/></div>
              </div>
              <div className="row-2">
                <div className="fg"><label>Territory</label><input value={uf.territory} onChange={e=>setUf(p=>({...p,territory:e.target.value}))} placeholder="e.g. Pune, Mumbai West..."/></div>
                <div className="fg"><label>Role</label><select value={uf.role} onChange={e=>setUf(p=>({...p,role:e.target.value}))}><option>Sales Manager</option><option>Admin</option></select></div>
              </div>
              {!editingUser && uf.username && uf.password && (
                <div style={{background:'#f0fdf4',border:'1.5px solid #86efac',borderRadius:'8px',padding:'10px 14px',fontSize:'0.8rem',color:'#166534'}}>
                  <strong>Share with user:</strong> Username: <code style={{background:'#dcfce7',padding:'1px 6px',borderRadius:'4px',fontWeight:700}}>{uf.username.toLowerCase().replace(/\s+/g,'_')}</code>
                  &nbsp;Password: <code style={{background:'#dcfce7',padding:'1px 6px',borderRadius:'4px',fontWeight:700}}>{uf.password}</code>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={()=>setUserModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={doCreateUser}>{editingUser ? 'Update User' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* TARGET MODAL */}
      {targetModal && (
        <div className="modal-overlay" onClick={()=>setTargetModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Assign Targets &mdash; {selectedMgrs.length} Manager(s)</div>
              <button className="modal-close" onClick={()=>setTargetModal(false)}>&#x2715;</button>
            </div>
            <div className="modal-body">
              <div className="row-2">
                <div className="fg"><label>Month</label><select value={tf.month} onChange={e=>setTf(p=>({...p,month:+e.target.value}))}>{MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select></div>
                <div className="fg"><label>Year</label><input type="number" value={tf.year} onChange={e=>setTf(p=>({...p,year:+e.target.value}))}/></div>
              </div>
              <div className="fg"><label>Visit Target (per month)</label><input type="number" value={tf.visit_target} onChange={e=>setTf(p=>({...p,visit_target:e.target.value}))} placeholder="e.g. 20"/></div>
              <div className="fg"><label>Sales Target (per month)</label><input type="number" value={tf.sales_target} onChange={e=>setTf(p=>({...p,sales_target:e.target.value}))} placeholder="e.g. 100000"/></div>
            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={()=>setTargetModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={doAssignTargets}>Assign Targets</button>
            </div>
          </div>
        </div>
      )}

      {showReplay && <Suspense fallback={<div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',zIndex:9999,color:'#fff',fontSize:'1rem',fontWeight:700}}>Loading Replay...</div>}><JourneyReplay onClose={()=>setShowReplay(false)}/></Suspense>}
      {tab==='heatmap' && <SalesHeatmapInline onReplay={()=>setShowReplay(true)}/>}
    </div>
  )
}

function SalesHeatmapInline({ onReplay }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button id="shm-inline-trigger" style={{display:'none'}} onClick={()=>setOpen(true)}/>
      {open && <SalesHeatmap onClose={()=>setOpen(false)}/>}
    </>
  )
}

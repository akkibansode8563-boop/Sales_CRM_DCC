import { useState, useEffect, useCallback, useMemo } from 'react'
import useAuthStore from '../store/authStore'
import dccLogo from '../assets/dcc-logo.png'
import {
  getUsers, getUsersAdmin, createUser, updateUser, deleteUser, adminSetPassword,
  getAnalytics, productionReset,
  getLiveStatus, bulkCreateTargets, getTargets,
  getDailySalesReports, getAllVisits, getProductDayEntries,
  getJourneyHistory, calcDistanceKm, calcTravelTime,
  getTerritoryStats
} from '../utils/localDB'
import JourneyReplay from '../components/JourneyReplay'
import SalesHeatmap  from '../components/SalesHeatmap'
import './AdminDashboard.css'

/* ── Constants ── */
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

/* ── Formatters ── */
const fmt     = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '--'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '--'
const fmtDateShort = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '--'

const NAV = [
  { id:'overview',  ico:'📊', lbl:'Overview' },
  { id:'managers',  ico:'👥', lbl:'Managers' },
  { id:'drilldown', ico:'🔍', lbl:'Manager Detail' },
  { id:'heatmap',   ico:'🔥', lbl:'Heatmap' },
  { id:'targets',   ico:'🎯', lbl:'Targets' },
  { id:'analytics', ico:'📈', lbl:'Analytics' },
  { id:'users',     ico:'⚙️', lbl:'Users' },
]

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const { user, logout } = useAuthStore()
  const [tab,           setTab]          = useState('overview')
  const [managers,      setManagers]     = useState([])
  const [users,         setUsers]        = useState([])
  const [toast,         setToast]        = useState(null)
  const [selectedMgrs,  setSelectedMgrs] = useState([])
  const [userModal,     setUserModal]    = useState(false)
  const [targetModal,   setTargetModal]  = useState(false)
  const [editingUser,   setEditingUser]  = useState(null)
  const [editCreds,     setEditCreds]    = useState({username:'',password:'',show:false})
  const [pwdEdit,       setPwdEdit]      = useState({})
  const [drillManager,  setDrillManager] = useState(null)  // selected manager for deep-dive
  const [showReplay,    setShowReplay]   = useState(false)
  const [terrStats,     setTerrStats]    = useState([])
  const [drillDate,     setDrillDate]    = useState(new Date().toISOString().split('T')[0])
  const [filterDate,    setFilterDate]   = useState(new Date().toISOString().split('T')[0])
  const [sidebarOpen,   setSidebarOpen]  = useState(false)
  const [analyticsPeriod, setAnalyticsPeriod] = useState('month')
  const [analyticsDate,   setAnalyticsDate]   = useState(new Date().toISOString().split('T')[0])
  const [analyticsData,   setAnalyticsData]   = useState(null)

  const initUF = { username:'',password:'',full_name:'',email:'',phone:'',territory:'',role:'Sales Manager' }
  const initTF = { visit_target:'',sales_target:'',month:new Date().getMonth()+1,year:new Date().getFullYear() }
  const [uf, setUf] = useState(initUF)
  const [tf, setTf] = useState(initTF)

  const today = new Date().toISOString().split('T')[0]

  const toastMsg = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3200) }

  const reload = useCallback(() => {
    setManagers(getLiveStatus())
    setUsers(getUsersAdmin())
    setTerrStats(getTerritoryStats())
  }, [])
  const loadAnalytics = useCallback((period, date) => {
    setAnalyticsData(getAnalytics(null, period, date))
  }, [])
  useEffect(() => { loadAnalytics(analyticsPeriod, analyticsDate) }, [analyticsPeriod, analyticsDate, loadAnalytics])
  const doProductionReset = () => {
    if (!window.confirm('⚠️ PRODUCTION RESET\n\nThis will:\n• Delete ALL sales managers\n• Delete ALL visits, journeys, reports\n• Keep only the Admin account\n\nType YES in the next prompt to confirm.')) return
    const confirm2 = window.prompt('Type YES to confirm production reset:')
    if (confirm2 !== 'YES') return toastMsg('Reset cancelled', 'error')
    productionReset()
    reload()
    toastMsg('✅ Production reset complete. All old data cleared.')
  }
  useEffect(() => { reload() }, [reload])

  /* ── User CRUD ── */
  const doCreateUser = async () => {
    const cleanUsername = uf.username.trim().toLowerCase().replace(/\s+/g, '_')
    if (!cleanUsername || !uf.full_name.trim()) return toastMsg('Username & full name required', 'error')
    if (!editingUser && !uf.password.trim()) return toastMsg('Password is required', 'error')
    if (!editingUser && uf.password.trim().length < 4) return toastMsg('Password must be at least 4 characters', 'error')
    const finalUf = { ...uf, username: cleanUsername, full_name: uf.full_name.trim() }
    try {
      if (editingUser) { await updateUser(editingUser.id, finalUf); toastMsg('User updated ✅') }
      else { await createUser(finalUf); toastMsg('User "' + cleanUsername + '" created! pwd: ' + uf.password.trim()) }
      setUserModal(false); setEditingUser(null); setUf(initUF); reload()
    } catch(e) { toastMsg(e.message, 'error') }
  }
  const doAdminSetPwd = async (userId, newPwd) => {
    if (!newPwd || newPwd.trim().length < 4) return toastMsg('Min 4 characters', 'error')
    try { await adminSetPassword(userId, newPwd.trim()); setPwdEdit({}); reload(); toastMsg('Password updated ✅') }
    catch(e) { toastMsg(e.message, 'error') }
  }
  const doDeleteUser = (id, name) => {
    if (!window.confirm(`Delete ${name}?`)) return
    try { deleteUser(id); reload(); toastMsg('User deleted') }
    catch(e) { toastMsg(e.message,'error') }
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
    toastMsg(`Targets set for ${selectedMgrs.length} manager(s) ✅`); reload()
  }

  /* ── Derived data ── */
  const salesManagers = users.filter(u=>u.role==='Sales Manager')
  const onField       = managers.filter(m=>m.status==='On Field').length
  const totalVisitsToday = managers.reduce((s,m)=>s+m.visits_today,0)
  const activeJourneys   = managers.filter(m=>m.active_journey).length
  const totalSalesToday  = managers.reduce((s,m)=>s+m.today_sales,0)

  /* ── Build full manager report rows ── */
  const buildManagerData = useCallback((date=today) => {
    return salesManagers.map((m,i) => {
      const allVisitsData  = getAllVisits(m.id)
      const dayVisits      = allVisitsData.filter(v=>v.visit_date===date)
      const reports        = getDailySalesReports(m.id)
      const dayReport      = reports.find(r=>r.date===date)
      const allProducts    = getProductDayEntries(m.id)
      const dayProducts    = allProducts.filter(p=>p.date===date)
      const targets        = getTargets(m.id)
      const monthTarget    = targets.find(t=>t.month===new Date(date).getMonth()+1&&t.year===new Date(date).getFullYear())
                          || targets.sort((a,b)=>b.year-a.year||b.month-a.month)[0]
      const journeys       = getJourneyHistory(m.id)
      const liveData       = managers.find(mg=>mg.id===m.id)

      const salesPct  = monthTarget?.sales_target&&dayReport ? Math.round((dayReport.sales_achievement/monthTarget.sales_target)*100) : 0
      const visitPct  = monthTarget?.visit_target&&dayVisits.length ? Math.round((dayVisits.length/monthTarget.visit_target)*100) : 0
      const totalProdAchieved = dayProducts.reduce((s,p)=>s+p.achieved_amount,0)
      const totalProdTarget   = dayProducts.reduce((s,p)=>s+p.target_amount,0)

      return {
        ...m, color: AVATAR_COLORS[i%AVATAR_COLORS.length],
        dayVisits, dayReport, dayProducts, monthTarget, journeys,
        liveData, salesPct, visitPct,
        totalProdAchieved, totalProdTarget,
        allVisitsCount: allVisitsData.length,
        totalReports: reports.length,
        totalProducts: allProducts.length,
      }
    })
  }, [salesManagers, managers, today])

  const managerRows   = useMemo(() => buildManagerData(filterDate),  [buildManagerData, filterDate])
  const drillData     = useMemo(() => drillManager ? buildManagerData(drillDate).find(m=>m.id===drillManager.id) : null, [buildManagerData, drillDate, drillManager])

  const openDrilldown = (mgr) => {
    setDrillManager(mgr)
    setDrillDate(filterDate)
    setTab('drilldown')
    setSidebarOpen(false)
  }

  /* ── KPI Summary ── */
  const KPIs = () => (
    <div className="kpi-bar-4">
      {[
        { n:salesManagers.length, l:'Total Managers', ico:'👥', bg:'#EFF6FF', tc:'#2563EB', pill:`${users.length} total users` },
        { n:onField,              l:'On Field Now',   ico:'🚗', bg:'#ECFDF5', tc:'#059669', pill:onField>0?'🟢 Active':'None on field' },
        { n:totalVisitsToday,     l:'Visits Today',   ico:'📍', bg:'#FFFBEB', tc:'#D97706', pill:`${activeJourneys} live routes` },
        { n:fmt(totalSalesToday), l:'Sales Today',    ico:'💰', bg:'#F5F3FF', tc:'#7C3AED', pill:'all managers' },
      ].map((k,i)=>(
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

  /* ── Sidebar ── */
  const Sidebar = () => (
    <>
      {sidebarOpen && <div className="sb-overlay" onClick={()=>setSidebarOpen(false)}/>}
      <aside className={`sidebar ${sidebarOpen?'sb-open':''}`}>
        <div className="sb-header">
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <img src={dccLogo} alt="DCC Logo" className="sb-logo-img"/>
            </div>
            <div>
              <div className="sb-logo-name">DCC SalesForce</div>
              <div className="sb-logo-sub">Admin Console</div>
            </div>
          </div>
        </div>
        <nav className="sb-nav">
          <span className="sb-grp-lbl">Dashboard</span>
          {NAV.slice(0,3).map(n=>(
            <button key={n.id} className={`sb-item ${tab===n.id?'sb-active':''}`}
              onClick={()=>{setTab(n.id);setSidebarOpen(false)}}>
              <div className="sb-item-ico-wrap">{n.ico}</div>
              <span className="sb-item-lbl">{n.lbl}</span>
              {n.id==='overview' && onField>0 && <span className="sb-live-badge">{onField} live</span>}
            </button>
          ))}
          <span className="sb-grp-lbl">Management</span>
          {NAV.slice(3).map(n=>(
            <button key={n.id} className={`sb-item ${tab===n.id?'sb-active':''}`}
              onClick={()=>{setTab(n.id);setSidebarOpen(false)}}>
              <div className="sb-item-ico-wrap">{n.ico}</div>
              <span className="sb-item-lbl">{n.lbl}</span>
            </button>
          ))}
        </nav>
        <div className="sb-footer">
          <div className="sb-user">
            <div className="sb-user-avatar">{user?.full_name?.[0]}</div>
            <div><div className="sb-user-name">{user?.full_name}</div><div className="sb-user-role">Administrator</div></div>
            <button className="sb-logout" onClick={logout} title="Sign out">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 12H3a1 1 0 01-1-1V3a1 1 0 011-1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  )

  return (
    <div className="admin-root">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <Sidebar/>

      <div className="admin-main">
        {/* ── Mobile Header ── */}
        <div className="admin-mobile-header">
          <button className="amh-menu" onClick={()=>setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
          <div className="amh-logo">
            <div className="amh-logo-ico">
              <img src={dccLogo} alt="DCC" className="amh-logo-img"/>
            </div>
            <span className="amh-logo-name">Admin Console</span>
          </div>
          <div className="amh-actions">
            <button className="amh-btn" onClick={reload}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M13 7.5A5.5 5.5 0 112.5 5M2 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="amh-btn" onClick={logout}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M5 13H3a1 1 0 01-1-1V3a1 1 0 011-1h2M10 10l3-3-3-3M13 7H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
        <div className="admin-mobile-tabs">
          {NAV.map(n=><button key={n.id} className={`amt ${tab===n.id?'amt-active':''}`} onClick={()=>setTab(n.id)}>{n.ico} {n.lbl}</button>)}
        </div>

        {/* ── Desktop Topbar ── */}
        <div className="admin-topbar">
          <div>
            <div className="atb-title">{NAV.find(n=>n.id===tab)?.ico} {NAV.find(n=>n.id===tab)?.lbl}</div>
            <div className="atb-sub">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
          </div>
          <div className="atb-right">
            {(tab==='overview'||tab==='managers') && (
              <div className="atb-date-wrap">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 1v2M9 1v2M1 5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} className="atb-date"/>
              </div>
            )}
            <button className="atb-btn" onClick={reload}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5A4.5 4.5 0 102.5 4M2 2v2.5H4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Refresh
            </button>
            {tab==='users'&&<button className="atb-btn-primary" onClick={()=>{setEditingUser(null);setUf(initUF);setUserModal(true)}}>+ New User</button>}
            {tab==='targets'&&selectedMgrs.length>0&&<button className="atb-btn-primary" onClick={()=>setTargetModal(true)}>Set Targets ({selectedMgrs.length})</button>}
          </div>
        </div>

        <div className="admin-content">

          {/* ════════════════════════════════════════
              TAB: OVERVIEW
              ════════════════════════════════════════ */}
          {tab==='overview' && (
            <>
              <KPIs/>

              {/* Team Summary Table */}
              <div className="panel">
                <div className="panel-hdr">
                  <div className="panel-title">Team Activity — {fmtDate(filterDate)}</div>
                  <span className="panel-count">{salesManagers.length} managers</span>
                </div>
                <div className="panel-body" style={{overflowX:'auto'}}>
                  {managerRows.length===0
                    ? <div className="empty"><div className="empty-ico">👥</div><div className="empty-txt">No managers yet.</div></div>
                    : (
                      <table className="analytics-table">
                        <thead className="at-head">
                          <tr>
                            <th>Manager</th><th>Status</th><th>Visits</th>
                            <th>Sales Target</th><th>Sales Done</th><th>Achv%</th>
                            <th>Profit</th><th>Products</th><th>Action</th>
                          </tr>
                        </thead>
                        <tbody className="at-body">
                          {managerRows.map(m=>{
                            const sm=STATUS_META[m.liveData?.status]||STATUS_META['In-Office']
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
                                    <span className="at-mono">{m.dayVisits.length}</span>
                                    {m.monthTarget?.visit_target && <span className="at-of">/{m.monthTarget.visit_target}</span>}
                                  </div>
                                </td>
                                <td><span className="at-mono">{m.monthTarget?fmt(m.monthTarget.sales_target):'—'}</span></td>
                                <td><span className="at-mono">{m.dayReport?fmt(m.dayReport.sales_achievement):'—'}</span></td>
                                <td>
                                  {m.salesPct>0
                                    ? <span className="at-pct-badge" style={{background:m.salesPct>=100?'#ECFDF5':m.salesPct>=75?'#EFF6FF':'#FFFBEB',color:m.salesPct>=100?'#059669':m.salesPct>=75?'#2563EB':'#D97706'}}>
                                        {m.salesPct}%
                                      </span>
                                    : <span style={{color:'#9CA3AF',fontSize:'0.8rem'}}>—</span>
                                  }
                                </td>
                                <td><span className="at-mono">{m.dayReport?fmt(m.dayReport.profit_achievement):'—'}</span></td>
                                <td><span className="at-mono">{m.dayProducts.length} entries</span></td>
                                <td>
                                  <button className="at-drill-btn" onClick={()=>openDrilldown(m)}>
                                    View Detail →
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  }
                </div>
              </div>

              {/* Live Status Cards */}
              <div className="panel">
                <div className="panel-hdr">
                  <div className="panel-title">🔴 Live Field Status</div>
                  <div style={{display:'flex',gap:8}}>
                    <button className="panel-action" onClick={()=>setShowReplay(true)}>🎬 Journey Replay</button>
                    <button className="panel-action" onClick={()=>setTab('heatmap')}>🔥 Heatmap</button>
                    <button className="panel-action" onClick={reload}>Refresh</button>
                  </div>
                </div>
                <div className="panel-body">
                  {managers.length===0
                    ? <div className="empty"><div className="empty-ico">📡</div><div className="empty-txt">No field data yet.</div></div>
                    : <div className="live-grid">
                      {managers.map((m,i)=>{
                        const sm=STATUS_META[m.status]||STATUS_META['In-Office']
                        return (
                          <div key={m.id} className="live-card" onClick={()=>openDrilldown(m)}>
                            <div className="lc-top">
                              <div className="lc-avatar" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{m.name?.[0]}</div>
                              <div className="lc-info">
                                <div className="lc-name">{m.name}</div>
                                <div className="lc-territory">📍 {m.territory||'—'}</div>
                              </div>
                              <div className="lc-status" style={{background:sm.bg,color:sm.color}}>
                                <span style={{width:6,height:6,borderRadius:'50%',background:sm.color,display:'inline-block',animation:m.status==='On Field'?'pulse 1.5s infinite':'none'}}/>
                                {m.status}
                              </div>
                            </div>
                            <div className="lc-metrics">
                              <div className="lc-metric">
                                <div className="lc-metric-val">{m.visits_today}</div>
                                <div className="lc-metric-lbl">Visits</div>
                              </div>
                              <div className="lc-metric">
                                <div className="lc-metric-val" style={{color:m.today_sales>0?'#2563EB':'#9CA3AF',fontSize:'0.78rem'}}>{fmt(m.today_sales)}</div>
                                <div className="lc-metric-lbl">Sales</div>
                              </div>
                              <div className="lc-metric">
                                <div className="lc-metric-val" style={{color:m.active_journey?'#10B981':'#9CA3AF'}}>{m.active_journey?'🟢 ON':'⭕ OFF'}</div>
                                <div className="lc-metric-lbl">Journey</div>
                              </div>
                            </div>
                            {m.last_location && <div className="lc-location">📍 {m.last_location.name?.split(',').slice(0,2).join(', ')} · {fmtTime(m.last_location.time)}</div>}
                            <div className="lc-drill-hint">Tap for full detail →</div>
                          </div>
                        )
                      })}
                    </div>
                  }
                </div>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════
              TAB: MANAGERS LIST
              ════════════════════════════════════════ */}
          {tab==='managers' && (
            <>
              <KPIs/>
              <div className="panel">
                <div className="panel-hdr">
                  <div className="panel-title">All Managers — {fmtDate(filterDate)}</div>
                  <span className="panel-count">{salesManagers.length} managers</span>
                </div>
                <div className="mgr-cards-grid">
                  {managerRows.length===0
                    ? <div className="empty" style={{gridColumn:'1/-1'}}><div className="empty-ico">👥</div><div className="empty-txt">No managers found.</div></div>
                    : managerRows.map(m=>{
                      const sm=STATUS_META[m.liveData?.status]||STATUS_META['In-Office']
                      return (
                        <div key={m.id} className="mgr-full-card">
                          {/* Card Header */}
                          <div className="mfc-header">
                            <div className="mfc-avatar" style={{background:m.color}}>{m.full_name?.[0]}</div>
                            <div className="mfc-info">
                              <div className="mfc-name">{m.full_name}</div>
                              <div className="mfc-meta">@{m.username} · {m.territory||'No territory'}</div>
                            </div>
                            <span className="mfc-status" style={{background:sm.bg,color:sm.color}}>
                              <span style={{width:5,height:5,borderRadius:'50%',background:sm.color,display:'inline-block',marginRight:4,animation:m.liveData?.status==='On Field'?'pulse 1.5s infinite':'none'}}/>
                              {m.liveData?.status||'In-Office'}
                            </span>
                          </div>

                          {/* Sales Progress */}
                          <div className="mfc-section-lbl">Sales Performance</div>
                          <div className="mfc-sales-row">
                            <div className="mfc-sales-num">{m.dayReport?fmt(m.dayReport.sales_achievement):'₹0'}</div>
                            <div className="mfc-sales-of">of {m.monthTarget?fmt(m.monthTarget.sales_target):'—'}</div>
                            {m.salesPct>0 && (
                              <span className="mfc-pct" style={{background:m.salesPct>=100?'#ECFDF5':m.salesPct>=75?'#EFF6FF':'#FFFBEB',color:m.salesPct>=100?'#059669':m.salesPct>=75?'#2563EB':'#D97706'}}>
                                {m.salesPct}%
                              </span>
                            )}
                          </div>
                          {m.monthTarget?.sales_target>0 && (
                            <div className="mfc-bar">
                              <div className="mfc-bar-fill" style={{width:`${Math.min(m.salesPct,100)}%`,background:m.salesPct>=100?'#10B981':m.salesPct>=75?'#2563EB':'#F59E0B'}}/>
                            </div>
                          )}

                          {/* KPI row */}
                          <div className="mfc-kpi-row">
                            <div className="mfc-kpi">
                              <div className="mfc-kpi-val">{m.dayVisits.length}</div>
                              <div className="mfc-kpi-lbl">Visits Today</div>
                            </div>
                            <div className="mfc-kpi">
                              <div className="mfc-kpi-val">{m.dayReport?fmt(m.dayReport.profit_achievement):'—'}</div>
                              <div className="mfc-kpi-lbl">Profit</div>
                            </div>
                            <div className="mfc-kpi">
                              <div className="mfc-kpi-val">{m.dayProducts.length}</div>
                              <div className="mfc-kpi-lbl">Products</div>
                            </div>
                            <div className="mfc-kpi">
                              <div className="mfc-kpi-val">{m.liveData?.active_journey?'🟢':'⭕'}</div>
                              <div className="mfc-kpi-lbl">Journey</div>
                            </div>
                          </div>

                          {/* Visit status strip */}
                          {m.dayVisits.length>0 && (
                            <div className="mfc-visits-strip">
                              <div className="mfc-section-lbl">Today's Visits</div>
                              {m.dayVisits.slice(0,3).map((v,i)=>(
                                <div key={v.id} className="mfc-visit-row">
                                  <span className="mfc-visit-num" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{i+1}</span>
                                  <div className="mfc-visit-body">
                                    <div className="mfc-visit-name">{v.client_name||v.customer_name}</div>
                                    <div className="mfc-visit-meta">{v.client_type} · {v.location?.split(',')[0]}</div>
                                  </div>
                                  <span className="mfc-visit-time">{fmtTime(v.created_at)}</span>
                                </div>
                              ))}
                              {m.dayVisits.length>3 && <div className="mfc-more">+{m.dayVisits.length-3} more visits</div>}
                            </div>
                          )}

                          {/* Product summary */}
                          {m.dayProducts.length>0 && (
                            <div className="mfc-products-strip">
                              <div className="mfc-section-lbl">Product Entries</div>
                              {m.dayProducts.slice(0,2).map(p=>{
                                const pct=p.target_qty>0?Math.round((p.achieved_qty/p.target_qty)*100):0
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
                              {m.dayProducts.length>2 && <div className="mfc-more">+{m.dayProducts.length-2} more products</div>}
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

          {/* ════════════════════════════════════════
              TAB: MANAGER DRILLDOWN
              ════════════════════════════════════════ */}
          {tab==='drilldown' && (
            <>
              {!drillManager
                ? (
                  <div className="panel">
                    <div className="panel-body">
                      <div className="empty">
                        <div className="empty-ico">🔍</div>
                        <div className="empty-txt">Select a manager from the Overview or Managers tab to view their full activity.</div>
                        <button className="empty-cta" onClick={()=>setTab('managers')}>← Go to Managers</button>
                      </div>
                    </div>
                  </div>
                )
                : drillData && (
                  <>
                    {/* Drilldown header */}
                    <div className="drill-header">
                      <button className="drill-back" onClick={()=>setTab('managers')}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8 2L4 6.5 8 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Back
                      </button>
                      <div className="drill-profile">
                        <div className="drill-avatar" style={{background:drillData.color}}>{drillData.full_name?.[0]}</div>
                        <div>
                          <div className="drill-name">{drillData.full_name}</div>
                          <div className="drill-meta">@{drillData.username} · {drillData.territory||'No territory'} · {drillData.email||'—'}</div>
                        </div>
                      </div>
                      <div className="drill-date-wrap">
                        <label>Viewing date:</label>
                        <input type="date" value={drillDate} onChange={e=>setDrillDate(e.target.value)} className="atb-date"/>
                      </div>
                    </div>

                    {/* Summary KPIs */}
                    <div className="drill-kpi-row">
                      {[
                        { ico:'📍', v:drillData.dayVisits.length, l:'Visits', bg:'#ECFDF5', tc:'#059669', sub:`Target: ${drillData.monthTarget?.visit_target||'—'}` },
                        { ico:'💰', v:drillData.dayReport?fmt(drillData.dayReport.sales_achievement):'₹0', l:'Sales', bg:'#EFF6FF', tc:'#2563EB', sub:drillData.salesPct>0?`${drillData.salesPct}% of target`:'No target set' },
                        { ico:'📈', v:drillData.dayReport?fmt(drillData.dayReport.profit_achievement):'₹0', l:'Profit', bg:'#ECFDF5', tc:'#059669', sub:drillData.dayReport?`${drillData.dayReport.profit_percentage||0}% margin`:'—' },
                        { ico:'📦', v:drillData.dayProducts.length, l:'Products', bg:'#F5F3FF', tc:'#7C3AED', sub:`₹${Number(drillData.totalProdAchieved).toLocaleString('en-IN')} value` },
                        { ico:'🗺️', v:drillData.liveData?.active_journey?'Active':'Idle', l:'Journey', bg:drillData.liveData?.active_journey?'#ECFDF5':'#F3F4F6', tc:drillData.liveData?.active_journey?'#059669':'#6B7280', sub:drillData.liveData?.status||'In-Office' },
                        { ico:'📊', v:drillData.allVisitsCount, l:'Total Visits', bg:'#FFFBEB', tc:'#D97706', sub:`${drillData.totalReports} reports` },
                      ].map((k,i)=>(
                        <div key={i} className="drill-kpi">
                          <div className="drill-kpi-ico" style={{background:k.bg}}>{k.ico}</div>
                          <div className="drill-kpi-val">{k.v}</div>
                          <div className="drill-kpi-lbl">{k.l}</div>
                          <div className="drill-kpi-sub">{k.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sales Report Detail */}
                    <div className="content-grid two">
                      <div className="panel">
                        <div className="panel-hdr">
                          <div className="panel-title">📊 Sales Report — {fmtDateShort(drillDate)}</div>
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
                                ].map((r,i)=>(
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
                                  <div className="dr-bar-fill" style={{width:`${Math.min(drillData.salesPct,100)}%`,background:drillData.salesPct>=100?'#10B981':drillData.salesPct>=75?'#2563EB':'#F59E0B'}}/>
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
                              <div className="empty-ico">📊</div>
                              <div className="empty-txt">No sales report submitted for {fmtDateShort(drillDate)}.</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Visit Summary */}
                      <div className="panel">
                        <div className="panel-hdr">
                          <div className="panel-title">📍 Visits — {fmtDateShort(drillDate)}</div>
                          <span className="panel-count">{drillData.dayVisits.length} visits</span>
                        </div>
                        <div className="panel-body">
                          {drillData.dayVisits.length===0
                            ? <div className="empty" style={{padding:'32px 0'}}><div className="empty-ico">📍</div><div className="empty-txt">No visits on {fmtDateShort(drillDate)}.</div></div>
                            : drillData.dayVisits.map((v,i)=>(
                              <div key={v.id} className="dd-visit-row">
                                <div className="ddv-num" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{i+1}</div>
                                <div className="ddv-body">
                                  <div className="ddv-name">{v.client_name||v.customer_name}</div>
                                  <div className="ddv-meta">
                                    <span className="ddv-tag">{v.client_type}</span>
                                    <span>{v.location?.split(',')[0]}</span>
                                  </div>
                                  {v.notes && <div className="ddv-notes">💬 {v.notes}</div>}
                                  <div className="ddv-type">{v.visit_type}</div>
                                </div>
                                <div className="ddv-time">{fmtTime(v.created_at)}</div>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    </div>

                    {/* Product Day Entries */}
                    <div className="panel">
                      <div className="panel-hdr">
                        <div className="panel-title">📦 Product Day Entries — {fmtDateShort(drillDate)}</div>
                        <span className="panel-count">{drillData.dayProducts.length} entries</span>
                      </div>
                      <div className="panel-body">
                        {drillData.dayProducts.length===0
                          ? <div className="empty" style={{padding:'32px 0'}}><div className="empty-ico">📦</div><div className="empty-txt">No product entries on {fmtDateShort(drillDate)}.</div></div>
                          : (
                            <div style={{overflowX:'auto'}}>
                              <table className="analytics-table">
                                <thead className="at-head">
                                  <tr><th>Brand</th><th>Product</th><th>Target Qty</th><th>Achieved Qty</th><th>Performance %</th><th>Target Value</th><th>Achieved Value</th></tr>
                                </thead>
                                <tbody className="at-body">
                                  {drillData.dayProducts.map(p=>{
                                    const pct=p.target_qty>0?Math.round((p.achieved_qty/p.target_qty)*100):0
                                    const c=pct>=100?'#059669':pct>=75?'#2563EB':'#D97706'
                                    const bg=pct>=100?'#ECFDF5':pct>=75?'#EFF6FF':'#FFFBEB'
                                    return (
                                      <tr key={p.id}>
                                        <td><span className="prod-brand-tag">{p.brand}</span></td>
                                        <td><span className="at-name">{p.product_name}</span></td>
                                        <td><span className="at-mono">{p.target_qty}</span></td>
                                        <td><span className="at-mono">{p.achieved_qty}</span></td>
                                        <td>
                                          <div className="prod-pct-cell">
                                            <div className="prod-mini-bar"><div style={{width:`${Math.min(pct,100)}%`,height:'100%',background:c,borderRadius:99}}/></div>
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

                    {/* All Past Reports */}
                    <div className="panel">
                      <div className="panel-hdr">
                        <div className="panel-title">📅 Sales History — All Reports</div>
                        <span className="panel-count">{getDailySalesReports(drillData.id).length} reports</span>
                      </div>
                      <div className="panel-body" style={{overflowX:'auto'}}>
                        {getDailySalesReports(drillData.id).length===0
                          ? <div className="empty" style={{padding:32}}><div className="empty-ico">📅</div><div className="empty-txt">No history yet.</div></div>
                          : (
                            <table className="analytics-table">
                              <thead className="at-head">
                                <tr><th>Date</th><th>Sales Target</th><th>Sales Done</th><th>Achievement</th><th>Profit</th><th>Margin</th></tr>
                              </thead>
                              <tbody className="at-body">
                                {getDailySalesReports(drillData.id).map(r=>{
                                  const pct=r.sales_percentage||0
                                  const c=pct>=100?'#059669':pct>=75?'#2563EB':'#D97706'
                                  const bg=pct>=100?'#ECFDF5':pct>=75?'#EFF6FF':'#FFFBEB'
                                  return (
                                    <tr key={r.id}>
                                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem'}}>{fmtDate(r.date)}</span></td>
                                      <td><span className="at-mono">{fmt(r.sales_target)}</span></td>
                                      <td><span className="at-mono">{fmt(r.sales_achievement)}</span></td>
                                      <td>{pct>0?<span className="at-pct-badge" style={{background:bg,color:c}}>{pct}%</span>:<span style={{color:'#9CA3AF'}}>—</span>}</td>
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

          {/* ════════════════════════════════════════
              TAB: HEATMAP
              ════════════════════════════════════════ */}
          {tab==='heatmap' && (
            <>
              <KPIs/>
              {/* Territory Stats */}
              <div className="panel">
                <div className="panel-hdr">
                  <div className="panel-title">🗂️ Territory Performance</div>
                  <button className="panel-action" onClick={reload}>Refresh</button>
                </div>
                <div className="panel-body" style={{overflowX:'auto'}}>
                  {terrStats.length===0
                    ? <div className="empty"><div className="empty-ico">🗺️</div><div className="empty-txt">No territory data yet.</div></div>
                    : (
                      <table className="analytics-table">
                        <thead className="at-head">
                          <tr><th>Territory</th><th>Managers</th><th>Customers</th><th>Total Visits</th><th>Today</th></tr>
                        </thead>
                        <tbody className="at-body">
                          {terrStats.map((t,i)=>(
                            <tr key={t.name}>
                              <td><div className="at-mgr"><div className="at-av" style={{background:['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED'][i%5],fontSize:'0.65rem'}}>{t.name?.[0]}</div><div className="at-name">{t.name}</div></div></td>
                              <td><span className="at-mono">{t.managers}</span></td>
                              <td><span className="at-mono">{t.customers}</span></td>
                              <td><span className="at-mono">{t.visits_total}</span></td>
                              <td>{t.visits_today>0?<span className="at-pct-badge" style={{background:'#ECFDF5',color:'#059669'}}>{t.visits_today}</span>:<span style={{color:'#9CA3AF'}}>—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }
                </div>
              </div>
              {/* Heatmap + Journey Replay Buttons */}
              <div className="heatmap-action-row">
                <div className="hmap-action-card" onClick={()=>setShowReplay(true)}>
                  <div className="hmap-card-ico">🎬</div>
                  <div className="hmap-card-title">Journey Replay</div>
                  <div className="hmap-card-sub">Replay any salesperson's full day route with timeline and suspicious activity flags</div>
                  <div className="hmap-card-btn">Open Replay →</div>
                </div>
                <div className="hmap-action-card" id="shm-open-btn" onClick={()=>{ document.getElementById('shm-inline-trigger')?.click() }}>
                  <div className="hmap-card-ico">🔥</div>
                  <div className="hmap-card-title">Sales Heatmap</div>
                  <div className="hmap-card-sub">Interactive map showing visit density, GPS trails, and territory coverage analysis</div>
                  <div className="hmap-card-btn">Open Heatmap →</div>
                </div>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════
              TAB: TARGETS
              ════════════════════════════════════════ */}
          {tab==='targets' && (
            <div className="panel">
              <div className="panel-hdr">
                <div className="panel-title">🎯 Assign Monthly Targets</div>
                {selectedMgrs.length>0 && <button className="panel-action" onClick={()=>setTargetModal(true)}>Set for {selectedMgrs.length} →</button>}
              </div>
              <div className="panel-body">
                {salesManagers.length===0
                  ? <div className="empty"><div className="empty-ico">👥</div><div className="empty-txt">No managers yet.</div></div>
                  : <>
                    <div className="target-hint">Select managers to bulk-assign monthly targets.</div>
                    {salesManagers.map((m,i)=>{
                      const sel=selectedMgrs.includes(m.id)
                      const tgts=getTargets(m.id)
                      const lt=tgts.sort((a,b)=>b.year-a.year||b.month-a.month)[0]
                      return (
                        <div key={m.id} className={`mgr-select ${sel?'mgr-sel':''}`}
                          onClick={()=>setSelectedMgrs(p=>p.includes(m.id)?p.filter(x=>x!==m.id):[...p,m.id])}>
                          <div className="ms-av" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{m.full_name?.[0]}</div>
                          <div className="ms-info">
                            <div className="ms-name">{m.full_name}</div>
                            <div className="ms-sub">@{m.username} · {m.territory||'No territory'}</div>
                            {lt && <div className="ms-tgt">Current: {lt.visit_target} visits · {fmt(lt.sales_target)}/mo — {MONTHS[lt.month-1]} {lt.year}</div>}
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
                    {selectedMgrs.length>0 && (
                      <button className="assign-btn" onClick={()=>setTargetModal(true)}>
                        Set Targets for {selectedMgrs.length} Manager(s) →
                      </button>
                    )}
                  </>
                }
              </div>
            </div>
          )}


          {/* ════════════════════════════════════════
              TAB: ANALYTICS
              ════════════════════════════════════════ */}
          {tab==='analytics' && (
            <div>
              {/* Controls */}
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:20,background:'#fff',borderRadius:12,padding:'14px 18px',boxShadow:'0 1px 4px rgba(0,0,0,0.07)'}}>
                <div style={{fontWeight:700,fontSize:'0.85rem',color:'#374151',marginRight:4}}>📈 Analytics</div>
                {['week','month','year'].map(p=>(
                  <button key={p} onClick={()=>setAnalyticsPeriod(p)}
                    style={{padding:'6px 16px',borderRadius:8,border:'1.5px solid',fontWeight:600,fontSize:'0.82rem',cursor:'pointer',
                      background:analyticsPeriod===p?'#2563eb':'#fff',
                      color:analyticsPeriod===p?'#fff':'#6b7280',
                      borderColor:analyticsPeriod===p?'#2563eb':'#e5e7eb'}}>
                    {p.charAt(0).toUpperCase()+p.slice(1)}
                  </button>
                ))}
                <input type="date" value={analyticsDate} onChange={e=>setAnalyticsDate(e.target.value)}
                  style={{padding:'6px 10px',border:'1.5px solid #e5e7eb',borderRadius:8,fontSize:'0.82rem',color:'#374151'}}/>
                {analyticsData && (
                  <span style={{marginLeft:'auto',fontSize:'0.78rem',color:'#9ca3af'}}>
                    {analyticsData.dateFrom} → {analyticsData.dateTo}
                  </span>
                )}
              </div>

              {analyticsData && (<>
                {/* Summary KPIs */}
                <div className="kpi-bar-4" style={{marginBottom:20}}>
                  {[
                    {ico:'📍',n:analyticsData.totals.visits,    l:'Total Visits',  bg:'#ECFDF5',tc:'#059669'},
                    {ico:'💰',n:fmt(analyticsData.totals.sales), l:'Total Sales',   bg:'#EFF6FF',tc:'#2563EB'},
                    {ico:'📈',n:fmt(analyticsData.totals.profit),l:'Total Profit',  bg:'#F5F3FF',tc:'#7C3AED'},
                    {ico:'🎯',n:(analyticsData.totals.salesPct)+'%',l:'Sales Achievement',bg:'#FFFBEB',tc:'#D97706'},
                  ].map((k,i)=>(
                    <div key={i} className="akpi">
                      <div className="akpi-top"><div className="akpi-ico" style={{background:k.bg}}>{k.ico}</div></div>
                      <div className="akpi-val" style={{fontSize:'1.5rem'}}>{k.n}</div>
                      <div className="akpi-lbl">{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* Daily Visit Trend */}
                <div className="panel" style={{marginBottom:18}}>
                  <div className="panel-hdr"><div className="panel-title">📅 Daily Visit Trend</div></div>
                  <div className="panel-body" style={{overflowX:'auto'}}>
                    {Object.keys(analyticsData.dailyTrend).length === 0
                      ? <div className="empty"><div className="empty-ico">📅</div><div className="empty-txt">No visits in this period.</div></div>
                      : (
                        <div style={{display:'flex',gap:4,alignItems:'flex-end',minHeight:80,padding:'8px 0',flexWrap:'wrap'}}>
                          {Object.entries(analyticsData.dailyTrend).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,count])=>{
                            const max=Math.max(...Object.values(analyticsData.dailyTrend))
                            const h=max>0?Math.max(12,Math.round((count/max)*80)):12
                            return (
                              <div key={date} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,minWidth:28}}>
                                <span style={{fontSize:'0.6rem',color:'#2563eb',fontWeight:700}}>{count}</span>
                                <div style={{width:20,height:h,background:'#2563eb',borderRadius:'4px 4px 0 0',opacity:0.85}}/>
                                <span style={{fontSize:'0.55rem',color:'#9ca3af',transform:'rotate(-45deg)',transformOrigin:'top left',whiteSpace:'nowrap',marginTop:6}}>
                                  {new Date(date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    }
                  </div>
                </div>

                {/* Daily Sales Trend */}
                <div className="panel" style={{marginBottom:18}}>
                  <div className="panel-hdr"><div className="panel-title">💰 Daily Sales Trend</div></div>
                  <div className="panel-body" style={{overflowX:'auto'}}>
                    {Object.keys(analyticsData.allDailySales).length === 0
                      ? <div className="empty"><div className="empty-ico">💰</div><div className="empty-txt">No sales reports in this period.</div></div>
                      : (
                        <div style={{display:'flex',gap:4,alignItems:'flex-end',minHeight:80,padding:'8px 0',flexWrap:'wrap'}}>
                          {Object.entries(analyticsData.allDailySales).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,amt])=>{
                            const max=Math.max(...Object.values(analyticsData.allDailySales))
                            const h=max>0?Math.max(12,Math.round((amt/max)*80)):12
                            return (
                              <div key={date} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,minWidth:28}}>
                                <span style={{fontSize:'0.55rem',color:'#059669',fontWeight:700'}}>₹{(amt/1000).toFixed(0)}k</span>
                                <div style={{width:20,height:h,background:'#10b981',borderRadius:'4px 4px 0 0',opacity:0.85}}/>
                                <span style={{fontSize:'0.55rem',color:'#9ca3af',transform:'rotate(-45deg)',transformOrigin:'top left',whiteSpace:'nowrap',marginTop:6}}>
                                  {new Date(date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    }
                  </div>
                </div>

                {/* Per Manager Breakdown */}
                <div className="panel" style={{marginBottom:18}}>
                  <div className="panel-hdr">
                    <div className="panel-title">👥 Manager Performance Breakdown</div>
                    <span className="panel-count">{analyticsData.managerStats.length} managers</span>
                  </div>
                  <div className="panel-body" style={{overflowX:'auto'}}>
                    {analyticsData.managerStats.length===0
                      ? <div className="empty"><div className="empty-ico">👥</div><div className="empty-txt">No managers yet.</div></div>
                      : (
                        <table className="analytics-table">
                          <thead className="at-head">
                            <tr><th>Manager</th><th>Territory</th><th>Visits</th><th>Sales</th><th>Profit</th><th>Achievement</th><th>Reports</th></tr>
                          </thead>
                          <tbody className="at-body">
                            {analyticsData.managerStats.sort((a,b)=>b.totalSales-a.totalSales).map((m,i)=>{
                              const c=m.salesPct>=100?'#059669':m.salesPct>=75?'#2563EB':'#D97706'
                              const bg=m.salesPct>=100?'#ECFDF5':m.salesPct>=75?'#EFF6FF':'#FFFBEB'
                              return (
                                <tr key={m.id}>
                                  <td><div className="at-mgr"><div className="at-av" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{m.name?.[0]}</div><div><div className="at-name">{m.name}</div><div className="at-sub">@{m.username}</div></div></div></td>
                                  <td><span style={{fontSize:'0.78rem',color:'#6b7280'}}>{m.territory||'—'}</span></td>
                                  <td><span className="at-mono">{m.visits}</span></td>
                                  <td><span className="at-mono">{fmt(m.totalSales)}</span></td>
                                  <td><span className="at-mono">{fmt(m.totalProfit)}</span></td>
                                  <td>{m.salesPct>0?<span className="at-pct-badge" style={{background:bg,color:c}}>{m.salesPct}%</span>:<span style={{color:'#9CA3AF'}}>—</span>}</td>
                                  <td><span className="at-mono">{m.reports}</span></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )
                    }
                  </div>
                </div>

                {/* Product Day Performance */}
                <div className="panel">
                  <div className="panel-hdr"><div className="panel-title">📦 Product Performance</div></div>
                  <div className="panel-body" style={{overflowX:'auto'}}>
                    {analyticsData.managerStats.every(m=>m.productPerformance.length===0)
                      ? <div className="empty"><div className="empty-ico">📦</div><div className="empty-txt">No product entries in this period.</div></div>
                      : (
                        <table className="analytics-table">
                          <thead className="at-head">
                            <tr><th>Manager</th><th>Product</th><th>Brand</th><th>Days</th><th>Target Qty</th><th>Achieved Qty</th><th>Target Value</th><th>Achieved Value</th><th>Achievement</th></tr>
                          </thead>
                          <tbody className="at-body">
                            {analyticsData.managerStats.flatMap(m =>
                              m.productPerformance.map((p,i) => {
                                const pct=p.target_qty>0?Math.round((p.achieved_qty/p.target_qty)*100):0
                                const c=pct>=100?'#059669':pct>=75?'#2563EB':'#D97706'
                                const bg=pct>=100?'#ECFDF5':pct>=75?'#EFF6FF':'#FFFBEB'
                                return (
                                  <tr key={m.id+'-'+i}>
                                    <td><span style={{fontSize:'0.78rem',fontWeight:600}}>{m.name}</span></td>
                                    <td><span className="at-name">{p.name}</span></td>
                                    <td><span className="prod-brand-tag">{p.brand||'—'}</span></td>
                                    <td><span className="at-mono">{p.days}</span></td>
                                    <td><span className="at-mono">{p.target_qty}</span></td>
                                    <td><span className="at-mono">{p.achieved_qty}</span></td>
                                    <td><span className="at-mono">{fmt(p.target_amt)}</span></td>
                                    <td><span className="at-mono" style={{color:'#2563EB',fontWeight:700}}>{fmt(p.achieved_amt)}</span></td>
                                    <td>{pct>0?<span className="at-pct-badge" style={{background:bg,color:c}}>{pct}%</span>:<span style={{color:'#9CA3AF'}}>—</span>}</td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      )
                    }
                  </div>
                </div>
              </>)}
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: USERS
              ════════════════════════════════════════ */
          {tab==='users' && (
            <div className="panel">
              <div className="panel-hdr">
                <div className="panel-title">All Users</div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span className="panel-count">{users.length} users</span>
                  <button className="panel-action" onClick={doProductionReset} style={{color:'#ef4444',borderColor:'#fca5a5'}}>🗑️ Reset Data</button>
                  <button className="panel-action" onClick={()=>{setEditingUser(null);setUf(initUF);setUserModal(true)}}>+ New User</button>
                </div>
              </div>
              <div className="panel-body">
                {users.map((u,i)=>(
                  <div key={u.id} className="user-row">
                    <div className="ur-avatar" style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length]}}>{u.full_name?.[0]}</div>
                    <div className="ur-info" style={{flex:1,minWidth:0}}>
                      <div className="ur-name">{u.full_name}</div>
                      <div className="ur-meta">@{u.username}{u.territory?` · ${u.territory}`:''}</div>

                    </div>
                    <span className={`ur-badge ${u.role==='Admin'?'ur-badge-admin':'ur-badge-manager'}`}>{u.role==='Admin'?'Admin':'Manager'}</span>
                    <div className="ur-actions">
                      {user?.role==='Admin' && <button className="ur-btn" onClick={()=>openEditUser(u)} title="Edit">✏️</button>}
                      {user?.role==='Admin' && u.role!=='Admin' && u.id!==user?.id && <button className="ur-btn ur-btn-del" onClick={()=>doDeleteUser(u.id,u.full_name)} title="Delete">🗑️</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>{/* admin-content */}
      </div>{/* admin-main */}

      {/* ── USER MODAL ── */}
      {userModal && (
        <div className="modal-overlay" onClick={()=>setUserModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:'500px',width:'96%'}}>
            <div className="modal-hdr">
              <div className="modal-title">{editingUser?'✏️ Edit User':'👤 Create New User'}</div>
              <button className="modal-close" onClick={()=>setUserModal(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* CURRENT CREDENTIALS — Edit mode only */}
              {editingUser && (
                <div style={{background:'#eff6ff',border:'2px solid #2563eb',borderRadius:'10px',padding:'14px',marginBottom:'16px'}}>
                  <div style={{fontSize:'0.7rem',fontWeight:800,color:'#1d4ed8',letterSpacing:'0.08em',marginBottom:'10px'}}>🔐 CURRENT LOGIN CREDENTIALS</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'#374151',marginBottom:'4px'}}>USERNAME</div>
                      <div style={{background:'#fff',border:'1px solid #93c5fd',borderRadius:'7px',padding:'7px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'6px'}}>
                        <code style={{fontSize:'0.88rem',color:'#1e3a8a',fontWeight:800,flex:1}}>{editCreds.username}</code>
                        <button type="button" onClick={()=>{navigator.clipboard.writeText(editCreds.username);toastMsg('Copied!')}}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}>📋</button>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:'0.65rem',fontWeight:700,color:'#374151',marginBottom:'4px'}}>
                        PASSWORD{!editCreds.password&&<span style={{color:'#f59e0b'}}> ⚠ not recorded</span>}
                      </div>
                      <div style={{background:'#fff',border:'1px solid #93c5fd',borderRadius:'7px',padding:'7px 10px',display:'flex',alignItems:'center',gap:'4px'}}>
                        <code style={{fontSize:'0.88rem',color:editCreds.password?'#1e3a8a':'#9ca3af',fontWeight:800,flex:1}}>
                          {editCreds.password?(editCreds.show?editCreds.password:'••••••••'):'login once to capture'}
                        </code>
                        {editCreds.password&&<>
                          <button type="button" onClick={()=>setEditCreds(p=>({...p,show:!p.show}))}
                            style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}>{editCreds.show?'🙈':'👁️'}</button>
                          <button type="button" onClick={()=>{navigator.clipboard.writeText(editCreds.password);toastMsg('Password copied!')}}
                            style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}>📋</button>
                        </>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="row-2">
                <div className="fg">
                  <label>Full Name *</label>
                  <input value={uf.full_name} onChange={e=>setUf(p=>({...p,full_name:e.target.value}))} placeholder="e.g. Akshay Bansode"/>
                </div>
                <div className="fg">
                  <label>Username *</label>
                  <input value={uf.username}
                    onChange={e=>setUf(p=>({...p,username:e.target.value.toLowerCase().replace(/\s+/g,'_')}))}
                    placeholder="e.g. akshay_bansode"
                    disabled={!!editingUser}
                    style={editingUser?{background:'#f3f4f6',cursor:'not-allowed'}:{}}/>
                  {!editingUser&&<small style={{color:'#6b7280',fontSize:'0.7rem'}}>Auto lowercase · spaces → _</small>}
                </div>
              </div>

              <div className="fg">
                <label>{editingUser?'🔄 Change Password (blank = keep current)':'🔑 Password *'}</label>
                <div style={{position:'relative',display:'flex',alignItems:'center'}}>
                  <input type={uf._showPwd?'text':'password'} value={uf.password}
                    onChange={e=>setUf(p=>({...p,password:e.target.value}))}
                    placeholder={editingUser?'Type to change password...':'Min. 4 characters'}
                    style={{width:'100%',paddingRight:'40px'}}/>
                  <button type="button" onClick={()=>setUf(p=>({...p,_showPwd:!p._showPwd}))}
                    style={{position:'absolute',right:'10px',background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}
                    tabIndex={-1}>{uf._showPwd?'🙈':'👁️'}</button>
                </div>
              </div>

              <div className="row-2">
                <div className="fg"><label>Email</label><input type="email" value={uf.email} onChange={e=>setUf(p=>({...p,email:e.target.value}))} placeholder="email@company.com"/></div>
                <div className="fg"><label>Phone</label><input value={uf.phone} onChange={e=>setUf(p=>({...p,phone:e.target.value}))} placeholder="+91 9999999999"/></div>
              </div>

              <div className="row-2">
                <div className="fg">
                  <label>Territory</label>
                  <input value={uf.territory} onChange={e=>setUf(p=>({...p,territory:e.target.value}))}
                    placeholder="e.g. Pune, Mumbai West, Nashik..."/>
                </div>
                <div className="fg">
                  <label>Role</label>
                  <select value={uf.role} onChange={e=>setUf(p=>({...p,role:e.target.value}))}>
                    <option>Sales Manager</option><option>Admin</option>
                  </select>
                </div>
              </div>

              {!editingUser&&uf.username&&uf.password&&(
                <div style={{background:'#f0fdf4',border:'1.5px solid #86efac',borderRadius:'8px',padding:'10px 14px',fontSize:'0.8rem',color:'#166534'}}>
                  <strong>✅ Share with user —</strong> Username: <code style={{background:'#dcfce7',padding:'1px 6px',borderRadius:'4px',fontWeight:700}}>{uf.username.toLowerCase().replace(/\s+/g,'_')}</code>&nbsp;
                  Password: <code style={{background:'#dcfce7',padding:'1px 6px',borderRadius:'4px',fontWeight:700}}>{uf.password}</code>
                </div>
              )}

            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={()=>setUserModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={doCreateUser}>{editingUser?'Update User':'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TARGET MODAL ── */}
      {targetModal && (
        <div className="modal-overlay" onClick={()=>setTargetModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr"><div className="modal-title">🎯 Assign Targets — {selectedMgrs.length} Manager(s)</div><button className="modal-close" onClick={()=>setTargetModal(false)}>✕</button></div>
            <div className="modal-body">
              <div className="row-2">
                <div className="fg"><label>Month</label><select value={tf.month} onChange={e=>setTf(p=>({...p,month:+e.target.value}))}>{MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select></div>
                <div className="fg"><label>Year</label><input type="number" value={tf.year} onChange={e=>setTf(p=>({...p,year:+e.target.value}))}/></div>
              </div>
              <div className="fg"><label>Visit Target (per month)</label><input type="number" value={tf.visit_target} onChange={e=>setTf(p=>({...p,visit_target:e.target.value}))} placeholder="e.g. 20"/></div>
              <div className="fg"><label>Sales Target (₹ per month)</label><input type="number" value={tf.sales_target} onChange={e=>setTf(p=>({...p,sales_target:e.target.value}))} placeholder="e.g. 100000"/></div>
            </div>
            <div className="modal-foot"><button className="btn-cancel" onClick={()=>setTargetModal(false)}>Cancel</button><button className="btn-submit" onClick={doAssignTargets}>Assign Targets</button></div>
          </div>
        </div>
      )}

      {/* ── JOURNEY REPLAY MODAL ── */}
      {showReplay && <JourneyReplay onClose={()=>setShowReplay(false)}/>}

      {/* ── SALES HEATMAP MODAL ── */}
      {tab==='heatmap' && <SalesHeatmapInline onReplay={()=>setShowReplay(true)}/>}
    </div>
  )
}

// Inline heatmap launcher that renders inside the page layout
function SalesHeatmapInline({ onReplay }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button id="shm-inline-trigger" style={{display:'none'}} onClick={()=>setOpen(true)}/>
      {open && <SalesHeatmap onClose={()=>setOpen(false)}/>}
    </>
  )
}

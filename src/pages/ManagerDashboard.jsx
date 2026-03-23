import { useState, useEffect, useCallback, useMemo } from 'react'
import useAuthStore from '../store/authStore'
import {
    getCurrentStatus, updateStatus, createVisit,
    startJourney, endJourney,
    saveDailySalesReport,
    createProductDayEntry, updateProductDayEntry, deleteProductDayEntry,
    calcDistanceKm, calcTravelTime,
    searchCustomers, getRecentCustomers, createCustomer, getTerritories,
    searchBrands,    getRecentBrands,    createBrand,
    searchProducts,  getRecentProducts,  createProduct,
    getAISuggestions, detectNearbyCustomers, getOfflineQueue, flushOfflineQueue,
    getAllVisitsSync        as getAllVisits,
    getDailyReportsSync    as getDailySalesReports,
    getProductEntriesSync  as getProductDayEntries,
    getTargetsSync         as getTargets,
    getActiveJourneySync   as getActiveJourney,
    getTodayVisitsSync     as getTodayVisits,
    getCustomersSync       as getCustomers,
    addJourneyLocation
  } from '../utils/supabaseDB'
import JourneyMap from '../components/JourneyMap'
import AutocompleteInput, {
  QuickAddCustomerModal, QuickAddBrandModal, QuickAddProductModal
} from '../components/AutocompleteInput'
import AddCustomerModal from '../components/AddCustomerModal'
import dccLogo from '../assets/dcc-logo.png'
import './ManagerDashboard.css'

/* -- Constants -- */
const STOP_COLORS = ['#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#84CC16','#8B5CF6','#34D399']
const STATUS_META = {
  'In-Office':      { color:'#2563EB', icon:'🏢' },
  'On Field':       { color:'#10B981', icon:'🚗' },
  'Lunch Break':    { color:'#F59E0B', icon:'🍽️' },
  'Travel':         { color:'#7C3AED', icon:'✈️' },
  'Meeting':        { color:'#EC4899', icon:'🤝' },
  'Work From Home': { color:'#6B7280', icon:'🏠' },
}
const CLIENT_TYPES = ['Retailer','Distributor','Wholesaler','Dealer','Direct Customer','Other']
const VISIT_TYPES  = ['Field Visit','Sales Visit','Service Visit','Demo Visit','Follow-up','Other']
const VISIT_STATUSES = ['Completed','Pending','Not Visited']

const fmt = v => v!=null ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '--'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '--'
const calcElapsed = start => {
  const m = Math.round((Date.now()-new Date(start))/60000)
  return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m`
}

/* -- Visit modal initial form -- */
const initVF = () => ({ customer_id:null, customer_name:'', client_type:'Retailer', location:'', visit_type:'Field Visit', status:'Completed', notes:'' })
const initSF = () => ({ sales_target:'', sales_achievement:'', profit_target:'', profit_achievement:'' })
const initPF = () => ({ brand:'', brand_id:null, product_name:'', product_id:null, target_qty:'', achieved_qty:'', target_amount:'', achieved_amount:'' })

export default function ManagerDashboard() {
  const { user, logout } = useAuthStore()
  const [tab,              setTab]              = useState('home')
  const [status,           setStatus]           = useState('In-Office')
  const [journey,          setJourney]          = useState(null)
  const [todayVisits,      setTodayVisits]      = useState([])
  const [allVisits,        setAllVisits]        = useState([])
  const [targets,          setTargets]          = useState([])
  const [reports,          setReports]          = useState([])
  const [products,         setProducts]         = useState([])
  const [suggestions,      setSuggestions]      = useState([])
  const [toast,            setToast]            = useState(null)
  const [showMap,          setShowMap]          = useState(false)
  const [showAddCustomer,  setShowAddCustomer]  = useState(false)
  const [customers,        setCustomers]        = useState([])
  const [customerFilter,   setCustomerFilter]   = useState('')
  const [nearbyCustomers,  setNearbyCustomers]  = useState([])
  const [isOnline,         setIsOnline]         = useState(navigator.onLine)
  const [offlineQueue,     setOfflineQueue]     = useState([])
  const [territories,      setTerritories]      = useState([])
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [visitModal,       setVisitModal]       = useState(false)
  const [salesModal,       setSalesModal]       = useState(false)
  const [productModal,     setProductModal]     = useState(false)
  const [editProd,         setEditProd]         = useState(null)
  // Quick-add modals
  const [addCustomerModal, setAddCustomerModal] = useState(false)
  const [addBrandModal,    setAddBrandModal]    = useState(false)
  const [addProductModal,  setAddProductModal]  = useState(false)
  // Form state
  const [vf, setVf] = useState(initVF())
  const [sf, setSf] = useState(initSF())
  const [pf, setPf] = useState(initPF())
  // Photo capture
  const [visitPhoto, setVisitPhoto]         = useState(null)
  const [photoPreview, setPhotoPreview]     = useState(null)
  // Voice notes
  const [isRecording, setIsRecording]       = useState(false)
  const [voiceNote, setVoiceNote]           = useState(null)
  const [voiceBlob, setVoiceBlob]           = useState(null)
  const [mediaRecorder, setMediaRecorder]   = useState(null)
  const [recordingTime, setRecordingTime]   = useState(0)
  const [recordTimer, setRecordTimer]       = useState(null)
  // Notifications
  const [notifPerm, setNotifPerm]           = useState(Notification?.permission || 'default')

  const today = new Date().toISOString().split('T')[0]

  const toastMsg = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null), 3200) }

  /* -- Photo Capture -- */
  const capturePhoto = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'
    input.onchange = e => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        setVisitPhoto(ev.target.result)
        setPhotoPreview(ev.target.result)
        toastMsg('Photo captured ✅')
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  /* -- Voice Notes -- */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onload = ev => { setVoiceNote(ev.target.result); setVoiceBlob(blob) }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(t => t.stop())
        toastMsg('Voice note saved ✅')
      }
      rec.start()
      setMediaRecorder(rec)
      setIsRecording(true)
      setRecordingTime(0)
      const timer = setInterval(() => setRecordingTime(t => t + 1), 1000)
      setRecordTimer(timer)
    } catch { toastMsg('Microphone access denied', 'error') }
  }
  const stopRecording = () => {
    if (mediaRecorder) mediaRecorder.stop()
    setIsRecording(false)
    if (recordTimer) { clearInterval(recordTimer); setRecordTimer(null) }
  }
  const clearVoiceNote = () => { setVoiceNote(null); setVoiceBlob(null); setRecordingTime(0) }

  /* -- WhatsApp Share (clean encodeURIComponent approach) -- */
  const shareOnWhatsApp = (lines) => {
    const text = encodeURIComponent(lines.join('\n'))
    window.open('https://wa.me/?text=' + text, '_blank')
  }

  const shareVisitOnWhatsApp = (visit) => {
    const lines = [
      'DCC SalesForce - Visit Report',
      'Manager: ' + (user?.full_name || ''),
      'Customer: ' + (visit.client_name || visit.customer_name || ''),
      'Type: ' + (visit.client_type || '') + ' | ' + (visit.visit_type || ''),
      'Location: ' + (visit.location || ''),
      'Date: ' + new Date(visit.created_at).toLocaleDateString('en-IN'),
      visit.notes ? 'Notes: ' + visit.notes : '',
    ].filter(Boolean)
    shareOnWhatsApp(lines)
  }

  const shareOrderOnWhatsApp = () => {
    const report = reports.find(r => r.date === today)
    const todayProds = products.filter(p => p.date === today)
    const lines = [
      'DCC SalesForce - Daily Order Summary',
      'Manager: ' + (user?.full_name || ''),
      'Territory: ' + (user?.territory || 'N/A'),
      'Date: ' + new Date().toLocaleDateString('en-IN'),
      '',
      'Visits Today: ' + todayVisits.length,
      report ? 'Sales: Rs.' + Number(report.sales_achievement).toLocaleString('en-IN') : '',
      report ? 'Profit: Rs.' + Number(report.profit_achievement).toLocaleString('en-IN') : '',
      '',
      todayProds.length > 0 ? 'Products:' : '',
      ...todayProds.map(p =>
        '- ' + p.product_name + ' (' + (p.brand || '') + '): ' +
        p.achieved_qty + ' units - Rs.' + Number(p.achieved_amount).toLocaleString('en-IN')
      ),
    ].filter(s => s !== null && s !== undefined)
    shareOnWhatsApp(lines)
  }

  /* -- Push Notifications -- */
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return toastMsg('Notifications not supported', 'error')
    const perm = await Notification.requestPermission()
    setNotifPerm(perm)
    if (perm === 'granted') {
      // Show confirmation
      new Notification('DCC SalesForce', {
        body: 'You will get a daily 11 AM reminder on working days.',
        icon: '/icons/icon-192.png'
      })
      // Schedule daily reminder via service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SCHEDULE_DAILY_REMINDER',
          managerName: user?.full_name || 'Sales Manager'
        })
      }
      toastMsg('Notifications enabled ✅')
    } else {
      toastMsg('Notification permission denied', 'error')
    }
  }

  const reload = useCallback(() => {
    if (!user?.id) return
    setStatus(getCurrentStatus(user.id))
    setJourney(getActiveJourney(user.id))
    setTodayVisits(getTodayVisits(user.id))
    setAllVisits(getAllVisits(user.id))
    setTargets(getTargets(user.id))
    setReports(getDailySalesReports(user.id))
    setProducts(getProductDayEntries(user.id))
    setSuggestions(getAISuggestions(user.id))
    setCustomers(getCustomers())
    setTerritories(getTerritories())
    setOfflineQueue(getOfflineQueue())
  }, [user?.id])

  /* ── Continuous GPS tracking while journey is active ──────────────────── */
  useEffect(() => {
    if (!journey?.id || !user?.id) return
    if (!navigator.geolocation) return

    let watchId = null
    let lastLat = null, lastLng = null

    const sendGPS = (lat, lng) => {
      // Only update if moved more than ~10 meters
      if (lastLat !== null) {
        const dlat = Math.abs(lat - lastLat), dlng = Math.abs(lng - lastLng)
        if (dlat < 0.0001 && dlng < 0.0001) return
      }
      lastLat = lat; lastLng = lng
      try { addJourneyLocation(journey.id, user.id, lat, lng) } catch(e) {}
    }

    // Watch position continuously
    watchId = navigator.geolocation.watchPosition(
      pos => sendGPS(pos.coords.latitude, pos.coords.longitude),
      err  => console.warn('GPS watch error:', err.message),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    )

    // Also poll every 30s as fallback
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        pos => sendGPS(pos.coords.latitude, pos.coords.longitude),
        ()  => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 }
      )
    }, 30000)

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      clearInterval(interval)
    }
  }, [journey?.id, user?.id])


  // Online/offline listener + auto-sync
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true)
      const q = getOfflineQueue()
      if (q.length > 0) {
        const results = flushOfflineQueue()
        const ok = results.filter(r => !r.error).length
        if (ok > 0) toastMsg(`✅ Synced ${ok} offline action(s)`)
        reload()
      }
    }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  useEffect(() => {
    reload()
    if (Notification?.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.active?.postMessage({ type: 'SCHEDULE_DAILY_REMINDER', managerName: user?.full_name })
      }).catch(()=>{})
    }
  }, [reload])

  /* -- GPS helpers -- */
  const getGPS = () => new Promise(res =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(p=>res({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>res(null),{timeout:9000,enableHighAccuracy:true})
      : res(null)
  )
  const reverseGeo = async (lat,lng) => {
    try {
      const d = await (await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)).json()
      return d.display_name?.split(',').slice(0,3).join(', ')||`${lat.toFixed(4)},${lng.toFixed(4)}`
    } catch { return `${lat.toFixed(4)},${lng.toFixed(4)}` }
  }
  const checkNearby = async () => {
    const c = await getGPS()
    if (c) {
      const nearby = detectNearbyCustomers(c.latitude, c.longitude)
      setNearbyCustomers(nearby)
      if (nearby.length > 0) toastMsg(`📍 ${nearby.length} customer(s) detected nearby!`, 'info')
    }
  }

  /* -- Status -- */
  const changeStatus = s => { updateStatus(user.id,s); setStatus(s); setShowStatusPicker(false); toastMsg(`Status → ${s}`) }

  /* -- Journey -- */
  const handleStartJourney = async () => {
    toastMsg('Getting your location…','info')
    const c = await getGPS()
    const loc = c ? await reverseGeo(c.latitude,c.longitude) : 'Starting Point'
    try {
      const j = startJourney(user.id,loc,c?.latitude,c?.longitude)
      setJourney(j); changeStatus('On Field')
      toastMsg('Journey started! 🚀'); setShowMap(true)
    } catch(e) { toastMsg(e.message,'error') }
  }
  const handleEndJourney = async () => {
    toastMsg('Getting your location…','info')
    const c = await getGPS()
    const loc = c ? await reverseGeo(c.latitude,c.longitude) : 'End Point'
    try {
      const j = endJourney(user.id,loc,c?.latitude,c?.longitude)
      setJourney(null); changeStatus('In-Office'); reload()
      toastMsg(`Journey done · ${j.total_visits} stops · ${j.total_km} km 🎯`)
    } catch(e) { toastMsg(e.message,'error') }
  }

  /* -- Map visit log -- */
  const onVisitLogged = data => {
    createVisit({...data, manager_id:user.id, visit_date:today})
    reload(); toastMsg(`Stop #${todayVisits.length+1} logged ✅`)
  }

  /* -- Visit modal submit -- */
  const submitVisit = async () => {
    if (!vf.customer_name.trim()||!vf.location.trim()) return toastMsg('Customer name & location required','error')
    const c = await getGPS()
    createVisit({
      manager_id:user.id, visit_date:today,
      customer_id:vf.customer_id||null, client_name:vf.customer_name,
      customer_name:vf.customer_name, client_type:vf.client_type,
      location:vf.location, visit_type:vf.visit_type,
      status:vf.status, notes:vf.notes,
      latitude:c?.latitude||null, longitude:c?.longitude||null,
      photo:visitPhoto||null,
      voice_note:voiceNote||null,
    })
    setVisitModal(false)
    setVf(initVF())
    setVisitPhoto(null); setPhotoPreview(null)
    setVoiceNote(null); setVoiceBlob(null)
    reload()
    toastMsg('Visit logged ✅')
  }

  /* -- Sales modal -- */
  const submitSales = () => {
    if (!sf.sales_achievement) return toastMsg('Sales achievement required','error')
    saveDailySalesReport({ manager_id:user.id, date:today, sales_target:+sf.sales_target||0, sales_achievement:+sf.sales_achievement||0, profit_target:+sf.profit_target||0, profit_achievement:+sf.profit_achievement||0 })
    setSalesModal(false); setSf(initSF()); reload(); toastMsg('Report submitted ✅')
  }
  const salesAchPct = sf.sales_target>0&&sf.sales_achievement>0 ? Math.round((+sf.sales_achievement/+sf.sales_target)*100) : null

  /* -- Product modal -- */
  const submitProduct = () => {
    if (!pf.brand.trim()||!pf.product_name.trim()) return toastMsg('Brand & product name required','error')
    if (editProd) {
      updateProductDayEntry(editProd.id,{achieved_qty:+pf.achieved_qty||0, achieved_amount:+pf.achieved_amount||0})
    } else {
      createProductDayEntry({ manager_id:user.id, date:today, brand:pf.brand, brand_id:pf.brand_id||null, product_name:pf.product_name, product_id:pf.product_id||null, target_qty:+pf.target_qty||0, achieved_qty:+pf.achieved_qty||0, target_amount:+pf.target_amount||0, achieved_amount:+pf.achieved_amount||0 })
    }
    setProductModal(false); setEditProd(null); setPf(initPF()); reload()
    toastMsg(editProd?'Updated ✅':'Product entry added ✅')
  }
  const openEditProd = p => {
    setEditProd(p)
    setPf({brand:p.brand||'',brand_id:p.brand_id||null,product_name:p.product_name,product_id:p.product_id||null,target_qty:String(p.target_qty),achieved_qty:String(p.achieved_qty),target_amount:String(p.target_amount),achieved_amount:String(p.achieved_amount)})
    setProductModal(true)
  }
  const prodPct = pf.target_qty>0&&pf.achieved_qty>0 ? Math.round((+pf.achieved_qty/+pf.target_qty)*100) : null

  /* -- Computed -- */
  const todayReport   = reports.find(r=>r.date===today)
  const todayProducts = products.filter(p=>p.date===today)
  const pastProducts  = products.filter(p=>p.date!==today)
  const latestTarget  = targets.sort((a,b)=>b.year-a.year||b.month-a.month)[0]
  const visitPct  = latestTarget?.visit_target ? Math.min((todayVisits.length/latestTarget.visit_target)*100,100) : 0
  const salesPct  = latestTarget?.sales_target&&todayReport ? Math.min((todayReport.sales_achievement/latestTarget.sales_target)*100,100) : 0
  const sm = STATUS_META[status]||STATUS_META['In-Office']
  const journeyKm = todayVisits.reduce((sum,v,i)=>{
    const pl=i===0?journey?.start_latitude:todayVisits[i-1]?.latitude
    const pn=i===0?journey?.start_longitude:todayVisits[i-1]?.longitude
    return sum+(pl&&v.latitude?calcDistanceKm(pl,pn,v.latitude,v.longitude):0)
  }, 0)

  /* -- Visitor stat chip -- */
  const StatusChip = ({s}) => {
    const cls = s==='Completed'?'vs-completed':s==='Pending'?'vs-pending':'vs-not-visited'
    return <span className={`visit-status-chip ${cls}`}>{s}</span>
  }

  return (
    <div className="mgr-app">

      {/* -- Header -- */}
      <header className="mgr-header">
        <div className="mgr-hdr-top">
          <div className="mgr-user">
            <div className="mgr-avatar mgr-avatar-logo">
              <img src={dccLogo} alt="DCC" className="mgr-logo-img"/>
            </div>
            <div>
              <div className="mgr-name">{user?.full_name}</div>
              <div className="mgr-date">{new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</div>
            </div>
          </div>
          <div className="mgr-hdr-actions">
            <button className="mgr-icon-btn">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 2a5 5 0 015 5c0 3 1.5 4.5 1.5 4.5H2S3.5 10 3.5 7a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 14.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              <span className="notif-badge"/>
            </button>
            <button className="mgr-icon-btn" onClick={logout} title="Sign out">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
        <div className="mgr-status-row">
          <button className="status-pill" onClick={()=>setShowStatusPicker(true)}>
            <span className="status-dot" style={{background:sm.color}}/>
            <span className="status-txt">{sm.icon} {status}</span>
            <svg className="status-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {journey && (
            <button className="journey-live-pill" onClick={()=>setShowMap(true)}>
              <span className="jlp-pulse"/>
              <span className="jlp-txt">{todayVisits.length} stops · {journeyKm.toFixed(1)} km · {calcElapsed(journey.start_time)}</span>
            </button>
          )}
        </div>
      </header>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* -- Offline Banner -- */}
      {!isOnline && (
        <div className="offline-banner">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v3.5L9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Offline Mode — data saved locally, will sync when connected
          {offlineQueue.length>0 && <span className="offline-queue-badge">{offlineQueue.length} pending</span>}
        </div>
      )}

      {/* -- Nearby Customer Suggestion -- */}
      {nearbyCustomers.length>0 && (
        <div className="nearby-banner">
          <div className="nb-title">📍 Nearby Customers Detected</div>
          <div className="nb-list">
            {nearbyCustomers.map((c,i)=>(
              <div key={c.id} className="nb-item">
                <div>
                  <div className="nb-name">{c.name}</div>
                  <div className="nb-meta">{c.type} · {Math.round(c.dist*1000)}m away</div>
                </div>
                <button className="nb-visit-btn" onClick={()=>{
                  setVf(p=>({...p,customer_name:c.name,customer_id:c.id,client_type:c.type,location:c.address}))
                  setVisitModal(true); setNearbyCustomers([])
                }}>Log Visit</button>
              </div>
            ))}
          </div>
          <button className="nb-dismiss" onClick={()=>setNearbyCustomers([])}>Dismiss</button>
        </div>
      )}

      {/* -- Main -- */}
      <main className="mgr-main">

        {/* ---- HOME ---- */}
        {tab==='home' && (
          <div className="tab-pane">

            {/* Journey Hero */}
            <div className="journey-hero">
              <div className="jh-body">
                <div className="jh-top-row">
                  {journey
                    ? <div className="jh-badge-active"><span className="jh-badge-dot"/>Live Journey Active</div>
                    : <div className="jh-badge-idle">⭕ No Active Journey</div>
                  }
                </div>
                <div className="jh-title">{journey?'Field Route Tracking':'Ready for Today?'}</div>
                <div className="jh-sub">
                  {journey?`Started ${fmtTime(journey.start_time)} · ${journey.start_location?.split(',')[0]}`:'Start your journey to activate GPS tracking, route mapping and visit logging.'}
                </div>
                {journey && (
                  <div className="jh-metrics">
                    <div className="jh-metric"><span className="jh-metric-val">{todayVisits.length}</span><span className="jh-metric-lbl">Stops</span></div>
                    <div className="jh-metric"><span className="jh-metric-val">{journeyKm.toFixed(1)}</span><span className="jh-metric-lbl">km</span></div>
                    <div className="jh-metric"><span className="jh-metric-val">{calcElapsed(journey.start_time)}</span><span className="jh-metric-lbl">Duration</span></div>
                  </div>
                )}
                <div className="jh-actions" style={{marginTop:14}}>
                  {journey ? (
                    <>
                      <button className="jh-btn-map" onClick={()=>setShowMap(true)}>🗺️ Map</button>
                      <button className="jh-btn-end" onClick={handleEndJourney}>🏁 End Journey</button>
                    </>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:8,width:'100%'}}>
                      <button className="jh-btn-start" onClick={handleStartJourney} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polygon points="3,1 13,7 3,13" fill="currentColor"/></svg>
                        Start Field Journey
                      </button>
                      {status==='Work From Home' && (
                        <button className="jh-btn-map" onClick={handleStartJourney}
                          style={{background:'#f0fdf4',color:'#059669',border:'1.5px solid #86efac',borderRadius:10,padding:'11px 16px',
                            fontWeight:700,fontSize:'0.83rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                          &#x1F3E0; Start WFH Journey
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {journey && <div className="jh-progress"><div className="jh-prog-fill" style={{width:`${visitPct}%`}}/></div>}
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-top">
                  <div className="kpi-ico" style={{background:'#ECFDF5',fontSize:'1.1rem'}} dangerouslySetInnerHTML={{__html:'&#x1F4CD;'}}/>
                  <span className="kpi-badge" style={{background:'#ECFDF5',color:'#059669'}}>{latestTarget?.visit_target?`${Math.round(visitPct)}%`:'Today'}</span>
                </div>
                <div className="kpi-val">{todayVisits.length}</div>
                <div className="kpi-lbl">Client Visits</div>
                <div className="kpi-bar"><div className="kpi-fill" style={{width:`${visitPct}%`,background:'#10B981'}}/></div>
                <div className="kpi-foot">Target: {latestTarget?.visit_target||'Not set'}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-top">
                  <div className="kpi-ico" style={{background:var_pl,fontSize:'1.1rem'}} dangerouslySetInnerHTML={{__html:'&#x1F4B0;'}}/>
                  <span className="kpi-badge" style={{background:var_pl,color:salesPct>=100?'#059669':'#2563EB'}}>
                    {salesPct>0?`${Math.round(salesPct)}%`:'No data'}
                  </span>
                </div>
                <div className="kpi-val" style={{fontSize:todayReport?'1rem':'1.55rem'}}>{todayReport?fmt(todayReport.sales_achievement):'₹0'}</div>
                <div className="kpi-lbl">Sales Today</div>
                <div className="kpi-bar"><div className="kpi-fill" style={{width:`${salesPct}%`,background:'#2563EB'}}/></div>
                <div className="kpi-foot">Target: {latestTarget?.sales_target?fmt(latestTarget.sales_target):'Not set'}</div>
              </div>
              {journey && (
                <>
                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="kpi-ico" style={{background:'#F5F3FF'}}>🛣️</div>
                      <span className="kpi-badge" style={{background:'#F5F3FF',color:'#7C3AED'}}>km</span>
                    </div>
                    <div className="kpi-val">{journeyKm.toFixed(1)}</div>
                    <div className="kpi-lbl">Distance Covered</div>
                    <div className="kpi-bar"><div className="kpi-fill" style={{width:'60%',background:'#7C3AED'}}/></div>
                    <div className="kpi-foot">Est. drive: {calcTravelTime(journeyKm)}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="kpi-ico" style={{background:'#FFFBEB'}}>⏱️</div>
                      <span className="kpi-badge" style={{background:'#FFFBEB',color:'#D97706'}}>live</span>
                    </div>
                    <div className="kpi-val">{calcElapsed(journey.start_time)}</div>
                    <div className="kpi-lbl">Journey Duration</div>
                    <div className="kpi-bar"><div className="kpi-fill" style={{width:'50%',background:'#F59E0B'}}/></div>
                    <div className="kpi-foot">Since {fmtTime(journey.start_time)}</div>
                  </div>
                </>
              )}
            </div>

            {/* Quick Actions */}
            <div>
              <div className="section-row"><span className="section-label">Quick Actions</span></div>
              <div className="qa-row">
                {[
                  {ico:'&#x1F5FA;',  bg:'#EFF6FF', lbl:'Journey\nMap',      fn:()=>setShowMap(true)},
                  {ico:'&#x1F4CD;',  bg:'#ECFDF5', lbl:'Log\nVisit',        fn:()=>{setVf(initVF());setVisitModal(true)}},
                  {ico:'&#x1F3EA;',  bg:'#FEF3C7', lbl:'Customers',          fn:()=>setTab('customers')},
                  {ico:'&#x1F4CA;',  bg:'#FFFBEB', lbl:'Sales\nReport',     fn:()=>{setSf(initSF());setSalesModal(true)}},
                  {ico:'&#x1F4E6;',  bg:'#F5F3FF', lbl:'Product\nEntry',    fn:()=>{setEditProd(null);setPf(initPF());setProductModal(true)}},
                  {ico:'&#x1F4E1;',  bg:'#ECFDF5', lbl:'Nearby\nVisit',     fn:checkNearby},
                  {ico:'&#x1F4AC;',  bg:'#DCFCE7', lbl:'Share\nOrder',      fn:shareOrderOnWhatsApp},
                  {ico:'&#x1F514;',  bg:'#FFF7ED', lbl:'Enable\nAlerts',    fn:requestNotificationPermission},
                ].map((a,i)=>(
                  <div key={i} className="qa-card" onClick={a.fn}>
                    <div className="qa-ico" style={{background:a.bg}} dangerouslySetInnerHTML={{__html:a.ico}}/>
                    <div className="qa-lbl">{a.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Suggestions */}
            {suggestions.length > 0 && (
              <div className="ai-card">
                <div className="ai-hdr">
                  <span className="ai-hdr-ico">🤖</span>
                  <div><div className="ai-hdr-title">AI Assistant</div><div className="ai-hdr-sub">Smart suggestions for today</div></div>
                </div>
                {suggestions.map((s,i)=>(
                  <div key={i} className="ai-item">
                    <div className={`ai-ico ${s.priority==='high'?'ai-danger':s.priority==='medium'?'ai-warn':''}`}>{s.icon}</div>
                    <div className="ai-body">
                      <div className="ai-title">{s.title}</div>
                      <div className="ai-desc">{s.desc}</div>
                    </div>
                    <span className={`ai-priority ${s.priority==='high'?'ai-priority-high':'ai-priority-med'}`}>{s.priority==='high'?'Urgent':'Follow-up'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Today's Stops */}
            {todayVisits.length > 0 && (
              <div className="stops-card">
                <div className="section-row">
                  <span className="section-label">Today's Route ({todayVisits.length})</span>
                  <button className="section-link" onClick={()=>setShowMap(true)}>🗺️ Map</button>
                </div>
                {todayVisits.map((v,i)=>{
                  const pl=i===0?journey?.start_latitude:todayVisits[i-1]?.latitude
                  const pn=i===0?journey?.start_longitude:todayVisits[i-1]?.longitude
                  const dist=(pl&&v.latitude)?calcDistanceKm(pl,pn,v.latitude,v.longitude):null
                  return (
                    <div key={v.id} className="stop-row">
                      <div className="stop-num" style={{background:STOP_COLORS[i%STOP_COLORS.length]}}>{i+1}</div>
                      <div className="stop-body">
                        <div className="stop-name">{v.client_name||v.customer_name}</div>
                        <div className="stop-tags">
                          <span className="stop-tag" style={{background:'#EFF6FF',color:'#2563EB'}}>{v.client_type}</span>
                          {v.location && <span className="stop-tag" style={{background:'#F3F4F6',color:'#6B7280'}}>{v.location.split(',')[0]}</span>}
                        </div>
                        {dist!=null && <div className="stop-dist-chip">🛣️ {dist.toFixed(1)}km · {calcTravelTime(dist)}</div>}
                        {v.status && v.status!=='Completed' && <StatusChip s={v.status}/>}
                        {v.notes && <div className="stop-notes">💬 {v.notes}</div>}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                        <div className="stop-time">{fmtTime(v.created_at)}</div>
                        <button onClick={e=>{e.stopPropagation();shareVisitOnWhatsApp(v)}}
                          style={{background:'#ECFDF5',border:'1px solid #6EE7B7',borderRadius:6,
                            padding:'2px 7px',fontSize:'0.6rem',fontWeight:700,color:'#059669',cursor:'pointer'}}>
                          &#x1F4AC; WA
                        </button>
                      </div>
                    </div>
                  )
                })}
                {journeyKm>0 && (
                  <div className="stops-summary">
                    <div className="ss-item"><div className="ss-val">{todayVisits.length}</div><div className="ss-lbl">Stops</div></div>
                    <div className="ss-item"><div className="ss-val">{journeyKm.toFixed(1)} km</div><div className="ss-lbl">Distance</div></div>
                    <div className="ss-item"><div className="ss-val">{calcTravelTime(journeyKm)}</div><div className="ss-lbl">Drive Est.</div></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- VISITS ---- */}
        {tab==='visits' && (
          <div className="tab-pane">
            <div className="tab-hdr">
              <span className="tab-hdr-title">All Visits <span className="tab-hdr-count">({allVisits.length})</span></span>
              <button className="btn-add" onClick={()=>{setVf(initVF());setVisitModal(true)}}>+ Log Visit</button>
            </div>
            {allVisits.length===0
              ? <div className="empty"><div className="empty-ico">📍</div><div className="empty-txt">No visits logged yet.</div><button className="empty-cta" onClick={()=>setVisitModal(true)}>Log First Visit</button></div>
              : allVisits.map(v=>(
                <div key={v.id} className="visit-card">
                  <div className="vc-top">
                    <div className="vc-name">{v.client_name||v.customer_name}</div>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <div className="vc-badge">{v.client_type}</div>
                      <button onClick={()=>shareVisitOnWhatsApp(v)}
                        style={{background:'#DCFCE7',border:'1px solid #6EE7B7',borderRadius:6,
                          padding:'2px 6px',fontSize:'0.6rem',fontWeight:700,color:'#059669',cursor:'pointer'}}>
                        &#x1F4AC;
                      </button>
                    </div>
                  </div>
                  <div className="vc-loc"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="5" r="2" stroke="#9CA3AF" strokeWidth="1.2"/><path d="M6 2a3 3 0 013 3c0 2.5-3 6-3 6S3 7.5 3 5a3 3 0 013-3z" stroke="#9CA3AF" strokeWidth="1.2"/></svg>{v.location}</div>
                  <StatusChip s={v.status||'Completed'}/>
                  {v.notes && <div className="vc-notes">&#x1F4AC; {v.notes}</div>}
                  {v.photo && <img src={v.photo} alt="Visit" style={{width:'100%',maxHeight:140,objectFit:'cover',borderRadius:8,marginTop:8}}/>}
                  {v.voice_note && (
                    <div style={{marginTop:8,display:'flex',alignItems:'center',gap:6,padding:'7px 10px',background:'#F0FDF4',borderRadius:8,border:'1px solid #6EE7B7'}}>
                      <span style={{fontSize:'0.9rem'}}>&#x1F3A4;</span>
                      <audio controls src={v.voice_note} style={{flex:1,height:28}}/>
                    </div>
                  )}
                  <div className="vc-foot"><span>{v.visit_type}</span><span>{fmtDate(v.visit_date)} &#xB7; {fmtTime(v.created_at)}</span></div>
                </div>
              ))
            }
          </div>
        )}

        {/* ---- REPORTS ---- */}
        {tab==='reports' && (
          <div className="tab-pane">
            <div className="tab-hdr">
              <span className="tab-hdr-title">Sales Reports</span>
              <button className="btn-add" onClick={()=>{setSf(initSF());setSalesModal(true)}}>+ Add</button>
            </div>
            {reports.length===0
              ? <div className="empty"><div className="empty-ico">📊</div><div className="empty-txt">No reports submitted yet.</div><button className="empty-cta" onClick={()=>setSalesModal(true)}>Submit Today's Report</button></div>
              : reports.map(r=>{
                const pct=r.sales_target>0?Math.round((r.sales_achievement/r.sales_target)*100):0
                const c=pct>=100?'#10B981':pct>=75?'#2563EB':'#F59E0B'
                const bg=pct>=100?'#ECFDF5':pct>=75?'#EFF6FF':'#FFFBEB'
                return (
                  <div key={r.id} className="report-card">
                    <div className="rc-head">
                      <div className="rc-date">{fmtDate(r.date)}</div>
                      <span className="rc-pct" style={{background:bg,color:c}}>{pct}% of target</span>
                    </div>
                    <div className="rc-grid">
                      <div><div className="rc-cell-lbl">Sales Achievement</div><div className="rc-cell-val">{fmt(r.sales_achievement)}</div><div className="rc-cell-tgt">of {fmt(r.sales_target)}</div></div>
                      <div><div className="rc-cell-lbl">Profit Achievement</div><div className="rc-cell-val">{fmt(r.profit_achievement)}</div><div className="rc-cell-tgt">of {fmt(r.profit_target)}</div></div>
                    </div>
                    <div className="rc-bar-row">
                      <div className="rc-bar"><div className="rc-fill" style={{width:`${Math.min(pct,100)}%`,background:c}}/></div>
                      <span className="rc-pct-lbl" style={{color:c}}>{pct}%</span>
                    </div>
                  </div>
                )
              })
            }
          </div>
        )}

        {/* ---- PRODUCTS ---- */}
        {tab==='products' && (
          <div className="tab-pane">
            <div className="tab-hdr">
              <span className="tab-hdr-title">Product Day</span>
              <button className="btn-add" onClick={()=>{setEditProd(null);setPf(initPF());setProductModal(true)}}>+ Add</button>
            </div>
            {todayProducts.length>0 && (
              <>
                <div className="sub-label">Today — {today}</div>
                {todayProducts.map(p=>{
                  const pct=p.target_qty>0?Math.round((p.achieved_qty/p.target_qty)*100):0
                  const c=pct>=100?'#10B981':pct>=75?'#2563EB':'#F59E0B'
                  return (
                    <div key={p.id} className="product-card">
                      <div className="pc-head">
                        <div><div className="pc-brand-tag">{p.brand}</div><div className="pc-name">{p.product_name}</div></div>
                        <div className="pc-btns">
                          <button className="pc-btn" onClick={()=>openEditProd(p)}>✏️</button>
                          <button className="pc-btn pc-btn-del" onClick={()=>{deleteProductDayEntry(p.id);reload();toastMsg('Deleted')}}>🗑️</button>
                        </div>
                      </div>
                      <div className="pc-metrics">
                        <div className="pc-metric"><div className="pc-metric-lbl">Qty Achieved</div><div className="pc-metric-val">{p.achieved_qty}<span style={{color:'#9CA3AF',fontWeight:400}}>/{p.target_qty}</span></div></div>
                        <div className="pc-metric"><div className="pc-metric-lbl">Amount</div><div className="pc-metric-val" style={{fontSize:'.8rem'}}>{fmt(p.achieved_amount)}</div></div>
                      </div>
                      <div className="pc-bar"><div className="pc-fill" style={{width:`${Math.min(pct,100)}%`,background:c}}/></div>
                      <div className="pc-pct-lbl">{pct}% of target</div>
                    </div>
                  )
                })}
              </>
            )}
            {pastProducts.length>0 && (
              <>
                <div className="sub-label" style={{marginTop:6}}>Previous Entries</div>
                {pastProducts.map(p=>{
                  const pct=p.target_qty>0?Math.round((p.achieved_qty/p.target_qty)*100):0
                  return (
                    <div key={p.id} className="product-card product-card-past">
                      <div className="pc-head">
                        <div><div className="pc-brand-tag">{p.brand} · {fmtDate(p.date)}</div><div className="pc-name">{p.product_name}</div></div>
                        <button className="pc-btn pc-btn-del" onClick={()=>{deleteProductDayEntry(p.id);reload()}}>🗑️</button>
                      </div>
                      <div className="pc-metrics">
                        <div className="pc-metric"><div className="pc-metric-lbl">Qty</div><div className="pc-metric-val">{p.achieved_qty}/{p.target_qty}</div></div>
                        <div className="pc-metric"><div className="pc-metric-lbl">Amount</div><div className="pc-metric-val" style={{fontSize:'.8rem'}}>{fmt(p.achieved_amount)}</div></div>
                      </div>
                      <div className="pc-bar"><div className="pc-fill" style={{width:`${Math.min(pct,100)}%`,background:'#9CA3AF'}}/></div>
                      <div className="pc-pct-lbl">{pct}%</div>
                    </div>
                  )
                })}
              </>
            )}
            {products.length===0 && <div className="empty"><div className="empty-ico">📦</div><div className="empty-txt">No product entries yet.</div><button className="empty-cta" onClick={()=>setProductModal(true)}>Add First Entry</button></div>}
          </div>
        )}

        {/* ---- CUSTOMERS ---- */}
        {tab==='customers' && (
          <div className="tab-pane">
            <div className="tab-hdr">
              <span className="tab-hdr-title">Customers <span className="tab-hdr-count">({customers.length})</span></span>
              <button className="btn-add" onClick={()=>setShowAddCustomer(true)}>+ Add</button>
            </div>
            {/* Search + Territory filter */}
            <div className="cust-filters">
              <div className="cust-search">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#9CA3AF" strokeWidth="1.3"/><path d="M10.5 10.5l-2-2" stroke="#9CA3AF" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <input value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)} placeholder="Search customers…"/>
              </div>
              <button className="cust-detect-btn" onClick={checkNearby}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                Nearby
              </button>
            </div>
            {customers.length===0
              ? <div className="empty"><div className="empty-ico">🏪</div><div className="empty-txt">No customers yet.</div><button className="empty-cta" onClick={()=>setShowAddCustomer(true)}>Add First Customer</button></div>
              : customers.filter(c=>!customerFilter||c.name.toLowerCase().includes(customerFilter.toLowerCase())||c.owner_name?.toLowerCase().includes(customerFilter.toLowerCase())).map(c=>(
                <div key={c.id} className="customer-card">
                  <div className="cc-top">
                    <div className="cc-avatar">{c.name?.[0]}</div>
                    <div className="cc-info">
                      <div className="cc-name">{c.name}</div>
                      <div className="cc-owner">{c.owner_name}</div>
                    </div>
                    <span className="cc-type-badge">{c.type}</span>
                  </div>
                  <div className="cc-details">
                    {c.territory && <span className="cc-tag cc-terr">📍 {c.territory}</span>}
                    {c.phone     && <span className="cc-tag">📞 {c.phone}</span>}
                    {c.address   && <div className="cc-addr">{c.address}</div>}
                  </div>
                  <div className="cc-foot">
                    <span className="cc-visits">{c.visit_count||0} visits</span>
                    {c.latitude && <span className="cc-gps">🛰️ GPS</span>}
                    <button className="cc-visit-btn" onClick={()=>{
                      setVf(p=>({...p,customer_name:c.name,customer_id:c.id,client_type:c.type,location:c.address||''}))
                      setVisitModal(true)
                    }}>Log Visit</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ---- PROFILE ---- */}
        {tab==='profile' && (
          <div className="tab-pane">
            <div className="profile-hero">
              <div className="ph-avatar">{user?.full_name?.[0]}</div>
              <div className="ph-name">{user?.full_name}</div>
              <div className="ph-role">Sales Manager</div>
              <div className="ph-username">@{user?.username}</div>
            </div>
            <div className="prof-stats">
              {[{v:allVisits.length,l:'Visits'},{v:reports.length,l:'Reports'},{v:products.length,l:'Products'}].map(s=>(
                <div key={s.l} className="pstat"><div className="pstat-val">{s.v}</div><div className="pstat-lbl">{s.l}</div></div>
              ))}
            </div>
            <div className="info-table">
              {[
                ['Username',`@${user?.username}`],['Role','Sales Manager'],
                ['Status',`${sm.icon} ${status}`],['Visits Today',todayVisits.length],
                ['Sales Today',todayReport?fmt(todayReport.sales_achievement):'—'],
                ['Visit Target',latestTarget?.visit_target||'Not set'],
                ['Sales Target',latestTarget?.sales_target?fmt(latestTarget.sales_target):'Not set'],
                ['App Version','v3.0 · SFA · Offline PWA'],
              ].map(([k,v])=>(
                <div key={k} className="info-row"><span className="info-key">{k}</span><span className="info-val">{v}</span></div>
              ))}
            </div>
            <button className="logout-btn-full" onClick={logout}>Sign Out</button>

            {/* -- App Settings Section -- */}
            <div style={{marginTop:16,padding:'0 4px'}}>
              <div style={{fontSize:'0.65rem',fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>App Settings</div>

              {/* Notifications */}
              <div style={{background:'#fff',borderRadius:12,border:'1px solid #E5E7EB',padding:'14px 16px',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'0.85rem',color:'#111827'}}>&#x1F514; Push Notifications</div>
                    <div style={{fontSize:'0.72rem',color:'#9CA3AF',marginTop:2}}>
                      {notifPerm==='granted' ? 'Enabled — you will receive daily reminders' :
                       notifPerm==='denied'  ? 'Blocked — enable in browser settings' :
                       'Get reminders at 11 AM on working days'}
                    </div>
                  </div>
                  {notifPerm==='granted'
                    ? <span style={{background:'#ECFDF5',color:'#059669',fontWeight:700,fontSize:'0.65rem',padding:'3px 8px',borderRadius:20}}>ON</span>
                    : notifPerm==='denied'
                    ? <span style={{background:'#FEF2F2',color:'#DC2626',fontWeight:700,fontSize:'0.65rem',padding:'3px 8px',borderRadius:20}}>BLOCKED</span>
                    : <button onClick={requestNotificationPermission}
                        style={{background:'#2563EB',color:'#fff',border:'none',borderRadius:8,
                          padding:'7px 14px',fontWeight:700,fontSize:'0.75rem',cursor:'pointer'}}>
                        Enable
                      </button>
                  }
                </div>
              </div>

              {/* WhatsApp Share */}
              <div style={{background:'#fff',borderRadius:12,border:'1px solid #E5E7EB',padding:'14px 16px',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'0.85rem',color:'#111827'}}>&#x1F4AC; Share Today's Report</div>
                    <div style={{fontSize:'0.72rem',color:'#9CA3AF',marginTop:2}}>{todayVisits.length} visits · {fmt(todayReport?.sales_achievement||0)} sales</div>
                  </div>
                  <button onClick={shareOrderOnWhatsApp}
                    style={{background:'#DCFCE7',color:'#059669',border:'1px solid #6EE7B7',borderRadius:8,
                      padding:'7px 14px',fontWeight:700,fontSize:'0.75rem',cursor:'pointer'}}>
                    WhatsApp
                  </button>
                </div>
              </div>

              {/* Offline Status */}
              <div style={{background:'#fff',borderRadius:12,border:'1px solid #E5E7EB',padding:'14px 16px',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'0.85rem',color:'#111827'}}>
                      {isOnline ? '&#x1F7E2; Online' : '&#x1F534; Offline'}
                    </div>
                    <div style={{fontSize:'0.72rem',color:'#9CA3AF',marginTop:2}}>
                      {isOnline ? 'Data syncing to cloud' : `${offlineQueue.length} actions queued for sync`}
                    </div>
                  </div>
                  <span style={{
                    background:isOnline?'#ECFDF5':'#FEF2F2',
                    color:isOnline?'#059669':'#DC2626',
                    fontWeight:700,fontSize:'0.65rem',padding:'3px 8px',borderRadius:20
                  }}>{isOnline?'SYNCED':'OFFLINE'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* -- Tab Bar -- */}
      <nav className="tab-bar">
        {[
          {id:'home',ico:'&#x1F3E0;',lbl:'Home'},
          {id:'visits',ico:'&#x1F4CD;',lbl:'Visits'},
          {id:'customers',ico:'&#x1F3EA;',lbl:'Customers'},
          {id:'reports',ico:'&#x1F4CA;',lbl:'Reports'},
          {id:'products',ico:'&#x1F4E6;',lbl:'Products'},
          {id:'profile',ico:'&#x1F464;',lbl:'Profile'}
        ].map(t=>(
          <button key={t.id} className={`tab-btn ${tab===t.id?'tab-active':''}`} onClick={()=>setTab(t.id)}>
            <div className="tab-ico-bg"><span className="tab-ico" dangerouslySetInnerHTML={{__html:t.ico}}/></div>
            <span className="tab-lbl">{t.lbl}</span>
          </button>
        ))}
      </nav>

      {/* ---- STATUS PICKER ---- */}
      {showStatusPicker && (
        <div className="modal-overlay" onClick={()=>setShowStatusPicker(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr"><div className="modal-title">Update Status</div><button className="modal-close" onClick={()=>setShowStatusPicker(false)}>✕</button></div>
            <div className="modal-body">
              <div className="status-picker-grid">
                {Object.entries(STATUS_META).map(([s,m])=>(
                  <button key={s} className={`sp-option ${status===s?'sp-active':''}`} onClick={()=>changeStatus(s)}>
                    <span className="sp-ico">{m.icon}</span>
                    <span className="sp-label">{s}</span>
                    {status===s && <span className="sp-active-dot" style={{background:m.color}}/>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- JOURNEY MAP ---- */}
      {showMap && (
        <JourneyMap journey={journey} visits={todayVisits} managerName={user?.full_name}
          onVisitLogged={onVisitLogged} onClose={()=>{setShowMap(false);reload()}}/>
      )}

      {/* ---- VISIT MODAL — with Smart Autocomplete ---- */}
      {visitModal && (
        <div className="modal-overlay" onClick={()=>setVisitModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr"><div className="modal-title">📍 Log Client Visit</div><button className="modal-close" onClick={()=>setVisitModal(false)}>✕</button></div>
            <div className="modal-body">

              {/* -- Customer Autocomplete -- */}
              <div className="fg">
                <label>Customer Name *</label>
                <AutocompleteInput
                  value={vf.customer_name}
                  onChange={v => setVf(p=>({...p, customer_name:v, customer_id:null}))}
                  onSelect={c => c && setVf(p=>({...p, customer_name:c.name, customer_id:c.id, client_type:c.type||p.client_type, location:c.address||p.location}))}
                  placeholder="Search customer or type new name…"
                  searchFn={searchCustomers}
                  recentsFn={getRecentCustomers}
                  renderItem={c => <span className="ac-item-name">{c.name}</span>}
                  renderMeta={c => <span className="ac-type-tag">{c.type}</span>}
                  addNewLabel="+ Add New Customer"
                  onAddNew={()=>setAddCustomerModal(true)}
                  autoFocus
                />
              </div>

              <div className="row-2">
                <div className="fg">
                  <label>Client Type</label>
                  <select value={vf.client_type} onChange={e=>setVf(p=>({...p,client_type:e.target.value}))}>
                    {CLIENT_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Visit Status</label>
                  <select value={vf.status} onChange={e=>setVf(p=>({...p,status:e.target.value}))}>
                    {VISIT_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="fg">
                <label>Visit Type</label>
                <select value={vf.visit_type} onChange={e=>setVf(p=>({...p,visit_type:e.target.value}))}>
                  {VISIT_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="fg">
                <label>Location / Address *</label>
                <input value={vf.location} onChange={e=>setVf(p=>({...p,location:e.target.value}))} placeholder="Area, City or full address"/>
              </div>

              <div className="fg">
                <label>Notes / Visit Outcome</label>
                <textarea value={vf.notes} onChange={e=>setVf(p=>({...p,notes:e.target.value}))} placeholder="Orders placed, discussions, follow-ups…" rows={3}/>
              </div>

              {/* -- Photo Capture -- */}
              <div className="fg">
                <label>Visit Photo <span style={{fontWeight:400,color:'#9CA3AF'}}>(optional)</span></label>
                {photoPreview ? (
                  <div style={{position:'relative',borderRadius:10,overflow:'hidden',border:'1.5px solid #E5E7EB'}}>
                    <img src={photoPreview} alt="Visit" style={{width:'100%',height:160,objectFit:'cover',display:'block'}}/>
                    <button onClick={()=>{setVisitPhoto(null);setPhotoPreview(null)}}
                      style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.6)',border:'none',
                        borderRadius:'50%',width:26,height:26,color:'#fff',cursor:'pointer',fontSize:'0.75rem',
                        display:'flex',alignItems:'center',justifyContent:'center'}}>&#x2715;</button>
                  </div>
                ) : (
                  <button onClick={capturePhoto}
                    style={{width:'100%',padding:'12px',border:'1.5px dashed #D1D5DB',borderRadius:10,
                      background:'#F9FAFB',color:'#374151',cursor:'pointer',display:'flex',
                      alignItems:'center',justifyContent:'center',gap:8,fontSize:'0.82rem',fontWeight:600}}>
                    <span style={{fontSize:'1.2rem'}}>&#x1F4F7;</span> Take Photo / Upload
                  </button>
                )}
              </div>

              {/* -- Voice Note -- */}
              <div className="fg">
                <label>Voice Note <span style={{fontWeight:400,color:'#9CA3AF'}}>(optional, max 60s)</span></label>
                {voiceNote ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',
                    background:'#F0FDF4',border:'1.5px solid #6EE7B7',borderRadius:10}}>
                    <span style={{fontSize:'1.1rem'}}>&#x1F3A4;</span>
                    <audio controls src={voiceNote} style={{flex:1,height:32}}/>
                    <button onClick={clearVoiceNote}
                      style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:'1rem'}}>&#x2715;</button>
                  </div>
                ) : isRecording ? (
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                    background:'#FEF2F2',border:'1.5px solid #FECACA',borderRadius:10}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:'#EF4444',
                      animation:'pulse 1s infinite',display:'inline-block'}}/>
                    <span style={{fontSize:'0.82rem',fontWeight:700,color:'#DC2626',flex:1}}>
                      Recording... {recordingTime}s
                    </span>
                    <button onClick={stopRecording}
                      style={{background:'#EF4444',border:'none',borderRadius:7,padding:'6px 14px',
                        color:'#fff',fontWeight:700,fontSize:'0.78rem',cursor:'pointer'}}>
                      Stop
                    </button>
                  </div>
                ) : (
                  <button onClick={startRecording}
                    style={{width:'100%',padding:'12px',border:'1.5px dashed #D1D5DB',borderRadius:10,
                      background:'#F9FAFB',color:'#374151',cursor:'pointer',display:'flex',
                      alignItems:'center',justifyContent:'center',gap:8,fontSize:'0.82rem',fontWeight:600}}>
                    <span style={{fontSize:'1.2rem'}}>&#x1F3A4;</span> Record Voice Note
                  </button>
                )}
              </div>

            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={()=>{setVisitModal(false);setVisitPhoto(null);setPhotoPreview(null);setVoiceNote(null)}}>Cancel</button>
              <button className="btn-submit" onClick={submitVisit}>Log Visit</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- SALES MODAL ---- */}
      {salesModal && (
        <div className="modal-overlay" onClick={()=>setSalesModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr"><div className="modal-title">📊 Daily Sales Report</div><button className="modal-close" onClick={()=>setSalesModal(false)}>✕</button></div>
            <div className="modal-body">
              <div className="modal-note">📅 Reporting for: <strong>{today}</strong></div>
              <div className="modal-section-lbl">Sales</div>
              <div className="row-2">
                <div className="fg"><label>Target (₹)</label><input type="number" value={sf.sales_target} onChange={e=>setSf(p=>({...p,sales_target:e.target.value}))} placeholder="100000"/></div>
                <div className="fg"><label>Achievement (₹) *</label><input type="number" value={sf.sales_achievement} onChange={e=>setSf(p=>({...p,sales_achievement:e.target.value}))} placeholder="0"/></div>
              </div>
              {salesAchPct!==null && (
                <div className="modal-info-box">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#2563EB" strokeWidth="1.4"/><path d="M6 9l2 2 4-4" stroke="#2563EB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <div><div className="mib-label">Sales Achievement</div><div className="mib-value"><span className="pct-preview">{salesAchPct}%</span> of target</div></div>
                </div>
              )}
              <div className="modal-section-lbl">Profit</div>
              <div className="row-2">
                <div className="fg"><label>Target (₹)</label><input type="number" value={sf.profit_target} onChange={e=>setSf(p=>({...p,profit_target:e.target.value}))} placeholder="20000"/></div>
                <div className="fg"><label>Achievement (₹)</label><input type="number" value={sf.profit_achievement} onChange={e=>setSf(p=>({...p,profit_achievement:e.target.value}))} placeholder="0"/></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={()=>setSalesModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={submitSales}>Submit Report</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- PRODUCT MODAL — with Smart Autocomplete ---- */}
      {productModal && (
        <div className="modal-overlay" onClick={()=>{setProductModal(false);setEditProd(null)}}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr"><div className="modal-title">📦 {editProd?'Update Product Entry':'Add Product Entry'}</div><button className="modal-close" onClick={()=>{setProductModal(false);setEditProd(null)}}>✕</button></div>
            <div className="modal-body">

              {/* -- Brand Autocomplete -- */}
              <div className="fg">
                <label>Brand *</label>
                <AutocompleteInput
                  value={pf.brand}
                  onChange={v => setPf(p=>({...p, brand:v, brand_id:null, product_name:'', product_id:null}))}
                  onSelect={b => b && setPf(p=>({...p, brand:b.name, brand_id:b.id, product_name:'', product_id:null}))}
                  placeholder="Search brand…"
                  searchFn={searchBrands}
                  recentsFn={getRecentBrands}
                  renderItem={b => <span className="ac-item-name">{b.name}</span>}
                  addNewLabel="+ Add New Brand"
                  onAddNew={()=>setAddBrandModal(true)}
                  disabled={!!editProd}
                  autoFocus={!editProd}
                />
              </div>

              {/* -- Product Autocomplete -- */}
              <div className="fg">
                <label>Product Name *</label>
                <AutocompleteInput
                  value={pf.product_name}
                  onChange={v => setPf(p=>({...p, product_name:v, product_id:null}))}
                  onSelect={prod => prod && setPf(p=>({...p, product_name:prod.name, product_id:prod.id, brand:prod.brand_name||p.brand, brand_id:prod.brand_id||p.brand_id}))}
                  placeholder="Search product…"
                  searchFn={q => searchProducts(q, pf.brand_id||null)}
                  recentsFn={getRecentProducts}
                  renderItem={prod => <span className="ac-item-name">{prod.name}</span>}
                  renderMeta={prod => prod.brand_name ? <span className="ac-brand-tag">{prod.brand_name}</span> : null}
                  addNewLabel="+ Add New Product"
                  onAddNew={()=>setAddProductModal(true)}
                  disabled={!!editProd}
                />
              </div>

              <div className="modal-section-lbl">Quantity</div>
              <div className="row-2">
                <div className="fg"><label>Target Qty</label><input type="number" value={pf.target_qty} onChange={e=>setPf(p=>({...p,target_qty:e.target.value}))} placeholder="0" disabled={!!editProd}/></div>
                <div className="fg"><label>Achieved Qty</label><input type="number" value={pf.achieved_qty} onChange={e=>setPf(p=>({...p,achieved_qty:e.target.value}))} placeholder="0"/></div>
              </div>
              {prodPct!==null && (
                <div className="modal-info-box">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="#7C3AED" strokeWidth="1.4"/><path d="M9 5.5v4l2.5 2.5" stroke="#7C3AED" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  <div><div className="mib-label">Quantity Achievement</div><div className="mib-value" style={{color:'#7C3AED'}}><span className="pct-preview">{prodPct}%</span> of target</div></div>
                </div>
              )}
              <div className="modal-section-lbl">Value (₹)</div>
              <div className="row-2">
                <div className="fg"><label>Target Amount</label><input type="number" value={pf.target_amount} onChange={e=>setPf(p=>({...p,target_amount:e.target.value}))} placeholder="0" disabled={!!editProd}/></div>
                <div className="fg"><label>Achieved Amount</label><input type="number" value={pf.achieved_amount} onChange={e=>setPf(p=>({...p,achieved_amount:e.target.value}))} placeholder="0"/></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={()=>{setProductModal(false);setEditProd(null)}}>Cancel</button>
              <button className="btn-submit" onClick={submitProduct}>{editProd?'Update Entry':'Add Entry'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- QUICK-ADD MODALS ---- */}
      {addCustomerModal && (
        <QuickAddCustomerModal
          onCreated={c => { setVf(p=>({...p,customer_name:c.name,customer_id:c.id,client_type:c.type,location:c.address||p.location})); toastMsg(`Customer "${c.name}" added ✅`) }}
          onClose={()=>setAddCustomerModal(false)}
        />
      )}
      {addBrandModal && (
        <QuickAddBrandModal
          onCreated={b => { setPf(p=>({...p,brand:b.name,brand_id:b.id})); toastMsg(`Brand "${b.name}" added ✅`) }}
          onClose={()=>setAddBrandModal(false)}
        />
      )}
      {addProductModal && (
        <QuickAddProductModal
          brandId={pf.brand_id} brandName={pf.brand}
          onCreated={prod => { setPf(p=>({...p,product_name:prod.name,product_id:prod.id})); toastMsg(`Product "${prod.name}" added ✅`) }}
          onClose={()=>setAddProductModal(false)}
        />
      )}

      {/* ---- ADD CUSTOMER (GPS) MODAL ---- */}
      {showAddCustomer && (
        <AddCustomerModal
          createdBy={user?.id}
          onCreated={c => { reload(); toastMsg(`✅ "${c.name}" added with GPS location`) }}
          onClose={()=>setShowAddCustomer(false)}
        />
      )}
    </div>
  )
}

// Tiny helper used in JSX (avoids undefined in style)
const var_pl = '#EFF6FF'

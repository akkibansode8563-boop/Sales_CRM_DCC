import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { App } from '@capacitor/app'
import useAuthStore from '../store/authStore'
import {
    calcDistanceKm, calcTravelTime,
    searchCustomers, getRecentCustomers, getTerritories,
    searchBrands,    getRecentBrands,
    searchProducts,  getRecentProducts,
    getAISuggestions, detectNearbyCustomers, getOfflineQueue, flushOfflineQueue,
    getAllVisitsSync        as getAllVisits,
    getDailyReportsSync    as getDailySalesReports,
    getProductEntriesSync  as getProductDayEntries,
    getTargetsSync         as getTargets,
    getActiveJourneySync   as getActiveJourney,
    getActiveJourney       as getActiveJourneyCloud,
    getTodayVisitsSync     as getTodayVisits,
    getCustomersSync       as getCustomers,
    getTasksSync           as getTasks,
    createTask,
    updateTask,
    saveDailySalesReport,
    createProductDayEntry,
    updateProductDayEntry,
    deleteProductDayEntry,
    createCustomer,
    updateCustomer,
    createBrand,
    createProduct,
    getCurrentStatus,
    refreshSync,
} from '../utils/supabaseDB'
import { startJourney, endJourney, logGPSPoint } from '../services/journeyService'
import { createVisit } from '../services/visitService'
import { updateStatus } from '../services/authService'
import JourneyMap from '../components/JourneyMap'
import AutocompleteInput, {
  QuickAddCustomerModal, QuickAddBrandModal, QuickAddProductModal
} from '../components/AutocompleteInput'
import AddCustomerModal from '../components/AddCustomerModal'
import MotivationalIntro from '../components/MotivationalIntro'
import ProformaInvoice  from '../components/ProformaInvoice'
import JourneyStartModal from '../components/JourneyStartModal'
import dccLogo from '../assets/dcc-logo.png'
import { createVisitDraft, validateVisitDraft } from '../utils/visitRequirements'
import { startRealtimeSync, onSyncStatusChange, getQueueCount, forceSyncNow, getLastSyncAt, flushPriorityData } from '../services/syncService'
import { getCurrentPosition, getLocationFallback, reverseGeocodeCached } from '../utils/location'
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
const INTERACTION_TYPES = ['Meeting','Follow-up','Order Discussion','Payment Collection','Complaint','Other']
const INTERACTION_ICONS = {
  'Meeting': '🤝',
  'Follow-up': '📞',
  'Order Discussion': '📦',
  'Payment Collection': '💰',
  'Complaint': '⚠️',
  'Other': '📍'
}
const VISIT_STATUSES = ['Completed','Pending','Not Visited']

const fmt = v => v!=null ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '--'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '--'
const calcElapsed = start => {
  const m = Math.round((Date.now()-new Date(start))/60000)
  return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m`
}

/* -- Visit modal initial form -- */
const initVF = () => createVisitDraft()
const initSF = () => ({ sales_target:'', sales_achievement:'', profit_target:'', profit_achievement:'' })
const initPF = () => ({ brand:'', brand_id:null, product_name:'', product_id:null, target_qty:'', achieved_qty:'', target_amount:'', achieved_amount:'' })
const getInitialOnlineStatus = () => (typeof navigator !== 'undefined' ? navigator.onLine : true)
const getInitialNotificationPermission = () => (typeof Notification !== 'undefined' ? Notification.permission : 'default')
const getInitialIntroVisibility = () => {
  try {
    const today = new Date().toISOString().split('T')[0]
    return typeof localStorage !== 'undefined' && localStorage.getItem('dcc_intro_date') !== today
  } catch {
    return false
  }
}
const getStoredProfilePic = (userId) => {
  if (!userId) return null
  try {
    return localStorage.getItem(`dcc_pfp_${userId}`) || null
  } catch {
    return null
  }
}

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
  const [tasks,            setTasks]            = useState([])
  const [suggestions,      setSuggestions]      = useState([])
  const [toast,            setToast]            = useState(null)
  const [showMap,          setShowMap]          = useState(false)
  const [showAddCustomer,  setShowAddCustomer]  = useState(false)
  const [customers,        setCustomers]        = useState([])
  const [customerFilter,   setCustomerFilter]   = useState('')
  const [nearbyCustomers,  setNearbyCustomers]  = useState([])
  const [isOnline,         setIsOnline]         = useState(getInitialOnlineStatus)
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
  const [notifPerm, setNotifPerm]           = useState(getInitialNotificationPermission)
  const [syncStatus, setSyncStatus]         = useState('idle')
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getQueueCount())
  const [lastSyncAt, setLastSyncAt]         = useState(() => getLastSyncAt())
  const [manualSyncing, setManualSyncing]   = useState(false)
  
  // Refresh & Navigation state
  const [isRefreshing, setIsRefreshing]     = useState(false)
  const mainRef = useRef(null)
  const touchStartRef = useRef(0)

  // Motivational intro — show once per session
  const [showIntro, setShowIntro]           = useState(getInitialIntroVisibility)
  // Journey start modal
  const [showJourneyModal, setShowJourneyModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  // Profile picture — persisted in localStorage per user
  const [profilePic, setProfilePic]         = useState(() => getStoredProfilePic(user?.id))
  const normalizeCustomerText = useCallback((value = '') => String(value).trim().toLowerCase(), [])
  const sortedCustomers = useMemo(
    () => [...(customers || [])].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')),
    [customers]
  )
  const customerLookup = useMemo(() => {
    const byId = new Map()
    const byName = new Map()

    sortedCustomers.forEach((customer) => {
      if (customer?.id != null) byId.set(customer.id, customer)
      const key = normalizeCustomerText(customer?.name)
      if (key) byName.set(key, customer)
    })

    return { byId, byName }
  }, [normalizeCustomerText, sortedCustomers])

  const today = new Date().toISOString().split('T')[0]

  const toastMsg = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null), 3200) }
  const syncLabel = lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : 'Not yet'

  useEffect(() => {
    setIsOnline(getInitialOnlineStatus())
    setNotifPerm(getInitialNotificationPermission())
    setShowIntro(getInitialIntroVisibility())
  }, [])

  useEffect(() => {
    setProfilePic(getStoredProfilePic(user?.id))
  }, [user?.id])

  const compressVisitImage = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.onload = (event) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not process image'))
      img.onload = () => {
        const maxSide = 1440
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const width = Math.max(1, Math.round(img.width * scale))
        const height = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not process image'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }), [])

  /* -- Photo Capture -- */
  const capturePhoto = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'
    input.onchange = async e => {
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

  const capturePhotoCompressed = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'
    input.onchange = async e => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const compressed = await compressVisitImage(file)
        setVisitPhoto(compressed)
        setPhotoPreview(compressed)
        toastMsg('Photo captured')
      } catch {
        toastMsg('Could not process image', 'error')
      }
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

  // Granular reload helpers — only re-read what actually changed
  const reloadVisits    = useCallback(() => { if (user?.id) { setTodayVisits(getTodayVisits(user.id)); setAllVisits(getAllVisits(user.id)) } }, [user?.id])
  const reloadJourney   = useCallback(() => { if (user?.id) setJourney(getActiveJourney(user.id)) }, [user?.id])
  const reloadReports   = useCallback(() => { if (user?.id) setReports(getDailySalesReports(user.id)) }, [user?.id])
  const reloadProducts  = useCallback(() => { if (user?.id) setProducts(getProductDayEntries(user.id)) }, [user?.id])
  const reloadTasks     = useCallback(() => { if (user?.id) setTasks(getTasks(user.id)) }, [user?.id])
  const reloadCustomers = useCallback(() => setCustomers(getCustomers()), [])

  const applyCustomerToVisitForm = useCallback((customer, fallbackName = '') => {
    if (!customer) {
      setVf((prev) => ({ ...prev, customer_name: fallbackName || prev.customer_name, customer_id: null }))
      return
    }

    setVf((prev) => ({
      ...prev,
      customer_name: customer.name || fallbackName || prev.customer_name,
      customer_id: customer.id ?? null,
      client_type: customer.type || prev.client_type,
      location: customer.address || prev.location,
      contact_person: customer.owner_name || prev.contact_person,
      contact_phone: customer.phone || prev.contact_phone,
    }))
  }, [])

  const handleVisitCustomerChange = useCallback((value) => {
    const exactMatch = customerLookup.byName.get(normalizeCustomerText(value))
    if (exactMatch) {
      applyCustomerToVisitForm(exactMatch, value)
      return
    }

    setVf((prev) => ({ ...prev, customer_name: value, customer_id: null }))
  }, [applyCustomerToVisitForm, customerLookup.byName, normalizeCustomerText])

  const smartSearchCustomers = useCallback(async (query) => {
    const localMatches = sortedCustomers
      .filter((customer) => {
        const q = normalizeCustomerText(query)
        if (!q) return false
        return (
          normalizeCustomerText(customer?.name).includes(q) ||
          normalizeCustomerText(customer?.owner_name).includes(q) ||
          normalizeCustomerText(customer?.phone).includes(q) ||
          normalizeCustomerText(customer?.address).includes(q)
        )
      })
      .slice(0, 8)

    try {
      const remoteMatches = await searchCustomers(query)
      const seen = new Set()
      return [...localMatches, ...(remoteMatches || [])].filter((customer) => {
        const key = customer?.id || normalizeCustomerText(customer?.name)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 8)
    } catch {
      return localMatches
    }
  }, [normalizeCustomerText, sortedCustomers])

  // Full reload — only call on mount or major state changes
  const reload = useCallback(() => {
    if (!user?.id) return
    setStatus(getCurrentStatus(user.id))
    setJourney(getActiveJourney(user.id))
    setTodayVisits(getTodayVisits(user.id))
    setAllVisits(getAllVisits(user.id))
    setTargets(getTargets(user.id))
    setReports(getDailySalesReports(user.id))
    setProducts(getProductDayEntries(user.id))
    setTasks(getTasks(user.id))
    setSuggestions(getAISuggestions(user.id))
    setCustomers(getCustomers())
    setTerritories(getTerritories())
    setOfflineQueue(getOfflineQueue())
  }, [user?.id])

  useEffect(() => {
    const unsub = onSyncStatusChange(s => {
      setSyncStatus(s.syncing ? 'syncing' : (s.status || 'idle'))
      setPendingSyncCount(s.count ?? getQueueCount())
      if (s.lastSyncAt) setLastSyncAt(s.lastSyncAt)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = startRealtimeSync(() => { setTimeout(reload, 300) })
    return unsub
  }, [reload])

  /* ── Continuous GPS tracking while journey is active ──────────────────── */
  useEffect(() => {
    if (!journey?.id || !user?.id) return

    let watchId = null
    let fallbackInterval = null
    let lastLat = null, lastLng = null

    const sendGPS = (lat, lng) => {
      if (lastLat !== null) {
        const dlat = Math.abs(lat - lastLat), dlng = Math.abs(lng - lastLng)
        if (dlat < 0.0001 && dlng < 0.0001) return
      }
      lastLat = lat; lastLng = lng
      try { logGPSPoint(journey.id, user.id, lat, lng) } catch(e) {}
    }

    const startTracking = async () => {
      // 1. Native Background Geolocation (Zomato/Swiggy style tracker)
      if (typeof window !== 'undefined' && window.Capacitor?.isNative) {
        try {
          const { registerPlugin } = await import('@capacitor/core')
          const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')
          
          watchId = await BackgroundGeolocation.addWatcher({
            backgroundMessage: "Tracking your field journey continuously.",
            backgroundTitle: "DCC SalesForce Active",
            requestPermissions: true,
            stale: false,
            distanceFilter: 10 // meters
          }, (location, error) => {
            if (error || !location) return
            sendGPS(location.latitude, location.longitude)
          })
          return // successfully started native watcher
        } catch (err) {
          console.warn('Native Background GPS failed, falling back...', err)
        }
      }

      // 2. Web Fallback (stops in background)
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          pos => sendGPS(pos.coords.latitude, pos.coords.longitude),
          err => console.warn('GPS watch error:', err.message),
          { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
        )
        fallbackInterval = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            pos => sendGPS(pos.coords.latitude, pos.coords.longitude),
            () => {},
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 }
          )
        }, 30000)
      }
    }

    startTracking()

    return () => {
      const stopTracking = async () => {
        if (typeof window !== 'undefined' && window.Capacitor?.isNative && watchId && typeof watchId === 'string') {
          try {
            const { registerPlugin } = await import('@capacitor/core')
            const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')
            BackgroundGeolocation.removeWatcher({ id: watchId })
          } catch(e) {}
        } else if (navigator.geolocation && watchId !== null && typeof watchId === 'number') {
          navigator.geolocation.clearWatch(watchId)
        }
        if (fallbackInterval) clearInterval(fallbackInterval)
      }
      stopTracking()
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

  // Touch-to-refresh logic
  const handleTouchStart = (e) => {
    // Only allow pull-to-refresh if we are at the very top of the scroll container
    if (mainRef.current && mainRef.current.scrollTop <= 0) {
      touchStartRef.current = e.touches[0].clientY
    } else {
      touchStartRef.current = null
    }
  }

  const handleTouchEnd = async (e) => {
    if (!touchStartRef.current) return
    const touchEnd = e.changedTouches[0].clientY
    const delta = touchEnd - touchStartRef.current

    if (delta > 80 && !isRefreshing) {
      setIsRefreshing(true)
      // Fetch latest data safely
      reload()
      try {
        await refreshSync() // Sync customers/targets/tasks (does NOT reset journey state)
        reload()
      } catch (err) {}
      setTimeout(() => setIsRefreshing(false), 800)
    }
    touchStartRef.current = null
  }

  // Capacitor Hardware Back Button Navigation
  useEffect(() => {
    const handleBackButton = ({ canGoBack }) => {
      if (showMap) { setShowMap(false); return }
      if (visitModal) { setVisitModal(false); return }
      if (salesModal) { setSalesModal(false); return }
      if (productModal) { setProductModal(false); return }
      if (addCustomerModal) { setAddCustomerModal(false); return }
      if (addBrandModal) { setAddBrandModal(false); return }
      if (addProductModal) { setAddProductModal(false); return }
      if (showJourneyModal) { setShowJourneyModal(false); return }
      if (showInvoiceModal) { setShowInvoiceModal(false); return }
      if (showStatusPicker) { setShowStatusPicker(false); return }
      
      if (tab !== 'home') {
        setTab('home')
        return
      }

      // If at home and no modals, double tap to exit
      if (window._dccExitTimer) {
        App.exitApp()
      } else {
        toastMsg('Press back again to exit', 'info')
        window._dccExitTimer = setTimeout(() => { window._dccExitTimer = null }, 2500)
      }
    }

    let backListener = null
    App.addListener('backButton', handleBackButton).then(listener => {
      backListener = listener
    }).catch(()=>{}) // ignores exception on web browser

    return () => {
      if (backListener) backListener.remove()
    }
  }, [showMap, visitModal, salesModal, productModal, addCustomerModal, addBrandModal, addProductModal, showJourneyModal, showInvoiceModal, showStatusPicker, tab])

  useEffect(() => {
    reload() // instant render from local cache
    
    // Journey-Based Launch Logic
    // If localDB says journey is active, auto-open the map.
    // We intentionally SKIP the cloud active journey override here as requested (no cloud sync state modifier during check)
    if (user?.id) {
       const initialJourney = getActiveJourney(user.id)
       if (initialJourney) {
           setShowMap(true)
       }
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.active?.postMessage({ type: 'SCHEDULE_DAILY_REMINDER', managerName: user?.full_name })
      }).catch(()=>{})
    }
  }, [reload, user?.id])

  /* -- GPS helpers -- */
  const getGPS = useCallback(() => getCurrentPosition(), [])
  const reverseGeo = useCallback((lat, lng) => reverseGeocodeCached(lat, lng), [])
  const checkNearby = async () => {
    const c = await getGPS()
    if (c) {
      const nearby = detectNearbyCustomers(c.latitude, c.longitude)
      setNearbyCustomers(nearby)
      if (nearby.length > 0) toastMsg(`📍 ${nearby.length} customer(s) detected nearby!`, 'info')
    }
  }

  const syncNow = async () => {
    setManualSyncing(true)
    const result = await forceSyncNow()
    setManualSyncing(false)
    if (result.success) {
      if (result.lastSyncAt) setLastSyncAt(result.lastSyncAt)
      reload()
      toastMsg('Cloud sync completed')
    } else {
      toastMsg(result.message || 'Sync failed', 'error')
    }
  }

  const ensureVisitCustomer = async (draft) => {
    const payload = {
      name: (draft.customer_name || draft.client_name || '').trim(),
      owner_name: draft.contact_person.trim(),
      phone: draft.contact_phone.trim(),
      type: draft.client_type,
      address: draft.location.trim(),
      territory: user?.territory || '',
      created_by: user?.id || null,
      latitude: draft.latitude ?? null,
      longitude: draft.longitude ?? null,
    }

    if (draft.customer_id) {
      try { await updateCustomer(draft.customer_id, payload) } catch {}
      return draft.customer_id
    }

    try {
      const created = await createCustomer(payload)
      return created?.id || null
    } catch (error) {
      const matches = await searchCustomers(payload.name)
      const exact = (matches || []).find(c => c.name?.trim().toLowerCase() === payload.name.toLowerCase())
      if (exact?.id) {
        try { await updateCustomer(exact.id, payload) } catch {}
        return exact.id
      }
      throw error
    }
  }

  /* -- Status -- */
  const changeStatus = async s => {
    await updateStatus(user.id, s)
    await flushPriorityData().catch(() => {})
    setStatus(s)
    setShowStatusPicker(false)
    toastMsg(`Status → ${s}`)
  }

  const forceCloudJourneySync = async () => {
    if (!user?.id) return
    toastMsg('Syncing journey from cloud...', 'info')
    try {
      const j = await getActiveJourneyCloud(user.id)
      if (j) {
        setJourney(j)
        toastMsg('Journey restored from cloud! ✅')
      } else {
        toastMsg('No active journey found in cloud.', 'info')
      }
    } catch {
      toastMsg('Failed to sync journey from cloud', 'error')
    }
  }

  /* -- Journey -- */
  const handleStartJourney = () => {
    // Open the levelled-up journey mode selector modal
    setShowJourneyModal(true)
  }

  /* -- Profile picture upload -- */
  const handleProfilePicUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    input.onchange = e => {
      const file = e.target.files[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) { toastMsg('Image too large — max 2MB', 'error'); return }
      const reader = new FileReader()
      reader.onload = ev => {
        const dataUrl = ev.target.result
        // Resize to 256x256 using canvas before storing
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 256; canvas.height = 256
          const ctx = canvas.getContext('2d')
          // Center-crop
          const size = Math.min(img.width, img.height)
          const sx = (img.width - size) / 2
          const sy = (img.height - size) / 2
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256)
          const compressed = canvas.toDataURL('image/jpeg', 0.85)
          setProfilePic(compressed)
          try { localStorage.setItem(`dcc_pfp_${user?.id}`, compressed) } catch {}
          toastMsg('Profile photo updated ✅')
        }
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }
  const handleRemoveProfilePic = () => {
    setProfilePic(null)
    try { localStorage.removeItem(`dcc_pfp_${user?.id}`) } catch {}
    toastMsg('Profile photo removed')
  }

  /* Called by JourneyStartModal after user picks mode */
  const handleJourneyLaunch = async (mode, gpsCoords) => {
    setShowJourneyModal(false)
    toastMsg('Starting journey…','info')
    try {
      const fallbackLocation = gpsCoords
        ? getLocationFallback(gpsCoords.lat, gpsCoords.lng)
        : 'Starting Point'
      const j = await startJourney(user.id, fallbackLocation, gpsCoords?.lat, gpsCoords?.lng)
      setJourney(j)
      // Always set to 'On Field' so admin sees manager on the live map
      // The selected mode just describes the type of activity
      const statusToSet = mode === 'On Field' ? 'On Field' : 'On Field'
      await changeStatus(statusToSet)
      await flushPriorityData().catch(() => {})
      toastMsg(`Journey started! 🚀 Status: On Field`)
      setShowMap(true)
      if (gpsCoords) {
        reverseGeo(gpsCoords.lat, gpsCoords.lng)
          .then((resolvedLocation) => {
            if (resolvedLocation && resolvedLocation !== fallbackLocation) {
              setJourney((current) => current?.id === j.id ? { ...current, start_location: resolvedLocation } : current)
            }
          })
          .catch(() => {})
      }
    } catch(e) {
      // If journey already active in cloud, load it into state
      if (e.message === 'Journey already active' && user?.id) {
        try {
          const existing = await getActiveJourneyCloud(user.id)
          if (existing) {
            setJourney(existing)
            await changeStatus('On Field')
            toastMsg('Existing journey resumed! 🗺️')
            setShowMap(true)
            return
          }
        } catch {}
      }
      toastMsg(e.message,'error')
    }
  }
  const handleEndJourney = async () => {
    toastMsg('Getting your location…','info')
    const c = await getGPS()
    const loc = c ? getLocationFallback(c.latitude, c.longitude) : 'End Point'
    try {
      const j = await endJourney(user.id,loc,c?.latitude,c?.longitude)
      await flushPriorityData().catch(() => {})
      setJourney(null); await changeStatus('In-Office'); reload()
      toastMsg(`Journey done · ${j.total_visits} stops · ${j.total_km} km 🎯`)
    } catch(e) { toastMsg(e.message,'error') }
  }

  /* -- Map visit log -- */
  const onVisitLogged = async data => {
    try {
      const draftError = validateVisitDraft({ ...data, customer_name: data.client_name, photo: data.photo })
      if (draftError) { toastMsg(draftError, 'error'); return }
      const customerId = await ensureVisitCustomer({ ...data, customer_name: data.client_name })
      const visit = await createVisit({
        manager_id:user.id,
        visit_date:today,
        journey_id: journey?.id || null,
        customer_id:customerId,
        client_name:data.client_name,
        customer_name:data.client_name,
        client_type:data.client_type,
        location:data.location,
        visit_type:data.visit_type,
        status:'Completed',
        notes:data.notes,
        latitude:data.latitude,
        longitude:data.longitude,
        photo:data.photo,
        voice_note:data.voice_note || null,
      })
      await flushPriorityData().catch(() => {})
      reloadVisits(); toastMsg(`Stop #${todayVisits.length+1} logged ✅`)
    } catch (error) {
      toastMsg(error.message || 'Unable to log visit', 'error')
    }
  }

  /* -- Visit modal submit -- */
  const submitVisit = async () => {
    try {
      const c = await getGPS()
      const now = new Date().toISOString()
      
      // Calculate distance from previous visit or journey start
      const lastVisit = todayVisits[todayVisits.length - 1]
      const prevLat = lastVisit ? lastVisit.latitude : journey?.start_latitude
      const prevLng = lastVisit ? lastVisit.longitude : journey?.start_longitude
      const currLat = c?.latitude || null
      const currLng = c?.longitude || null
      
      const distFromPrev = (prevLat && currLat) ? calcDistanceKm(prevLat, prevLng, currLat, currLng) : 0
      const totalKmCurrent = journeyKm + distFromPrev

      const draft = {
        ...vf,
        latitude: currLat,
        longitude: currLng,
        photo: visitPhoto,
        voice_note: voiceNote,
        check_out_time: now,
        distance_from_prev: distFromPrev,
        km_covered: totalKmCurrent,
      }
      const draftError = validateVisitDraft(draft)
      if (draftError) return toastMsg(draftError,'error')
      
      const customerId = await ensureVisitCustomer(draft)
      const visit = await createVisit({
        manager_id: user.id, 
        visit_date: today,
        journey_id: journey?.id || null,
        customer_id: customerId, 
        client_name: vf.customer_name,
        customer_name: vf.customer_name, 
        client_type: vf.client_type,
        location: vf.location || 'Location Captured', 
        visit_type: vf.interaction_type || 'Field Visit',
        interaction_type: vf.interaction_type,
        status: 'Completed', 
        notes: vf.notes,
        order_value: Number(vf.order_value) || 0,
        payment_collected: Number(vf.payment_collected) || 0,
        latitude: currLat, 
        longitude: currLng,
        photo: visitPhoto || null,
        voice_note: voiceNote || null,
        check_in_time: vf.check_in_time,
        check_out_time: now,
        distance_from_prev: distFromPrev,
        km_covered: totalKmCurrent,
      })
      await flushPriorityData().catch(() => {})

      if (vf.follow_up_date) {
        await createTask({
          manager_id: user.id,
          customer_id: customerId,
          visit_id: visit?.id || null,
          title: `Follow up: ${vf.interaction_type} w/ ${vf.customer_name}`,
          description: vf.follow_up_note?.trim() || vf.notes?.trim() || `Planned after ${vf.interaction_type}`,
          status: 'open',
          priority: 'medium',
          due_at: new Date(`${vf.follow_up_date}T10:00:00`).toISOString(),
          reminder_at: new Date(`${vf.follow_up_date}T09:00:00`).toISOString(),
          created_by: user.id,
          assigned_by: user.id,
        })
      }
      setVisitModal(false)
      setVf(initVF())
      setVisitPhoto(null); setPhotoPreview(null)
      setVoiceNote(null); setVoiceBlob(null)
      reload()
      toastMsg('Visit logged & synced ✅')
    } catch (error) {
      toastMsg(error.message || 'Unable to log visit', 'error')
    }
  }

  /* -- Sales modal -- */
  const submitSales = async () => {
    if (!sf.sales_achievement) return toastMsg('Sales achievement required','error')
    await saveDailySalesReport({ manager_id:user.id, date:today, sales_target:+sf.sales_target||0, sales_achievement:+sf.sales_achievement||0, profit_target:+sf.profit_target||0, profit_achievement:+sf.profit_achievement||0 })
    setSalesModal(false); setSf(initSF()); reloadReports(); toastMsg('Report submitted ✅')
  }
  const salesAchPct = sf.sales_target>0&&sf.sales_achievement>0 ? Math.round((+sf.sales_achievement/+sf.sales_target)*100) : null

  /* -- Product modal -- */
  const submitProduct = async () => {
    if (!pf.brand.trim()||!pf.product_name.trim()) return toastMsg('Brand & product name required','error')
    if (editProd) {
      await updateProductDayEntry(editProd.id,{achieved_qty:+pf.achieved_qty||0, achieved_amount:+pf.achieved_amount||0})
    } else {
      await createProductDayEntry({ manager_id:user.id, date:today, brand:pf.brand, brand_id:pf.brand_id||null, product_name:pf.product_name, product_id:pf.product_id||null, target_qty:+pf.target_qty||0, achieved_qty:+pf.achieved_qty||0, target_amount:+pf.target_amount||0, achieved_amount:+pf.achieved_amount||0 })
    }
    setProductModal(false); setEditProd(null); setPf(initPF()); reloadProducts()
    toastMsg(editProd?'Updated ✅':'Product entry added ✅')
  }
  const openEditProd = p => {
    setEditProd(p)
    setPf({brand:p.brand||'',brand_id:p.brand_id||null,product_name:p.product_name,product_id:p.product_id||null,target_qty:String(p.target_qty),achieved_qty:String(p.achieved_qty),target_amount:String(p.target_amount),achieved_amount:String(p.achieved_amount)})
    setProductModal(true)
  }
  const removeProductEntry = async (id, showToast = true) => {
    await deleteProductDayEntry(id)
    reloadProducts()
    if (showToast) toastMsg('Deleted')
  }
  const prodPct = pf.target_qty>0&&pf.achieved_qty>0 ? Math.round((+pf.achieved_qty/+pf.target_qty)*100) : null
  const handleTaskStatusChange = async (taskId, nextStatus) => {
    const optimisticCompletedAt = nextStatus === 'completed' ? new Date().toISOString() : null
    setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: nextStatus, completed_at: optimisticCompletedAt } : task))
    try {
      await updateTask(taskId, { status: nextStatus, updated_by: user?.id || null })
      reloadTasks()
    } catch (error) {
      reloadTasks()
      toastMsg(error.message || 'Could not update follow-up', 'error')
    }
  }

  /* -- Computed (memoized to avoid re-calc on every render) -- */
  const todayReport   = useMemo(() => reports.find(r=>r.date===today),   [reports, today])
  const todayProducts = useMemo(() => products.filter(p=>p.date===today), [products, today])
  const pastProducts  = useMemo(() => products.filter(p=>p.date!==today), [products, today])
  const activeTasks   = useMemo(() => tasks.filter(task => task.status !== 'completed' && !task.deleted_at), [tasks])
  const latestTarget  = useMemo(() => [...targets].sort((a,b)=>b.year-a.year||b.month-a.month)[0], [targets])
  const visitPct      = useMemo(() => latestTarget?.visit_target ? Math.min((todayVisits.length/latestTarget.visit_target)*100,100) : 0, [todayVisits.length, latestTarget])
  const salesPct      = useMemo(() => latestTarget?.sales_target&&todayReport ? Math.min((todayReport.sales_achievement/latestTarget.sales_target)*100,100) : 0, [todayReport, latestTarget])
  const sm            = STATUS_META[status]||STATUS_META['In-Office']
  const journeyKm     = useMemo(() => todayVisits.reduce((sum,v,i)=>{
    const pl=i===0?journey?.start_latitude:todayVisits[i-1]?.latitude
    const pn=i===0?journey?.start_longitude:todayVisits[i-1]?.longitude
    return sum+(pl&&v.latitude?calcDistanceKm(pl,pn,v.latitude,v.longitude):0)
  }, 0), [todayVisits, journey])

  /* -- Visitor stat chip -- */
  const StatusChip = ({s}) => {
    const cls = s==='Completed'?'vs-completed':s==='Pending'?'vs-pending':'vs-not-visited'
    return <span className={`visit-status-chip ${cls}`}>{s}</span>
  }


  return (
    <div className="mgr-app">
      {/* ── Motivational Intro Screen (shown once per day) ── */}
      {showIntro && (
        <MotivationalIntro
          user={user}
          onComplete={() => {
            const today = new Date().toISOString().split('T')[0]
            localStorage.setItem('dcc_intro_date', today)
            setShowIntro(false)
          }}
        />
      )}

      {/* -- Header -- */}
      <header className="mgr-header">
        <div className="mgr-hdr-top">
          <div className="mgr-user">
            {tab !== 'home' && (
              <button className="back-btn" onClick={() => setTab('home')} style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#F3F4F6', color: '#4B5563', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
            <div className="mgr-avatar mgr-avatar-logo" onClick={()=>setTab('profile')} style={{cursor:'pointer'}}>
              {profilePic
                ? <img src={profilePic} alt="Profile" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}}/>
                : <img src={dccLogo} alt="DCC" className="mgr-logo-img"/>
              }
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
                  applyCustomerToVisitForm(c)
                  setVisitModal(true); setNearbyCustomers([])
                }}>Log Visit</button>
              </div>
            ))}
          </div>
          <button className="nb-dismiss" onClick={()=>setNearbyCustomers([])}>Dismiss</button>
        </div>
      )}

      {/* -- Main -- */}
      <main className="mgr-main" ref={mainRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Pull to refresh indicator */}
        {isRefreshing && (
          <div style={{ display:'flex', justifyContent:'center', padding:'12px', background:'#EFF6FF', color:'#3B82F6', fontSize:'0.85rem', fontWeight:600, alignItems:'center', gap:'8px', borderRadius:'0 0 12px 12px', marginBottom:'16px', boxShadow:'inset 0 -1px 3px rgba(0,0,0,0.05)' }}>
            <svg className="jlp-pulse" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation:'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M22 3v5h-5"/></svg>
            Refreshing data...
          </div>
        )}

        {/* ---- HOME ---- */}
        {tab==='home' && (
          <div className="tab-pane">

            {/* Journey Hero — Enhanced */}
            <div className={`journey-hero${journey?' journey-live':''}`}>
              <div className="jh-body">
                <div className="jh-top-row">
                  {journey ? (
                    <div className="jh-badge-active">
                      <span className="jh-badge-dot"/>
                      Live · {sm.icon} {status}
                    </div>
                  ) : (
                    <div className="jh-badge-idle">⭕ No Active Journey</div>
                  )}
                  {journey && (
                    <div style={{fontSize:'0.65rem',color:'var(--text-3)',fontWeight:600,fontFamily:'var(--font-mono)'}}>
                      {fmtTime(journey.start_time)} started
                    </div>
                  )}
                </div>

                <div className="jh-title">
                  {journey ? 'Field Route Tracking' : '🌅 Ready to Conquer Today?'}
                </div>
                <div className="jh-sub">
                  {journey
                    ? `📍 ${journey.start_location?.split(',')[0]} · ${calcElapsed(journey.start_time)} elapsed`
                    : 'Tap below to begin — choose your mode and let GPS do the rest.'}
                </div>

                {journey && (
                  <div className="jh-metrics">
                    <div className="jh-metric">
                      <span className="jh-metric-val">{todayVisits.length}</span>
                      <span className="jh-metric-lbl">Stops</span>
                    </div>
                    <div className="jh-metric">
                      <span className="jh-metric-val">{journeyKm.toFixed(1)}</span>
                      <span className="jh-metric-lbl">km</span>
                    </div>
                    <div className="jh-metric">
                      <span className="jh-metric-val">{calcElapsed(journey.start_time)}</span>
                      <span className="jh-metric-lbl">Duration</span>
                    </div>
                  </div>
                )}

                <div className="jh-actions" style={{marginTop:14}}>
                  {journey ? (
                    <>
                      <button className="jh-btn-map" onClick={()=>setShowMap(true)}>🗺️ Map</button>
                      <button className="jh-btn-end" onClick={handleEndJourney}>🏁 End Journey</button>
                    </>
                  ) : (
                    <button className="jh-btn-start" onClick={handleStartJourney}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <polygon points="2,1 12,6.5 2,12" fill="currentColor"/>
                      </svg>
                      Start Today's Journey
                      <span className="jh-mode-badge">Choose Mode</span>
                    </button>
                  )}
                </div>
              </div>
              {journey && (
                <div className="jh-progress">
                  <div className="jh-prog-fill" style={{width:`${visitPct}%`}}/>
                </div>
              )}
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
              {/* Visits card */}
              <div className="kpi-card">
                <div className="kpi-top">
                  <div className="kpi-ico" style={{background:'#ECFDF5'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                      <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                  </div>
                  <span className="kpi-badge" style={{background:'#ECFDF5',color:'#059669'}}>{latestTarget?.visit_target?`${Math.round(visitPct)}%`:'Today'}</span>
                </div>
                <div className="kpi-val">{todayVisits.length}</div>
                <div className="kpi-lbl">Client Visits</div>
                <div className="kpi-bar"><div className="kpi-fill" style={{width:`${visitPct}%`,background:'#10B981'}}/></div>
                <div className="kpi-foot">Target: {latestTarget?.visit_target||'Not set'}</div>
              </div>
              {/* Sales card */}
              <div className="kpi-card">
                <div className="kpi-top">
                  <div className="kpi-ico" style={{background:'#EFF6FF'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                    </svg>
                  </div>
                  <span className="kpi-badge" style={{background:'#EFF6FF',color:salesPct>=100?'#059669':'#2563EB'}}>
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
                  {/* Distance card */}
                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="kpi-ico" style={{background:'#F5F3FF'}}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/>
                          <path d="M8 12h8M5 9V6a1 1 0 011-1h12a1 1 0 011 1v3M5 15v3a1 1 0 001 1h12a1 1 0 001-1v-3"/>
                        </svg>
                      </div>
                      <span className="kpi-badge" style={{background:'#F5F3FF',color:'#7C3AED'}}>km</span>
                    </div>
                    <div className="kpi-val">{journeyKm.toFixed(1)}</div>
                    <div className="kpi-lbl">Distance Covered</div>
                    <div className="kpi-bar"><div className="kpi-fill" style={{width:'60%',background:'#7C3AED'}}/></div>
                    <div className="kpi-foot">Est. drive: {calcTravelTime(journeyKm)}</div>
                  </div>
                  {/* Duration card */}
                  <div className="kpi-card">
                    <div className="kpi-top">
                      <div className="kpi-ico" style={{background:'#FFFBEB'}}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                      </div>
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

            {/* Unified Visit Logging Flow */}
            <div className="unified-action-panel">
              <div className="section-row"><span className="section-label">Field Operations</span></div>
              <div className="uap-main">
                <button className="uap-primary-btn" onClick={()=>{setVf(initVF());setVisitModal(true)}}>
                  <div className="uap-btn-ico">📍</div>
                  <div className="uap-btn-body">
                    <div className="uap-btn-title">Log New Visit</div>
                    <div className="uap-btn-desc">Mandatory structured interaction log</div>
                  </div>
                  <div className="uap-btn-arrow">❯</div>
                </button>
                <div className="uap-secondary-row">
                   <button className="uap-sec-btn" onClick={()=>setShowMap(true)}>
                     <div className="uap-sec-ico" style={{background:'#EFF6FF'}}>🗺️</div>
                     <span className="uap-sec-lbl">Live Map</span>
                   </button>
                   <button className="uap-sec-btn" onClick={()=>{setSf(initSF());setSalesModal(true)}}>
                     <div className="uap-sec-ico" style={{background:'#FFFBEB'}}>📊</div>
                     <span className="uap-sec-lbl">Sales Report</span>
                   </button>
                   <button className="uap-sec-btn" onClick={()=>{setEditProd(null);setPf(initPF());setProductModal(true)}}>
                     <div className="uap-sec-ico" style={{background:'#F5F3FF'}}>📦</div>
                     <span className="uap-sec-lbl">Products</span>
                   </button>
                   <button className="uap-sec-btn" onClick={()=>setShowInvoiceModal(true)}>
                     <div className="uap-sec-ico" style={{background:'#DCFCE7'}}>📄</div>
                     <span className="uap-sec-lbl">Quotation</span>
                   </button>
                </div>
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

            {/* Today's Structured Timeline */}
            {todayVisits.length > 0 && (
              <div className="timeline-container">
                <div className="section-row">
                  <span className="section-label">Visit Timeline ({todayVisits.length})</span>
                  <button className="section-link" onClick={()=>setShowMap(true)}>🗺️ Route</button>
                </div>
                <div className="timeline">
                  {todayVisits.map((v, i) => {
                    const icon = INTERACTION_ICONS[v.interaction_type] || '📍'
                    const hasValue = (v.order_value > 0 || v.payment_collected > 0)
                    return (
                      <div key={v.id} className="timeline-item">
                        <div className="timeline-dot" style={{borderColor: STOP_COLORS[i % STOP_COLORS.length]}} />
                        <div className="timeline-body">
                          <div className="timeline-hdr">
                            <div className="timeline-title">{v.client_name || v.customer_name}</div>
                            <div className="timeline-time">{fmtTime(v.check_in_time || v.created_at)}</div>
                          </div>
                          <div className="timeline-meta">
                            <span className="timeline-badge" style={{background:'#EFF6FF', color:'#2563EB'}}>{icon} {v.interaction_type || 'Field Visit'}</span>
                            <span className="timeline-badge" style={{background:'#F3F4F6', color:'#6B7280'}}>{v.client_type}</span>
                          </div>
                          {v.notes && <div className="timeline-notes">{v.notes}</div>}
                          
                          {(hasValue || v.distance_from_prev > 0) && (
                            <div className="timeline-stats">
                              {v.order_value > 0 && <div className="timeline-stat">📦 <b>{fmt(v.order_value)}</b></div>}
                              {v.payment_collected > 0 && <div className="timeline-stat">💰 <b>{fmt(v.payment_collected)}</b></div>}
                              {v.distance_from_prev > 0 && <div className="timeline-stat">🛣️ <b>{v.distance_from_prev.toFixed(1)} km</b></div>}
                            </div>
                          )}

                          <div style={{display:'flex', justifyContent:'flex-end', marginTop: 10, gap: 10}}>
                             <button onClick={()=>shareVisitOnWhatsApp(v)} style={{background:'#DCFCE7', border:'none', borderRadius:6, padding:'4px 8px', fontSize:'0.7rem', color:'#059669', fontWeight:700}}>WhatsApp ↗</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {journeyKm > 0 && (
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
              <div style={{display:'flex', gap: 6}}>
                <button className="btn-add" onClick={()=>{setVf(initVF());setVisitModal(true)}}>+ New Visit</button>
              </div>
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
                          <button className="pc-btn pc-btn-del" onClick={()=>{removeProductEntry(p.id)}}>🗑️</button>
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
                        <button className="pc-btn pc-btn-del" onClick={()=>{removeProductEntry(p.id, false)}}>🗑️</button>
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
            {activeTasks.length > 0 && (
              <div className="cust-followup-panel">
                <div className="cust-followup-head">
                  <span className="cust-followup-title">Open Follow-ups</span>
                  <span className="cust-followup-chip">{activeTasks.length}</span>
                </div>
                <div className="cust-followup-list">
                  {activeTasks.slice(0, 4).map(task => (
                    <div key={task.id} className="cust-followup-item">
                      <div className="cust-followup-item-body">
                        <div className="cust-followup-item-title">{task.title}</div>
                        <div className="cust-followup-item-meta">
                          {task.due_at
                            ? `Due ${new Date(task.due_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}`
                            : 'No due date'}
                        </div>
                      </div>
                      <button className="cust-followup-done" onClick={()=>handleTaskStatusChange(task.id, 'completed')}>
                        Done
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {customers.length===0
              ? <div className="empty"><div className="empty-ico">🏪</div><div className="empty-txt">No customers yet.</div><button className="empty-cta" onClick={()=>setShowAddCustomer(true)}>Add First Customer</button></div>
              : customers.filter(c=>{
                  const needle = customerFilter.toLowerCase()
                  if (!needle) return true
                  const customerName = String(c?.name || '').toLowerCase()
                  const ownerName = String(c?.owner_name || '').toLowerCase()
                  return customerName.includes(needle) || ownerName.includes(needle)
                }).map(c=>(
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
                      applyCustomerToVisitForm(c)
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
            {/* ── Profile Hero with photo upload ── */}
            <div className="profile-hero">
              {/* Avatar with camera overlay */}
              <div className="ph-avatar-wrap">
                {profilePic
                  ? <img src={profilePic} alt="Profile" className="ph-avatar-img"/>
                  : <div className="ph-avatar ph-avatar-initials">{user?.full_name?.[0]?.toUpperCase()}</div>
                }
                {/* Camera upload button */}
                <button className="ph-camera-btn" onClick={handleProfilePicUpload} title="Change photo">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>
              </div>
              <div className="ph-name">{user?.full_name}</div>
              <div className="ph-role">Sales Manager</div>
              <div className="ph-username">@{user?.username}</div>
              {/* Photo action buttons */}
              <div className="ph-photo-actions">
                <button className="ph-photo-btn ph-photo-upload" onClick={handleProfilePicUpload}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  {profilePic ? 'Change Photo' : 'Add Photo'}
                </button>
                {profilePic && (
                  <button className="ph-photo-btn ph-photo-remove" onClick={handleRemoveProfilePic}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                    Remove
                  </button>
                )}
              </div>
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
                    <div style={{fontWeight:700,fontSize:'0.85rem',color:'#111827'}}>🧾 Proforma Invoice / Quote</div>
                    <div style={{fontSize:'0.72rem',color:'#9CA3AF',marginTop:2}}>Create & share via WhatsApp or PDF</div>
                  </div>
                  <button onClick={()=>setShowInvoiceModal(true)}
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
                      {isOnline ? `Last synced at ${syncLabel}` : `${offlineQueue.length} actions queued for sync`}
                    </div>
                    <div style={{fontSize:'0.68rem',color:'#6B7280',marginTop:4}}>
                      Status: {manualSyncing ? 'manual sync running' : syncStatus} · Pending: {pendingSyncCount}
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <button onClick={syncNow} disabled={manualSyncing} style={{background:'#EFF6FF',color:'#2563EB',border:'1px solid #BFDBFE',borderRadius:8,padding:'7px 12px',fontWeight:700,fontSize:'0.72rem',cursor:manualSyncing?'not-allowed':'pointer'}}>
                      {manualSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <span style={{
                      background:isOnline?'#ECFDF5':'#FEF2F2',
                      color:isOnline?'#059669':'#DC2626',
                      fontWeight:700,fontSize:'0.65rem',padding:'3px 8px',borderRadius:20
                    }}>{isOnline?'SYNCED':'OFFLINE'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* -- Tab Bar -- */}
      <nav className="tab-bar">
        {[
          {id:'home',lbl:'Home',ico:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>},
          {id:'visits',lbl:'Visits',ico:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>},
          {id:'customers',lbl:'Customers',ico:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>},
          {id:'reports',lbl:'Reports',ico:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>},
          {id:'products',lbl:'Products',ico:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>},
          {id:'profile',lbl:'Profile',ico:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
        ].map(t=>(
          <button key={t.id} className={`tab-btn ${tab===t.id?'tab-active':''}`} onClick={()=>setTab(t.id)}>
            <div className="tab-ico-bg">{t.ico}</div>
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
          onVisitLogged={onVisitLogged} onClose={()=>{setShowMap(false);reload()}} onRefresh={forceCloudJourneySync}/>
      )}

      {/* ---- VISIT MODAL — Protected Workflow ---- */}
      {visitModal && (
        <div className="modal-overlay" onClick={()=>{if(!vf.notes.trim()) { toastMsg('Please save notes before closing','info'); return } setVisitModal(false)}}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">📍 Structured Visit Log</div>
              <button className="modal-close" onClick={()=>setVisitModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-note">🔍 Mandatory Log: Auto-capturing GPS & Time for compliance.</div>

              {/* -- Customer Choice -- */}
              <div className="fg">
                <label>Target Customer *</label>
                <AutocompleteInput
                  value={vf.customer_name}
                  onChange={handleVisitCustomerChange}
                  onSelect={c => c && applyCustomerToVisitForm(c)}
                  placeholder="Select customer from list…"
                  searchFn={smartSearchCustomers}
                  recentsFn={getRecentCustomers}
                  renderItem={c => <span className="ac-item-name">{c.name}</span>}
                  renderMeta={c => <span className="ac-type-tag">{c.type}</span>}
                  addNewLabel="+ Add New Customer"
                  onAddNew={()=>setAddCustomerModal(true)}
                  autoFocus
                />
              </div>

              {/* -- Key Mandatory Fields -- */}
              <div className="fg">
                <label>Interaction Type *</label>
                <select value={vf.interaction_type} onChange={e=>setVf(p=>({...p,interaction_type:e.target.value}))}>
                  {INTERACTION_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="fg">
                <label>Visit Notes / Outcome *</label>
                <textarea 
                  value={vf.notes} 
                  onChange={e=>setVf(p=>({...p,notes:e.target.value}))} 
                  placeholder="Mandatory: What happened during the visit?" 
                  rows={4}
                  style={{border: !vf.notes.trim() ? '1.5px solid #FCA5A5' : ''}}
                />
              </div>

              {/* -- Optional Value Capture -- */}
              <div className="row-2">
                <div className="fg">
                  <label>Order Value (₹)</label>
                  <input type="number" value={vf.order_value} onChange={e=>setVf(p=>({...p,order_value:e.target.value}))} placeholder="0"/>
                </div>
                <div className="fg">
                  <label>Payment Collected (₹)</label>
                  <input type="number" value={vf.payment_collected} onChange={e=>setVf(p=>({...p,payment_collected:e.target.value}))} placeholder="0"/>
                </div>
              </div>

              <div className="modal-section-lbl">Client Contact Info</div>
              <div className="row-2">
                <div className="fg">
                  <label>Person</label>
                  <input value={vf.contact_person} onChange={e=>setVf(p=>({...p,contact_person:e.target.value}))} placeholder="Name"/>
                </div>
                <div className="fg">
                  <label>Phone</label>
                  <input value={vf.contact_phone} onChange={e=>setVf(p=>({...p,contact_phone:e.target.value}))} placeholder="Number"/>
                </div>
              </div>

              <div className="fg">
                <label>Planned Follow-up</label>
                <div className="row-2">
                  <input type="date" value={vf.follow_up_date} min={today} onChange={e=>setVf(p=>({...p,follow_up_date:e.target.value}))}/>
                  <input value={vf.follow_up_note} onChange={e=>setVf(p=>({...p,follow_up_note:e.target.value}))} placeholder="Follow-up note…"/>
                </div>
              </div>

              {/* -- Visual Evidence -- */}
              <div className="row-2">
                <div className="fg">
                  <label>Visit Photo *</label>
                  {photoPreview ? (
                    <div style={{position:'relative',borderRadius:10,overflow:'hidden',border:'1.5px solid #E5E7EB'}}>
                      <img src={photoPreview} alt="Visit" style={{width:'100%',height:100,objectFit:'cover'}}/>
                      <button onClick={()=>{setVisitPhoto(null);setPhotoPreview(null)}}
                        style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,0.6)',border:'none',borderRadius:'50%',width:22,height:22,color:'#fff'}}>✕</button>
                    </div>
                  ) : (
                    <button onClick={capturePhotoCompressed} className="mgr-icon-btn" style={{width:'100%',height:100,flexDirection:'column',gap:4,borderRadius:10}}>
                      <span style={{fontSize:'1.4rem'}}>📷</span>
                      <span style={{fontSize:'0.65rem',fontWeight:700}}>Capture</span>
                    </button>
                  )}
                </div>
                <div className="fg">
                  <label>Voice Note</label>
                  {voiceNote ? (
                    <div style={{height:100,display:'flex',flexDirection:'column',justifyContent:'center',gap:6,padding:10,background:'#F0FDF4',borderRadius:10,border:'1px solid #6EE7B7'}}>
                       <audio src={voiceNote} controls style={{width:'100%',height:24}}/>
                       <button onClick={clearVoiceNote} style={{fontSize:'0.65rem',color:'#059669',background:'none',border:'none',textDecoration:'underline'}}>Remove</button>
                    </div>
                  ) : (
                    <button onClick={isRecording?stopRecording:startRecording} className="mgr-icon-btn" 
                       style={{width:'100%',height:100,flexDirection:'column',gap:4,borderRadius:10, background: isRecording ? '#FEF2F2' : ''}}>
                      <span style={{fontSize:'1.4rem', animation: isRecording ? 'pulse 1s infinite' : 'none'}}>{isRecording?'⏹️':'🎤'}</span>
                      <span style={{fontSize:'0.65rem',fontWeight:700}}>{isRecording?`${recordingTime}s`:'Record'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="modal-info-box" style={{background:'#F9FAFB', borderColor:'#E5E7EB'}}>
                <div style={{fontSize:'0.75rem', color:'#6B7280', display:'flex', flexDirection:'column', gap:2}}>
                  <span>📍 GPS: {vf.latitude||'Auto-capturing'}...</span>
                  <span>⏰ Start: {fmtTime(vf.check_in_time)}</span>
                </div>
              </div>

            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={()=>setVisitModal(false)}>Discard</button>
              <button className="btn-submit" onClick={submitVisit}>Log Stop & Sync</button>
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
          onCreated={c => { setVf(p=>({...p,customer_name:c.name,customer_id:c.id,client_type:c.type,location:c.address||p.location,contact_person:c.owner_name||p.contact_person,contact_phone:c.phone||p.contact_phone})); toastMsg(`Customer "${c.name}" added ✅`) }}
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
      {/* ── Journey Start Modal ── */}
      {showJourneyModal && (
        <JourneyStartModal
          currentStatus={status}
          onStart={handleJourneyLaunch}
          onClose={() => setShowJourneyModal(false)}
        />
      )}

      {/* ── Proforma Invoice / Quotation Modal ── */}
      {showInvoiceModal && (
        <ProformaInvoice
          user={user}
          customers={customers}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}

      {showAddCustomer && (
        <AddCustomerModal
          createdBy={user?.id}
          onCreated={c => { reloadCustomers(); toastMsg(`✅ "${c.name}" added with GPS location`) }}
          onClose={()=>setShowAddCustomer(false)}
        />
      )}
    </div>
  )
}

// Tiny helper used in JSX (avoids undefined in style)
const var_pl = '#EFF6FF'

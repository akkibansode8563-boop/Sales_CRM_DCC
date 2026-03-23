import { useState, useEffect, useRef, useCallback, memo } from 'react'

const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#8B5CF6','#84CC16']
const STATUS_META = {
  'On Field':       { color:'#10B981', bg:'#ECFDF5', dot:'#10B981' },
  'In-Office':      { color:'#2563EB', bg:'#EFF6FF', dot:'#2563EB' },
  'Travel':         { color:'#7C3AED', bg:'#F5F3FF', dot:'#7C3AED' },
  'Lunch Break':    { color:'#F59E0B', bg:'#FFFBEB', dot:'#F59E0B' },
  'Meeting':        { color:'#EC4899', bg:'#FDF2F8', dot:'#EC4899' },
  'Work From Home': { color:'#6B7280', bg:'#F3F4F6', dot:'#6B7280' },
}
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '--'
const fmtAgo  = iso => {
  if (!iso) return 'Never'
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60)  return s + 's ago'
  if (s < 3600) return Math.floor(s/60) + 'm ago'
  return Math.floor(s/3600) + 'h ago'
}

/* ── Reverse geocode via Nominatim ── */
const geoCache = {}
async function reverseGeo(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (geoCache[key]) return geoCache[key]
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
      { headers: { 'Accept-Language': 'en' } })
    const d = await r.json()
    const addr = d.address
    const parts = [addr.road||addr.pedestrian||addr.suburb, addr.suburb||addr.neighbourhood||addr.city_district, addr.city||addr.town||addr.village].filter(Boolean)
    const label = parts.slice(0,2).join(', ') || d.display_name?.split(',').slice(0,2).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    geoCache[key] = label
    return label
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
}

/* ── Map sub-component ── */
const LiveMap = memo(function LiveMap({ managers, selectedId, onSelectManager }) {
  const mapRef        = useRef(null)
  const mapInstance   = useRef(null)
  const markersRef    = useRef({})
  const pathsRef      = useRef({})
  const initDone      = useRef(false)

  /* Init map once */
  useEffect(() => {
    if (initDone.current || !mapRef.current) return
    initDone.current = true
    import('leaflet').then(L => {
      delete L.Icon.Default.prototype._getIconUrl
      const map = L.map(mapRef.current, {
        center: [19.076, 72.8777], zoom: 12,
        zoomControl: true, scrollWheelZoom: true
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19
      }).addTo(map)
      mapInstance.current = { map, L }
    })
    return () => {
      if (mapInstance.current?.map) { mapInstance.current.map.remove(); mapInstance.current = null }
    }
  }, [])

  /* Update markers whenever managers change */
  useEffect(() => {
    if (!mapInstance.current) return
    const { map, L } = mapInstance.current
    const seen = new Set()

    managers.forEach((m, idx) => {
      const gps = m.last_gps
      if (!gps?.lat || !gps?.lng) return
      const lat = parseFloat(gps.lat), lng = parseFloat(gps.lng)
      if (isNaN(lat) || isNaN(lng)) return

      seen.add(m.id)
      const sm     = STATUS_META[m.status] || STATUS_META['In-Office']
      const color  = AVATAR_COLORS[idx % AVATAR_COLORS.length]
      const isSelected = m.id === selectedId
      const pulse  = m.active_journey ? `<span style="position:absolute;top:-3px;right:-3px;width:11px;height:11px;background:#10B981;border-radius:50%;border:2px solid #fff;animation:livepulse 1.2s infinite;"></span>` : ''
      const ring   = isSelected ? `box-shadow:0 0 0 4px ${color}55,0 4px 16px rgba(0,0,0,0.3);` : 'box-shadow:0 2px 8px rgba(0,0,0,0.25);'
      const size   = isSelected ? 46 : 38

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;${ring}display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${isSelected?16:13}px;position:relative;cursor:pointer;transition:all 0.2s;">${(m.name||'?')[0].toUpperCase()}${pulse}</div>`,
        iconSize: [size, size], iconAnchor: [size/2, size], popupAnchor: [0, -size]
      })

      const popupHtml = `
        <div style="min-width:200px;font-family:system-ui,sans-serif;padding:2px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="width:32px;height:32px;border-radius:50%;background:${color};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${(m.name||'?')[0]}</div>
            <div>
              <div style="font-weight:800;font-size:0.9rem;color:#111827">${m.name}</div>
              <div style="font-size:0.7rem;color:#6B7280">${m.territory||'No territory'}</div>
            </div>
          </div>
          <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:0.68rem;font-weight:700;background:${sm.bg};color:${sm.color};margin-bottom:8px">
            <span style="width:6px;height:6px;border-radius:50%;background:${sm.dot};display:inline-block"></span>${m.status}
          </div>
          <div style="font-size:0.72rem;color:#374151;background:#F9FAFB;padding:8px;border-radius:6px">
            <div>📍 <strong>GPS:</strong> ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
            <div>🕐 <strong>Updated:</strong> ${fmtTime(gps.time)}</div>
            <div>👣 <strong>Visits today:</strong> ${m.visits_today||0}</div>
            <div>💰 <strong>Sales:</strong> ₹${Number(m.today_sales||0).toLocaleString('en-IN')}</div>
            ${m.active_journey ? '<div style="margin-top:4px;color:#10B981;font-weight:700">🟢 Journey Active</div>' : ''}
          </div>
        </div>`

      if (markersRef.current[m.id]) {
        markersRef.current[m.id].setLatLng([lat, lng]).setIcon(icon).setPopupContent(popupHtml)
      } else {
        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 240 })
          .on('click', () => onSelectManager(m.id))
        markersRef.current[m.id] = marker
      }

      // Draw GPS trail for selected manager
      if (m.id === selectedId && m.gps_trail?.length > 1) {
        if (pathsRef.current[m.id]) pathsRef.current[m.id].remove()
        const pts = m.gps_trail.map(p => [p.lat, p.lng])
        pathsRef.current[m.id] = L.polyline(pts, {
          color: color, weight: 3, opacity: 0.65, dashArray: '6,4'
        }).addTo(map)
      } else if (pathsRef.current[m.id] && m.id !== selectedId) {
        pathsRef.current[m.id].remove()
        delete pathsRef.current[m.id]
      }
    })

    // Remove markers for managers no longer in list
    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(Number(id))) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })
  }, [managers, selectedId, onSelectManager])

  /* Pan to selected manager */
  useEffect(() => {
    if (!mapInstance.current || !selectedId) return
    const m = managers.find(x => x.id === selectedId)
    if (!m?.last_gps?.lat) return
    mapInstance.current.map.flyTo(
      [parseFloat(m.last_gps.lat), parseFloat(m.last_gps.lng)],
      15, { animate: true, duration: 0.8 }
    )
    markersRef.current[selectedId]?.openPopup()
  }, [selectedId, managers])

  return (
    <div style={{position:'relative',height:'100%'}}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
      <style>{`
        @keyframes livepulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:0.6}}
        .leaflet-popup-content-wrapper{border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,0.15)!important}
        .leaflet-popup-content{margin:12px!important}
      `}</style>
      <div ref={mapRef} style={{width:'100%',height:'100%',borderRadius:'0 0 0 12px'}}/>
      {managers.filter(m=>m.last_gps?.lat).length === 0 && (
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,background:'rgba(249,250,251,0.92)',borderRadius:12,zIndex:10}}>
          <div style={{fontSize:'2.5rem'}}>🛰️</div>
          <div style={{fontWeight:800,fontSize:'0.95rem',color:'#374151'}}>No GPS data yet</div>
          <div style={{fontSize:'0.78rem',color:'#9CA3AF',textAlign:'center',maxWidth:220}}>Managers appear on map when they start a journey or log a visit with GPS enabled</div>
        </div>
      )}
    </div>
  )
})

/* ── Manager sidebar card ── */
function ManagerCard({ m, idx, isSelected, onClick, address }) {
  const sm = STATUS_META[m.status] || STATUS_META['In-Office']
  const hasGPS = !!m.last_gps?.lat
  return (
    <div onClick={onClick} style={{
      padding:'12px 14px', cursor:'pointer', borderBottom:'1px solid #F3F4F6',
      background: isSelected ? '#EFF6FF' : 'transparent',
      borderLeft: isSelected ? '3px solid #2563EB' : '3px solid transparent',
      transition:'all 0.15s'
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:36,height:36,borderRadius:10,background:AVATAR_COLORS[idx%AVATAR_COLORS.length],color:'#fff',fontWeight:800,fontSize:'0.9rem',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,position:'relative'}}>
          {(m.name||'?')[0]}
          {m.active_journey && <span style={{position:'absolute',top:-2,right:-2,width:9,height:9,background:'#10B981',borderRadius:'50%',border:'2px solid #fff'}}/>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:'0.83rem',color:'#111827',display:'flex',alignItems:'center',gap:6}}>
            {m.name}
            {hasGPS && <span style={{fontSize:'0.6rem',background:'#ECFDF5',color:'#059669',padding:'1px 5px',borderRadius:99,fontWeight:700}}>GPS</span>}
          </div>
          <div style={{fontSize:'0.68rem',color:'#9CA3AF',marginTop:1}}>{m.territory||'No territory'}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:99,background:sm.bg,color:sm.color,fontSize:'0.63rem',fontWeight:700,flexShrink:0}}>
          <span style={{width:5,height:5,borderRadius:'50%',background:sm.dot,display:'inline-block'}}/>
          {m.status}
        </div>
      </div>

      {isSelected && (
        <div style={{marginTop:10,padding:'8px 10px',background:'#fff',borderRadius:8,border:'1px solid #E5E7EB'}}>
          {hasGPS ? (
            <>
              <div style={{fontSize:'0.7rem',color:'#374151',marginBottom:4,display:'flex',alignItems:'flex-start',gap:5}}>
                <span>📍</span>
                <span style={{flex:1}}>{address || `${m.last_gps.lat.toFixed(5)}, ${m.last_gps.lng.toFixed(5)}`}</span>
              </div>
              <div style={{fontSize:'0.68rem',color:'#9CA3AF',display:'flex',gap:12}}>
                <span>🕐 {fmtTime(m.last_gps.time)}</span>
                <span style={{color:Date.now()-new Date(m.last_gps.time)<120000?'#10B981':'#F59E0B'}}>⏱ {fmtAgo(m.last_gps.time)}</span>
              </div>
              {m.last_gps.speed > 0 && <div style={{fontSize:'0.68rem',color:'#6B7280',marginTop:2}}>🚗 {m.last_gps.speed.toFixed(1)} km/h</div>}
            </>
          ) : (
            <div style={{fontSize:'0.72rem',color:'#9CA3AF',display:'flex',alignItems:'center',gap:5}}>
              <span>⚫</span> No GPS data — waiting for journey or visit
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:8}}>
            <div style={{background:'#F9FAFB',borderRadius:6,padding:'5px 8px',textAlign:'center'}}>
              <div style={{fontWeight:700,fontSize:'0.9rem',color:'#111827'}}>{m.visits_today||0}</div>
              <div style={{fontSize:'0.58rem',color:'#9CA3AF',fontWeight:600}}>VISITS</div>
            </div>
            <div style={{background:'#F9FAFB',borderRadius:6,padding:'5px 8px',textAlign:'center'}}>
              <div style={{fontWeight:700,fontSize:'0.72rem',color:'#2563EB'}}>₹{Number(m.today_sales||0).toLocaleString('en-IN')}</div>
              <div style={{fontSize:'0.58rem',color:'#9CA3AF',fontWeight:600}}>SALES</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main export ── */
export default function LiveLocationMonitor({ managers = [], salesManagers = [], onRefresh }) {
  const [selectedId,    setSelectedId]    = useState(null)
  const [filterMgr,     setFilterMgr]     = useState('all')   // 'all' or manager id
  const [autoRefresh,   setAutoRefresh]   = useState(true)
  const [countdown,     setCountdown]     = useState(30)
  const [addresses,     setAddresses]     = useState({})       // id -> address string
  const [lastRefresh,   setLastRefresh]   = useState(new Date())
  const timerRef = useRef(null)

  /* Auto-refresh every 30s */
  useEffect(() => {
    if (!autoRefresh) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { onRefresh?.(); setLastRefresh(new Date()); return 30 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [autoRefresh, onRefresh])

  /* Fetch addresses for managers with GPS */
  useEffect(() => {
    managers.forEach(m => {
      if (!m.last_gps?.lat || addresses[m.id]) return
      reverseGeo(m.last_gps.lat, m.last_gps.lng).then(addr => {
        setAddresses(prev => ({ ...prev, [m.id]: addr }))
      })
    })
  }, [managers])

  /* Filter managers */
  const displayManagers = filterMgr === 'all'
    ? managers
    : managers.filter(m => m.id === Number(filterMgr))

  const gpsCount    = managers.filter(m => m.last_gps?.lat).length
  const activeCount = managers.filter(m => m.active_journey).length
  const selectedMgr = managers.find(m => m.id === selectedId)
  const selectedIdx = managers.findIndex(m => m.id === selectedId)

  const handleManualRefresh = () => {
    onRefresh?.()
    setLastRefresh(new Date())
    setCountdown(30)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>

      {/* ── Top controls bar ── */}
      <div style={{padding:'12px 16px',background:'#fff',borderBottom:'1px solid #E5E7EB',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>

        {/* Status chips */}
        <div style={{display:'flex',gap:6,flex:1}}>
          <span style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:99,background:'#ECFDF5',color:'#059669',fontSize:'0.72rem',fontWeight:700}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:'#10B981',display:'inline-block',animation:'livepulse 1.2s infinite'}}/>
            {activeCount} Active Journey{activeCount!==1?'s':''}
          </span>
          <span style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:99,background:'#EFF6FF',color:'#2563EB',fontSize:'0.72rem',fontWeight:700}}>
            🛰️ {gpsCount} GPS Signal{gpsCount!==1?'s':''}
          </span>
          <span style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:99,background:'#F5F3FF',color:'#7C3AED',fontSize:'0.72rem',fontWeight:700}}>
            👥 {managers.length} Manager{managers.length!==1?'s':''}
          </span>
        </div>

        {/* Manager filter */}
        <select value={filterMgr} onChange={e=>{setFilterMgr(e.target.value); setSelectedId(e.target.value==='all'?null:Number(e.target.value))}}
          style={{padding:'5px 10px',borderRadius:8,border:'1.5px solid #E5E7EB',fontSize:'0.78rem',fontWeight:600,color:'#374151',background:'#F9FAFB',cursor:'pointer'}}>
          <option value="all">All Managers</option>
          {salesManagers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>

        {/* Auto-refresh toggle */}
        <button onClick={()=>setAutoRefresh(a=>!a)} style={{
          padding:'5px 12px',borderRadius:8,border:'1.5px solid',fontWeight:700,fontSize:'0.72rem',cursor:'pointer',
          background:autoRefresh?'#ECFDF5':'#F9FAFB',
          color:autoRefresh?'#059669':'#6B7280',
          borderColor:autoRefresh?'#6EE7B7':'#E5E7EB'
        }}>
          {autoRefresh ? `⏱ ${countdown}s` : '▶ Auto'}
        </button>

        {/* Manual refresh */}
        <button onClick={handleManualRefresh} style={{padding:'5px 12px',borderRadius:8,border:'1.5px solid #E5E7EB',fontWeight:700,fontSize:'0.72rem',cursor:'pointer',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:5}}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5A4.5 4.5 0 102.5 4M2 2v2.5H4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Refresh
        </button>

        <span style={{fontSize:'0.65rem',color:'#9CA3AF'}}>Updated {fmtTime(lastRefresh.toISOString())}</span>
      </div>

      {/* ── Main content: map + sidebar ── */}
      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* Manager list sidebar */}
        <div style={{width:280,flexShrink:0,overflowY:'auto',borderRight:'1px solid #E5E7EB',background:'#FAFAFA'}}>
          <div style={{padding:'10px 14px',fontSize:'0.7rem',fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',borderBottom:'1px solid #F3F4F6',background:'#fff'}}>
            Field Status
          </div>
          {displayManagers.length === 0 && (
            <div style={{padding:'32px 16px',textAlign:'center',color:'#9CA3AF',fontSize:'0.8rem'}}>
              No managers found
            </div>
          )}
          {displayManagers.map((m, i) => (
            <ManagerCard key={m.id} m={m} idx={managers.findIndex(x=>x.id===m.id)}
              isSelected={selectedId===m.id}
              onClick={()=>setSelectedId(selectedId===m.id?null:m.id)}
              address={addresses[m.id]}
            />
          ))}
        </div>

        {/* Map */}
        <div style={{flex:1,minWidth:0,position:'relative'}}>
          <LiveMap
            managers={displayManagers}
            selectedId={selectedId}
            onSelectManager={id=>setSelectedId(selectedId===id?null:id)}
          />

          {/* Selected manager info overlay */}
          {selectedMgr && (
            <div style={{position:'absolute',bottom:16,left:16,right:16,maxWidth:340,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(8px)',borderRadius:12,boxShadow:'0 4px 24px rgba(0,0,0,0.15)',padding:'14px 16px',zIndex:1000,border:'1px solid #E5E7EB'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:12,background:AVATAR_COLORS[selectedIdx%AVATAR_COLORS.length],color:'#fff',fontWeight:800,fontSize:'1rem',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {(selectedMgr.name||'?')[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:'0.9rem',color:'#111827'}}>{selectedMgr.name}</div>
                  <div style={{fontSize:'0.7rem',color:'#9CA3AF'}}>{selectedMgr.territory}</div>
                </div>
                <button onClick={()=>setSelectedId(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:'1.2rem',lineHeight:1}}>×</button>
              </div>
              {selectedMgr.last_gps?.lat ? (
                <div style={{fontSize:'0.75rem',color:'#374151'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:6,marginBottom:5,padding:'8px 10px',background:'#F0FDF4',borderRadius:8}}>
                    <span style={{flexShrink:0}}>📍</span>
                    <div>
                      <div style={{fontWeight:700,color:'#059669',marginBottom:2}}>Current Location</div>
                      <div style={{color:'#374151'}}>{addresses[selectedMgr.id] || 'Loading address...'}</div>
                      <div style={{color:'#9CA3AF',marginTop:3,fontFamily:'monospace',fontSize:'0.68rem'}}>
                        {selectedMgr.last_gps.lat.toFixed(6)}, {selectedMgr.last_gps.lng.toFixed(6)}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                    <div style={{background:'#F9FAFB',borderRadius:7,padding:'6px',textAlign:'center'}}>
                      <div style={{fontWeight:700,fontSize:'0.85rem',color:'#111827'}}>{selectedMgr.visits_today||0}</div>
                      <div style={{fontSize:'0.6rem',color:'#9CA3AF',fontWeight:600}}>VISITS</div>
                    </div>
                    <div style={{background:'#F9FAFB',borderRadius:7,padding:'6px',textAlign:'center'}}>
                      <div style={{fontWeight:700,fontSize:'0.7rem',color:'#2563EB'}}>₹{Number(selectedMgr.today_sales||0).toLocaleString('en-IN')}</div>
                      <div style={{fontSize:'0.6rem',color:'#9CA3AF',fontWeight:600}}>SALES</div>
                    </div>
                    <div style={{background:'#F9FAFB',borderRadius:7,padding:'6px',textAlign:'center'}}>
                      <div style={{fontWeight:700,fontSize:'0.7rem',color:selectedMgr.active_journey?'#10B981':'#9CA3AF'}}>{selectedMgr.active_journey?'Active':'Idle'}</div>
                      <div style={{fontSize:'0.6rem',color:'#9CA3AF',fontWeight:600}}>JOURNEY</div>
                    </div>
                  </div>
                  <div style={{marginTop:8,display:'flex',justifyContent:'space-between',fontSize:'0.65rem',color:'#9CA3AF'}}>
                    <span>🕐 Last GPS: {fmtTime(selectedMgr.last_gps.time)}</span>
                    <span style={{color:Date.now()-new Date(selectedMgr.last_gps.time)<120000?'#10B981':'#F59E0B',fontWeight:700}}>{fmtAgo(selectedMgr.last_gps.time)}</span>
                  </div>
                </div>
              ) : (
                <div style={{textAlign:'center',padding:'12px',color:'#9CA3AF',fontSize:'0.8rem'}}>
                  ⚫ No GPS data available yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

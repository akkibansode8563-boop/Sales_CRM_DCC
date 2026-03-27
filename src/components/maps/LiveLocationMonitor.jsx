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
  if (s < 60)   return s + 's ago'
  if (s < 3600) return Math.floor(s/60) + 'm ago'
  return Math.floor(s/3600) + 'h ago'
}

/* ── Reverse geocode ── */
const geoCache = {}
async function reverseGeo(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (geoCache[key]) return geoCache[key]
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const d = await r.json()
    const a = d.address
    const parts = [a.road||a.pedestrian||a.suburb, a.suburb||a.neighbourhood||a.city_district, a.city||a.town||a.village].filter(Boolean)
    const label = parts.slice(0,2).join(', ') || d.display_name?.split(',').slice(0,2).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    geoCache[key] = label
    return label
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
}

/* ── Leaflet map ── */
const LiveMap = memo(function LiveMap({ managers, selectedId, onSelectManager }) {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)
  const markersRef  = useRef({})
  const pathsRef    = useRef({})
  const initDone    = useRef(false)

  useEffect(() => {
    if (initDone.current || !mapRef.current) return
    initDone.current = true
    import('leaflet').then(L => {
      delete L.Icon.Default.prototype._getIconUrl
      const map = L.map(mapRef.current, {
        center: [19.076, 72.8777], zoom: 11,
        zoomControl: false,
        scrollWheelZoom: true,
        tap: true,
      })
      // Add zoom control bottom-right (away from top-left sidebar area)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM', maxZoom: 19
      }).addTo(map)
      mapInstance.current = { map, L }
    })
    return () => {
      if (mapInstance.current?.map) { mapInstance.current.map.remove(); mapInstance.current = null }
    }
  }, [])

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
      const color = AVATAR_COLORS[idx % AVATAR_COLORS.length]
      const isSelected = m.id === selectedId
      const size = isSelected ? 44 : 36
      const pulse = m.active_journey
        ? `<span style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;background:#10B981;border-radius:50%;border:2px solid #fff;animation:llm-pulse 1.2s infinite;"></span>`
        : ''
      const ring = isSelected
        ? `box-shadow:0 0 0 4px ${color}55,0 6px 18px rgba(0,0,0,0.3);`
        : 'box-shadow:0 2px 10px rgba(0,0,0,0.22);'

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;${ring}display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${isSelected?15:12}px;position:relative;cursor:pointer;transition:all 0.2s;">${(m.name||'?')[0].toUpperCase()}${pulse}</div>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size],
        popupAnchor: [0, -(size+4)],
      })

      const sm = STATUS_META[m.status] || STATUS_META['In-Office']
      const popupHtml = `
        <div style="min-width:190px;font-family:system-ui,sans-serif;padding:2px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="width:30px;height:30px;border-radius:50%;background:${color};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${(m.name||'?')[0]}</div>
            <div>
              <div style="font-weight:800;font-size:0.88rem;color:#111827">${m.name}</div>
              <div style="font-size:0.68rem;color:#6B7280">${m.territory||'No territory'}</div>
            </div>
          </div>
          <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;font-size:0.65rem;font-weight:700;background:${sm.bg};color:${sm.color};margin-bottom:8px">
            <span style="width:5px;height:5px;border-radius:50%;background:${sm.dot};display:inline-block"></span>${m.status}
          </div>
          <div style="font-size:0.7rem;color:#374151;background:#F9FAFB;padding:7px 9px;border-radius:7px">
            <div>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
            <div>🕐 ${fmtTime(gps.time)}</div>
            <div>👣 Visits: ${m.visits_today||0} · ₹${Number(m.today_sales||0).toLocaleString('en-IN')}</div>
            ${m.active_journey ? '<div style="margin-top:4px;color:#10B981;font-weight:700">🟢 Journey Active</div>' : ''}
          </div>
        </div>`

      if (markersRef.current[m.id]) {
        markersRef.current[m.id].setLatLng([lat, lng]).setIcon(icon).setPopupContent(popupHtml)
      } else {
        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 230, autoPan: true })
          .on('click', () => onSelectManager(m.id))
        markersRef.current[m.id] = marker
      }

      // GPS trail for selected
      if (m.id === selectedId && m.gps_trail?.length > 1) {
        if (pathsRef.current[m.id]) pathsRef.current[m.id].remove()
        pathsRef.current[m.id] = L.polyline(
          m.gps_trail.map(p => [p.lat, p.lng]),
          { color, weight: 3, opacity: 0.6, dashArray: '6,4' }
        ).addTo(map)
      } else if (pathsRef.current[m.id] && m.id !== selectedId) {
        pathsRef.current[m.id].remove()
        delete pathsRef.current[m.id]
      }
    })

    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(Number(id))) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })
  }, [managers, selectedId, onSelectManager])

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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
      <style>{`
        @keyframes llm-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:0.5}}
        .leaflet-popup-content-wrapper{border-radius:12px!important;box-shadow:0 8px 28px rgba(0,0,0,0.14)!important}
        .leaflet-popup-content{margin:12px 14px!important;font-family:system-ui,sans-serif}
        .leaflet-control-zoom{border-radius:10px!important;overflow:hidden;border:none!important;box-shadow:0 2px 10px rgba(0,0,0,0.15)!important}
        .leaflet-control-zoom a{font-size:16px!important;width:34px!important;height:34px!important;line-height:34px!important;color:#374151!important}
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }}/>
      {managers.filter(m => m.last_gps?.lat).length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'rgba(249,250,251,0.94)', zIndex: 10,
        }}>
          <div style={{ fontSize: '2.5rem' }}>🛰️</div>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#374151' }}>No GPS data yet</div>
          <div style={{ fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center', maxWidth: 220, lineHeight: 1.5 }}>
            Managers appear when they start a journey with GPS enabled
          </div>
        </div>
      )}
    </div>
  )
})

/* ── Manager list card (compact for mobile) ── */
function ManagerCard({ m, idx, isSelected, onClick, address }) {
  const sm = STATUS_META[m.status] || STATUS_META['In-Office']
  const hasGPS = !!m.last_gps?.lat
  const color  = AVATAR_COLORS[idx % AVATAR_COLORS.length]

  return (
    <div onClick={onClick} style={{
      padding: '10px 12px', cursor: 'pointer',
      borderBottom: '1px solid #F3F4F6',
      background: isSelected ? '#EFF6FF' : '#fff',
      borderLeft: `3px solid ${isSelected ? '#2563EB' : 'transparent'}`,
      transition: 'all 0.12s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: color, color: '#fff',
          fontWeight: 800, fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, position: 'relative',
        }}>
          {(m.name||'?')[0]}
          {m.active_journey && (
            <span style={{
              position: 'absolute', top: -2, right: -2,
              width: 9, height: 9, background: '#10B981',
              borderRadius: '50%', border: '2px solid #fff',
              animation: 'llm-pulse 1.4s infinite',
            }}/>
          )}
        </div>

        {/* Name + territory */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '0.82rem', color: '#111827',
            display: 'flex', alignItems: 'center', gap: 5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {m.name}
            {hasGPS && (
              <span style={{ fontSize: '0.55rem', background: '#ECFDF5', color: '#059669', padding: '1px 5px', borderRadius: 99, fontWeight: 800, flexShrink: 0 }}>GPS</span>
            )}
          </div>
          <div style={{ fontSize: '0.63rem', color: '#9CA3AF', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.territory || 'No territory'}
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 7px', borderRadius: 99,
          background: sm.bg, color: sm.color,
          fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.dot, display: 'inline-block' }}/>
          {m.status}
        </div>
      </div>

      {/* Expanded detail — shows when selected */}
      {isSelected && (
        <div style={{
          marginTop: 9, padding: '9px 10px',
          background: '#F8FAFF', borderRadius: 8, border: '1px solid #DBEAFE',
        }}>
          {hasGPS ? (
            <>
              <div style={{ fontSize: '0.68rem', color: '#374151', display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 6 }}>
                <span style={{ flexShrink: 0 }}>📍</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#1D4ED8' }}>{address || 'Loading address…'}</div>
                  <div style={{ fontSize: '0.6rem', color: '#9CA3AF', marginTop: 2 }}>
                    {m.last_gps.lat?.toFixed(5)}, {m.last_gps.lng?.toFixed(5)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
                {[
                  { label: 'VISITS', val: m.visits_today||0, color: '#111827' },
                  { label: 'SALES', val: '₹'+Number(m.today_sales||0).toLocaleString('en-IN'), color: '#2563EB', small: true },
                  { label: 'JOURNEY', val: m.active_journey ? 'Active' : 'Idle', color: m.active_journey ? '#059669' : '#9CA3AF' },
                ].map(k => (
                  <div key={k.label} style={{ background: '#fff', borderRadius: 6, padding: '5px 6px', textAlign: 'center', border: '1px solid #E5E7EB' }}>
                    <div style={{ fontWeight: 800, fontSize: k.small ? '0.65rem' : '0.82rem', color: k.color, lineHeight: 1.2 }}>{k.val}</div>
                    <div style={{ fontSize: '0.55rem', color: '#9CA3AF', fontWeight: 700, marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.62rem', color: '#9CA3AF' }}>
                <span>🕐 {fmtTime(m.last_gps.time)}</span>
                <span style={{ color: Date.now()-new Date(m.last_gps.time) < 120000 ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
                  {fmtAgo(m.last_gps.time)}
                </span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '0.7rem', color: '#9CA3AF', textAlign: 'center', padding: 6 }}>
              ⚫ No GPS data yet
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main export ── */
export default function LiveLocationMonitor({ managers = [], salesManagers = [], onRefresh }) {
  const [selectedId,  setSelectedId]  = useState(null)
  const [filterMgr,   setFilterMgr]   = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [countdown,   setCountdown]   = useState(30)
  const [addresses,   setAddresses]   = useState({})
  const [lastRefresh, setLastRefresh] = useState(new Date())
  // Mobile: list panel can be open/closed
  const [listOpen,    setListOpen]    = useState(false)
  const timerRef = useRef(null)

  /* Auto-refresh */
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

  /* Reverse geocode GPS positions */
  useEffect(() => {
    managers.forEach(m => {
      if (!m.last_gps?.lat || addresses[m.id]) return
      reverseGeo(m.last_gps.lat, m.last_gps.lng).then(addr =>
        setAddresses(prev => ({ ...prev, [m.id]: addr }))
      )
    })
  }, [managers])

  const displayManagers = filterMgr === 'all' ? managers : managers.filter(m => m.id === Number(filterMgr))
  const gpsCount    = managers.filter(m => m.last_gps?.lat).length
  const activeCount = managers.filter(m => m.active_journey).length
  const selectedMgr = managers.find(m => m.id === selectedId)
  const selectedIdx = managers.findIndex(m => m.id === selectedId)

  const handleManualRefresh = () => { onRefresh?.(); setLastRefresh(new Date()); setCountdown(30) }
  const handleSelectMgr = id => setSelectedId(prev => prev === id ? null : id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>

      {/* ── Top control bar ── */}
      <div style={{
        padding: '10px 12px',
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center',
        flexWrap: 'wrap', gap: 8,
        flexShrink: 0,
      }}>
        {/* Live stats row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <StatChip color="#10B981" bg="#ECFDF5" pulse>
            {activeCount} Active
          </StatChip>
          <StatChip color="#2563EB" bg="#EFF6FF">
            🛰️ {gpsCount} GPS
          </StatChip>
          <StatChip color="#7C3AED" bg="#F5F3FF">
            👥 {managers.length}
          </StatChip>
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Manager filter */}
          <select
            value={filterMgr}
            onChange={e => { setFilterMgr(e.target.value); setSelectedId(e.target.value === 'all' ? null : Number(e.target.value)) }}
            style={{
              padding: '5px 8px', borderRadius: 8,
              border: '1.5px solid #E5E7EB',
              fontSize: '0.72rem', fontWeight: 600,
              color: '#374151', background: '#F9FAFB', cursor: 'pointer',
              maxWidth: 140,
            }}
          >
            <option value="all">All Managers</option>
            {salesManagers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>

          {/* Auto-refresh */}
          <button onClick={() => setAutoRefresh(a => !a)} style={{
            padding: '5px 10px', borderRadius: 8, border: '1.5px solid',
            fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer',
            background: autoRefresh ? '#ECFDF5' : '#F9FAFB',
            color:      autoRefresh ? '#059669' : '#6B7280',
            borderColor:autoRefresh ? '#6EE7B7' : '#E5E7EB',
            whiteSpace: 'nowrap',
          }}>
            {autoRefresh ? `⏱ ${countdown}s` : '▶ Auto'}
          </button>

          {/* Manual refresh */}
          <button onClick={handleManualRefresh} style={{
            padding: '5px 10px', borderRadius: 8,
            border: '1.5px solid #E5E7EB',
            fontWeight: 700, fontSize: '0.7rem',
            cursor: 'pointer', background: '#fff', color: '#374151',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 6A4.5 4.5 0 102.5 3.5M2 2v2h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sync
          </button>

          {/* Mobile: toggle manager list */}
          <button onClick={() => setListOpen(o => !o)} style={{
            padding: '5px 10px', borderRadius: 8,
            border: '1.5px solid #E5E7EB',
            fontWeight: 700, fontSize: '0.7rem',
            cursor: 'pointer',
            background: listOpen ? '#EFF6FF' : '#F9FAFB',
            color:      listOpen ? '#2563EB' : '#374151',
            display: 'flex', alignItems: 'center', gap: 4,
            whiteSpace: 'nowrap',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            {listOpen ? 'Hide' : 'Field Status'}
          </button>
        </div>

        {/* Timestamp */}
        <div style={{ width: '100%', fontSize: '0.58rem', color: '#9CA3AF', textAlign: 'right', marginTop: -2 }}>
          Updated {fmtTime(lastRefresh.toISOString())}
        </div>
      </div>

      {/* ── Body: map fills full height, list slides over it on mobile ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex' }}>

        {/* MAP — always full width/height */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <LiveMap
            managers={displayManagers}
            selectedId={selectedId}
            onSelectManager={handleSelectMgr}
          />
        </div>

        {/* MANAGER LIST — slides in from left, overlays map on mobile */}
        {listOpen && (
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: '100%', maxWidth: 300,
            background: '#fff',
            borderRight: '1px solid #E5E7EB',
            display: 'flex', flexDirection: 'column',
            zIndex: 500,
            boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
            borderRadius: '0 0 0 0',
          }}>
            {/* List header */}
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid #F3F4F6',
              background: '#F9FAFB', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Field Status · {displayManagers.length}
              </div>
              <button onClick={() => setListOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9CA3AF', fontSize: '1rem', lineHeight: 1, padding: 4,
              }}>✕</button>
            </div>

            {/* Manager cards */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {displayManagers.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: '0.8rem' }}>
                  No managers found
                </div>
              ) : displayManagers.map((m, i) => (
                <ManagerCard
                  key={m.id}
                  m={m}
                  idx={managers.findIndex(x => x.id === m.id)}
                  isSelected={selectedId === m.id}
                  onClick={() => { handleSelectMgr(m.id); if (window.innerWidth < 640) setListOpen(false) }}
                  address={addresses[m.id]}
                />
              ))}
            </div>
          </div>
        )}

        {/* SELECTED MANAGER card — bottom of map, no overlap with list */}
        {selectedMgr && !listOpen && (
          <div style={{
            position: 'absolute',
            bottom: 12, left: 12, right: 12,
            maxWidth: 360,
            margin: '0 auto',
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(8px)',
            borderRadius: 14,
            boxShadow: '0 6px 28px rgba(0,0,0,0.15)',
            padding: '12px 14px',
            zIndex: 400,
            border: '1px solid #E5E7EB',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: AVATAR_COLORS[selectedIdx % AVATAR_COLORS.length],
                color: '#fff', fontWeight: 800, fontSize: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {(selectedMgr.name||'?')[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedMgr.name}</div>
                <div style={{ fontSize: '0.67rem', color: '#9CA3AF' }}>{selectedMgr.territory || 'No territory'}</div>
              </div>
              <button onClick={() => setSelectedId(null)} style={{
                background: '#F3F4F6', border: 'none', borderRadius: '50%',
                width: 26, height: 26, cursor: 'pointer', color: '#6B7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.85rem', flexShrink: 0,
              }}>✕</button>
            </div>

            {selectedMgr.last_gps?.lat ? (
              <>
                {/* Location */}
                <div style={{
                  background: '#F0FDF4', borderRadius: 8, padding: '7px 10px',
                  fontSize: '0.7rem', color: '#374151', marginBottom: 9,
                  display: 'flex', gap: 6,
                }}>
                  <span style={{ flexShrink: 0 }}>📍</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#059669' }}>{addresses[selectedMgr.id] || 'Locating…'}</div>
                    <div style={{ fontSize: '0.6rem', color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>
                      {selectedMgr.last_gps.lat.toFixed(6)}, {selectedMgr.last_gps.lng.toFixed(6)}
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                  {[
                    { label: 'VISITS', val: selectedMgr.visits_today||0, c: '#111827' },
                    { label: 'SALES', val: '₹'+Number(selectedMgr.today_sales||0).toLocaleString('en-IN'), c: '#2563EB', sm: true },
                    { label: 'JOURNEY', val: selectedMgr.active_journey?'Active':'Idle', c: selectedMgr.active_journey?'#059669':'#9CA3AF' },
                  ].map(k => (
                    <div key={k.label} style={{ background: '#F9FAFB', borderRadius: 7, padding: '6px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: k.sm ? '0.62rem' : '0.82rem', color: k.c }}>{k.val}</div>
                      <div style={{ fontSize: '0.55rem', color: '#9CA3AF', fontWeight: 700 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Timing */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: '0.62rem', color: '#9CA3AF' }}>
                  <span>🕐 {fmtTime(selectedMgr.last_gps.time)}</span>
                  <span style={{ color: Date.now()-new Date(selectedMgr.last_gps.time) < 120000 ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
                    {fmtAgo(selectedMgr.last_gps.time)}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '10px', color: '#9CA3AF', fontSize: '0.78rem' }}>
                ⚫ No GPS data available yet
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes llm-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:0.5}}
      `}</style>
    </div>
  )
}

/* ── Tiny stat chip ── */
function StatChip({ children, color, bg, pulse }) {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 99,
      background: bg, color: color,
      fontSize: '0.68rem', fontWeight: 700,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {pulse && (
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: color, display: 'inline-block',
          animation: 'llm-pulse 1.2s infinite',
        }}/>
      )}
      {children}
    </span>
  )
}

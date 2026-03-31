// ─────────────────────────────────────────────────────────────────────────────
// SALES HEATMAP v2  — Journey Tracker + Visit Detail Map
// Shows: start point ★ → dotted route → numbered visit pins 1,2,3...
// Click any pin → popup with customer, distance, time, notes
// Filters: manager, date, date-range
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  getUsersSync              as getUsers,
  getJourneysForDateSync    as getJourneysForDate,
  getManagersWithJourneysSync as getManagersWithJourneys,
  getTerritoryStatsSync     as getTerritoryStats,
} from '../utils/supabaseDB'
import './SalesHeatmap.css'

const STOP_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#84CC16','#8B5CF6']
const fmtTime  = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'
const fmtDate  = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'
const fmtKm    = km  => km != null ? (km < 1 ? `${Math.round(km*1000)} m` : `${km.toFixed(1)} km`) : '—'
const fmtMins  = m   => {
  if (m == null) return '—'
  if (m < 60) return `${m} min`
  return `${Math.floor(m/60)}h ${m%60}m`
}

function loadLeaflet(cb) {
  if (window.L) { cb(window.L); return }
  if (!document.getElementById('leaflet-css')) {
    const lnk = document.createElement('link'); lnk.id='leaflet-css'; lnk.rel='stylesheet'
    lnk.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(lnk)
  }
  if (!document.getElementById('leaflet-js')) {
    const s = document.createElement('script'); s.id='leaflet-js'
    s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload = () => cb(window.L)
    document.head.appendChild(s)
  } else {
    const chk = setInterval(() => { if (window.L) { clearInterval(chk); cb(window.L) } }, 150)
  }
}

// ── Stop detail panel ─────────────────────────────────────────────────────────
function StopDetail({ visit, onClose, color }) {
  if (!visit) return null
  return (
    <div style={{
      position:'absolute', bottom:16, left:16, right:16,
      maxWidth:380, zIndex:2000,
      background:'rgba(255,255,255,0.98)', backdropFilter:'blur(8px)',
      borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
      border:'1px solid #E5E7EB', overflow:'hidden',
    }}>
      {/* Coloured header */}
      <div style={{ background:color, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{
          width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,0.25)',
          color:'#fff', fontWeight:900, fontSize:'0.85rem',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>{visit.visit_number}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:'0.92rem', color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {visit.customer_name}
          </div>
          <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.8)' }}>{visit.client_type} · {fmtTime(visit.created_at)}</div>
        </div>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:'50%', width:26, height:26, color:'#fff', cursor:'pointer', fontSize:'0.9rem', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
      </div>

      {/* Metrics row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:'1px solid #F3F4F6' }}>
        {[
          { label:'Stop',     val:`#${visit.visit_number}` },
          { label:'Distance', val:fmtKm(visit.dist_from_prev_km) },
          { label:'Travel Time', val:fmtMins(visit.time_from_prev_mins) },
        ].map(m => (
          <div key={m.label} style={{ textAlign:'center', padding:'10px 8px' }}>
            <div style={{ fontFamily:'monospace', fontWeight:900, fontSize:'1rem', color:'#111827' }}>{m.val}</div>
            <div style={{ fontSize:'0.58rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginTop:2 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Details */}
      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:6 }}>
        {visit.location && (
          <div style={{ display:'flex', gap:7, fontSize:'0.76rem', color:'#374151' }}>
            <span style={{ flexShrink:0 }}>📍</span>
            <span>{visit.location}</span>
          </div>
        )}
        {visit.contact_person && (
          <div style={{ display:'flex', gap:7, fontSize:'0.76rem', color:'#374151' }}>
            <span style={{ flexShrink:0 }}>👤</span>
            <span>{visit.contact_person}</span>
            {visit.contact_phone && <span style={{ color:'#6B7280' }}>· {visit.contact_phone}</span>}
          </div>
        )}
        {visit.notes && (
          <div style={{ display:'flex', gap:7, fontSize:'0.73rem', color:'#6B7280', fontStyle:'italic' }}>
            <span style={{ flexShrink:0 }}>💬</span>
            <span>{visit.notes}</span>
          </div>
        )}
        {visit.visit_type && (
          <div style={{ display:'inline-flex' }}>
            <span style={{ background:'#EFF6FF', color:'#2563EB', fontSize:'0.65rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>
              {visit.visit_type}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Journey sidebar card ──────────────────────────────────────────────────────
function JourneySummaryCard({ journey, isSelected, onClick, color }) {
  const dur = journey.end_time
    ? Math.round((new Date(journey.end_time) - new Date(journey.start_time)) / 60000)
    : null

  return (
    <div onClick={onClick} style={{
      padding:'10px 12px', borderRadius:10, cursor:'pointer', marginBottom:6,
      border:`2px solid ${isSelected ? color : '#E5E7EB'}`,
      background: isSelected ? `${color}08` : '#FAFAFA',
      transition:'all 0.15s',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6 }}>
        <div style={{ width:24, height:24, borderRadius:'50%', background:color, color:'#fff', fontWeight:900, fontSize:'0.72rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>★</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:'0.8rem', color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {fmtTime(journey.start_time)} → {journey.end_time ? fmtTime(journey.end_time) : 'Ongoing'}
          </div>
          <div style={{ fontSize:'0.62rem', color:'#9CA3AF' }}>{journey.start_location?.split(',')[0]}</div>
        </div>
        <span style={{
          padding:'2px 7px', borderRadius:99, fontSize:'0.6rem', fontWeight:700,
          background: journey.status==='active' ? '#ECFDF5' : '#F3F4F6',
          color: journey.status==='active' ? '#059669' : '#6B7280',
          flexShrink:0,
        }}>{journey.status === 'active' ? '● Live' : 'Done'}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
        {[
          { l:'Stops', v: journey.visits.length },
          { l:'Distance', v: `${journey.totalKm.toFixed(1)} km` },
          { l:'Duration', v: dur ? fmtMins(dur) : '—' },
        ].map(s => (
          <div key={s.l} style={{ background:'#fff', borderRadius:6, padding:'5px', textAlign:'center', border:'1px solid #E5E7EB' }}>
            <div style={{ fontWeight:800, fontSize:'0.78rem', color:'#111827', fontFamily:'monospace' }}>{s.v}</div>
            <div style={{ fontSize:'0.55rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SalesHeatmap({ onClose }) {
  const today = new Date().toISOString().split('T')[0]

  // Filters
  const [selMgrId,   setSelMgrId]   = useState(null)    // null = all
  const [dateMode,   setDateMode]   = useState('today') // today | single | range
  const [selDate,    setSelDate]    = useState(today)
  const [dateFrom,   setDateFrom]   = useState(today)
  const [dateTo,     setDateTo]     = useState(today)
  const [selJourney, setSelJourney] = useState(null)    // selected journey object
  const [selVisit,   setSelVisit]   = useState(null)    // clicked visit

  // Data
  const [allMgrs,    setAllMgrs]    = useState([])
  const [journeys,   setJourneys]   = useState([])
  const [loading,    setLoading]    = useState(false)

  // Map
  const mapRef      = useRef(null)
  const mapInst     = useRef(null)
  const markersRef  = useRef([])
  const polylinesRef= useRef([])
  const leafletRef  = useRef(null)
  const [mapReady,  setMapReady]    = useState(false)

  // ── Load managers once ─────────────────────────────────────
  useEffect(() => {
    const mgrs = (getUsers('Sales Manager') || [])
    setAllMgrs(mgrs)
  }, [])

  // ── Load journeys on filter change ─────────────────────────
  const loadJourneys = useCallback(() => {
    setLoading(true)
    setSelVisit(null)
    try {
      const date = dateMode === 'today' ? today : dateMode === 'single' ? selDate : null
      const from = dateMode === 'range' ? dateFrom : date
      const to   = dateMode === 'range' ? dateTo   : date

      let result = []
      if (selMgrId) {
        // Single manager: load their journeys for the date range
        if (dateMode === 'range') {
          // Load each date in range
          let d = new Date(from)
          const end = new Date(to)
          while (d <= end) {
            const ds = d.toISOString().split('T')[0]
            result = result.concat(getJourneysForDate(selMgrId, ds) || [])
            d.setDate(d.getDate() + 1)
          }
        } else {
          result = getJourneysForDate(selMgrId, date) || []
        }
      } else {
        // All managers on the date
        const mgrsOnDate = getManagersWithJourneys(date) || []
        mgrsOnDate.forEach(m => {
          const jrns = getJourneysForDate(m.id, date) || []
          result = result.concat(jrns)
        })
      }
      setJourneys(result)
      // Auto-select first journey
      if (result.length > 0) setSelJourney(result[0])
      else setSelJourney(null)
    } catch(e) {
      console.error('loadJourneys', e)
      setJourneys([])
    }
    setLoading(false)
  }, [selMgrId, dateMode, selDate, dateFrom, dateTo, today])

  useEffect(() => { if (mapReady) loadJourneys() }, [loadJourneys, mapReady])

  // ── Init Leaflet map ────────────────────────────────────────
  useEffect(() => {
    loadLeaflet(L => {
      leafletRef.current = L
      if (!mapRef.current || mapInst.current) { setMapReady(true); return }
      delete L.Icon.Default.prototype._getIconUrl
      const map = L.map(mapRef.current, { zoomControl: false, tap: true })
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM', maxZoom: 19,
      }).addTo(map)
      map.setView([19.076, 72.877], 11)
      mapInst.current = map
      setMapReady(true)
    })
    return () => {
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
    }
  }, [])

  // ── Render journey on map ───────────────────────────────────
  useEffect(() => {
    const L = leafletRef.current
    const map = mapInst.current
    if (!L || !map) return

    // Clear previous
    markersRef.current.forEach(m => map.removeLayer(m))
    polylinesRef.current.forEach(p => map.removeLayer(p))
    markersRef.current = []
    polylinesRef.current = []

    const toRender = selJourney ? [selJourney] : journeys
    if (toRender.length === 0) return

    const allPts = []

    toRender.forEach((journey, ji) => {
      const color = STOP_COLORS[ji % STOP_COLORS.length]
      const hasMgrName = !selMgrId && journey.manager_name
      const pts = []

      // ── Start marker ──
      if (journey.start_latitude && journey.start_longitude) {
        const startIcon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:36px">
            <div style="width:36px;height:36px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.28)"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);color:#fff;font-size:14px;line-height:1">★</div>
          </div>`,
          iconSize: [36,36], iconAnchor: [18,36], popupAnchor: [0,-40],
        })
        const startMk = L.marker([journey.start_latitude, journey.start_longitude], { icon: startIcon })
          .addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:170px;padding:2px">
            <div style="font-weight:800;color:${color};font-size:0.85rem;margin-bottom:4px">🏢 Journey Start</div>
            ${hasMgrName ? `<div style="font-size:0.72rem;color:#374151;margin-bottom:4px">👤 ${journey.manager_name}</div>` : ''}
            <div style="font-size:0.7rem;color:#6B7280">📍 ${journey.start_location || 'Starting Point'}</div>
            <div style="font-size:0.7rem;color:#9CA3AF">⏰ ${fmtTime(journey.start_time)}</div>
          </div>`, { maxWidth:240 })
        markersRef.current.push(startMk)
        pts.push([journey.start_latitude, journey.start_longitude])
        allPts.push([journey.start_latitude, journey.start_longitude])
      }

      // ── Visit markers ──
      journey.visits.forEach((v, i) => {
        if (!v.latitude || !v.longitude) return
        const vColor = STOP_COLORS[i % STOP_COLORS.length]
        const visitIcon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:32px;height:32px">
            <div style="width:32px;height:32px;background:${vColor};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.22)"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);color:#fff;font-weight:900;font-size:12px;line-height:1">${v.visit_number}</div>
          </div>`,
          iconSize:[32,32], iconAnchor:[16,32], popupAnchor:[0,-36],
        })
        const mk = L.marker([v.latitude, v.longitude], { icon: visitIcon })
          .addTo(map)
          .on('click', () => setSelVisit({ ...v, _color: vColor }))

        markersRef.current.push(mk)
        pts.push([v.latitude, v.longitude])
        allPts.push([v.latitude, v.longitude])
      })

      // ── End marker ──
      if (journey.end_latitude && journey.end_longitude) {
        const endIcon = L.divIcon({
          className: '',
          html: `<div style="width:28px;height:28px;background:#6B7280;border-radius:50%;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center">
            <div style="width:8px;height:8px;background:#fff;border-radius:50%"></div>
          </div>`,
          iconSize:[28,28], iconAnchor:[14,14],
        })
        const endMk = L.marker([journey.end_latitude, journey.end_longitude], { icon: endIcon })
          .addTo(map)
          .bindPopup(`<div style="font-family:system-ui;padding:2px">
            <div style="font-weight:800;color:#6B7280;font-size:0.85rem;margin-bottom:4px">🏁 Journey End</div>
            <div style="font-size:0.7rem;color:#6B7280">📍 ${journey.end_location || 'End Point'}</div>
            <div style="font-size:0.7rem;color:#9CA3AF">⏰ ${fmtTime(journey.end_time)}</div>
          </div>`, { maxWidth:200 })
        markersRef.current.push(endMk)
        pts.push([journey.end_latitude, journey.end_longitude])
        allPts.push([journey.end_latitude, journey.end_longitude])
      }

      // ── GPS trail (thin line) ──
      if (journey.locations?.length > 1) {
        const trailPts = journey.locations.map(l => [l.latitude, l.longitude])
        const trail = L.polyline(trailPts, {
          color, weight: 2, opacity: 0.35, dashArray: '4,6',
        }).addTo(map)
        polylinesRef.current.push(trail)
      }

      // ── Route line connecting start → visits → end (dotted) ──
      if (pts.length > 1) {
        const route = L.polyline(pts, {
          color, weight: 3, opacity: 0.8,
          dashArray: '10,8', lineJoin: 'round', lineCap: 'round',
        }).addTo(map)
        polylinesRef.current.push(route)
      }
    })

    // Fit bounds to all points
    if (allPts.length === 1) {
      map.setView(allPts[0], 15)
    } else if (allPts.length > 1) {
      try { map.fitBounds(L.latLngBounds(allPts), { padding: [50, 50] }) } catch {}
    }
  }, [selJourney, journeys, selMgrId])

  // ── Derived stats ───────────────────────────────────────────
  const stats = useMemo(() => {
    const toShow = selJourney ? [selJourney] : journeys
    return {
      totalVisits:   toShow.reduce((s,j) => s + j.visits.length, 0),
      totalKm:       toShow.reduce((s,j) => s + j.totalKm, 0),
      journeyCount:  toShow.length,
    }
  }, [selJourney, journeys])

  const mgrForJourney = useCallback(j => allMgrs.find(m => m.id === j.manager_id), [allMgrs])
  const dateLabel = dateMode === 'today' ? 'Today' : dateMode === 'single' ? fmtDate(selDate+'T00:00:00') : `${fmtDate(dateFrom+'T00:00:00')} – ${fmtDate(dateTo+'T00:00:00')}`

  return (
    <div className="shm-overlay" onClick={onClose}>
      <div className="shm-panel shm-panel-v2" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="shm-header">
          <div>
            <div className="shm-title">🗺️ Journey Tracker</div>
            <div className="shm-sub">
              {loading ? 'Loading…' : `${stats.journeyCount} journey${stats.journeyCount!==1?'s':''} · ${stats.totalVisits} visits · ${stats.totalKm.toFixed(1)} km`}
              {' · '}{dateLabel}
            </div>
          </div>
          <button className="shm-close" onClick={onClose}>✕</button>
        </div>

        <div className="shm-body">
          {/* ── Sidebar ── */}
          <div className="shm-sidebar shm-sidebar-v2">

            {/* Date filter */}
            <div className="shm-section">
              <div className="shm-sec-lbl">📅 Date</div>
              <div style={{display:'flex',gap:4}}>
                {[['today','Today'],['single','Date'],['range','Range']].map(([v,l]) => (
                  <button key={v} onClick={() => setDateMode(v)} style={{
                    flex:1, padding:'5px 4px', borderRadius:7, border:'1.5px solid',
                    fontWeight:700, fontSize:'0.65rem', cursor:'pointer', fontFamily:'inherit',
                    background: dateMode===v ? '#2563EB' : '#F9FAFB',
                    color:      dateMode===v ? '#fff' : '#6B7280',
                    borderColor:dateMode===v ? '#2563EB' : '#E5E7EB',
                  }}>{l}</button>
                ))}
              </div>
              {dateMode === 'single' && (
                <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                  style={{padding:'6px 8px',borderRadius:7,border:'1.5px solid #E5E7EB',fontSize:'0.76rem',fontFamily:'inherit',outline:'none'}}/>
              )}
              {dateMode === 'range' && (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    style={{padding:'6px 8px',borderRadius:7,border:'1.5px solid #E5E7EB',fontSize:'0.76rem',fontFamily:'inherit',outline:'none'}}/>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    style={{padding:'6px 8px',borderRadius:7,border:'1.5px solid #E5E7EB',fontSize:'0.76rem',fontFamily:'inherit',outline:'none'}}/>
                </div>
              )}
            </div>

            {/* Manager filter */}
            <div className="shm-section">
              <div className="shm-sec-lbl">👤 Sales Manager</div>
              <button
                onClick={() => { setSelMgrId(null); setSelJourney(null) }}
                style={{
                  padding:'7px 10px', borderRadius:8, border:'1.5px solid',
                  fontWeight:700, fontSize:'0.73rem', cursor:'pointer', fontFamily:'inherit',
                  textAlign:'left',
                  background: !selMgrId ? '#EFF6FF' : '#F9FAFB',
                  color:      !selMgrId ? '#2563EB' : '#6B7280',
                  borderColor:!selMgrId ? '#2563EB' : '#E5E7EB',
                }}>All Managers</button>
              {allMgrs.map((m, i) => (
                <button key={m.id}
                  onClick={() => { setSelMgrId(m.id); setSelJourney(null) }}
                  style={{
                    padding:'7px 10px', borderRadius:8, border:'1.5px solid',
                    fontWeight:700, fontSize:'0.73rem', cursor:'pointer', fontFamily:'inherit',
                    textAlign:'left', display:'flex', alignItems:'center', gap:7,
                    background: selMgrId===m.id ? `${STOP_COLORS[i%STOP_COLORS.length]}15` : '#F9FAFB',
                    color:      selMgrId===m.id ? STOP_COLORS[i%STOP_COLORS.length] : '#6B7280',
                    borderColor:selMgrId===m.id ? STOP_COLORS[i%STOP_COLORS.length] : '#E5E7EB',
                  }}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:STOP_COLORS[i%STOP_COLORS.length],flexShrink:0}}/>
                  {m.full_name}
                  {m.territory && <span style={{fontSize:'0.6rem',color:'#9CA3AF',fontWeight:500,marginLeft:'auto'}}>{m.territory}</span>}
                </button>
              ))}
            </div>

            {/* Journey list */}
            {journeys.length > 0 && (
              <div className="shm-section">
                <div className="shm-sec-lbl">🚗 Journeys ({journeys.length})</div>
                <div style={{display:'flex',gap:4,marginBottom:6}}>
                  <button
                    onClick={() => setSelJourney(null)}
                    style={{
                      flex:1, padding:'5px', borderRadius:7, border:'1.5px solid',
                      fontWeight:700, fontSize:'0.65rem', cursor:'pointer', fontFamily:'inherit',
                      background: !selJourney ? '#2563EB' : '#F9FAFB',
                      color:      !selJourney ? '#fff' : '#6B7280',
                      borderColor:!selJourney ? '#2563EB' : '#E5E7EB',
                    }}>All</button>
                </div>
                {journeys.map((j, ji) => {
                  const mgr = mgrForJourney(j)
                  const color = selMgrId
                    ? STOP_COLORS[allMgrs.findIndex(m => m.id === selMgrId) % STOP_COLORS.length]
                    : STOP_COLORS[ji % STOP_COLORS.length]
                  return (
                    <div key={j.id}>
                      {!selMgrId && mgr && (
                        <div style={{fontSize:'0.6rem',fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:3}}>
                          {mgr.full_name}
                        </div>
                      )}
                      <JourneySummaryCard
                        journey={j}
                        isSelected={selJourney?.id === j.id}
                        onClick={() => setSelJourney(selJourney?.id === j.id ? null : j)}
                        color={color}
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {/* Visit list for selected journey */}
            {selJourney && selJourney.visits.length > 0 && (
              <div className="shm-section">
                <div className="shm-sec-lbl">📍 Visit Log ({selJourney.visits.length})</div>
                {selJourney.visits.map((v, i) => (
                  <div key={v.id||i}
                    onClick={() => setSelVisit({ ...v, _color: STOP_COLORS[i % STOP_COLORS.length] })}
                    style={{
                      padding:'8px 10px', borderRadius:9, cursor:'pointer', marginBottom:4,
                      border: `1.5px solid ${selVisit?.id === v.id ? STOP_COLORS[i%STOP_COLORS.length] : '#E5E7EB'}`,
                      background: selVisit?.id === v.id ? `${STOP_COLORS[i%STOP_COLORS.length]}10` : '#fff',
                      transition:'all 0.12s',
                    }}>
                    <div style={{display:'flex',alignItems:'center',gap:7}}>
                      <div style={{
                        width:22,height:22,borderRadius:'50%',flexShrink:0,
                        background:STOP_COLORS[i%STOP_COLORS.length],
                        color:'#fff',fontWeight:800,fontSize:'0.65rem',
                        display:'flex',alignItems:'center',justifyContent:'center',
                      }}>{v.visit_number}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:'0.78rem',color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {v.customer_name}
                        </div>
                        <div style={{fontSize:'0.62rem',color:'#9CA3AF'}}>
                          {fmtTime(v.created_at)}
                          {v.dist_from_prev_km != null && <span> · {fmtKm(v.dist_from_prev_km)}</span>}
                          {v.time_from_prev_mins != null && <span> · {fmtMins(v.time_from_prev_mins)}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {journeys.length === 0 && !loading && (
              <div style={{textAlign:'center',padding:'24px 12px',color:'#9CA3AF'}}>
                <div style={{fontSize:'2rem',marginBottom:8}}>📭</div>
                <div style={{fontWeight:700,fontSize:'0.8rem',color:'#374151'}}>No journeys found</div>
                <div style={{fontSize:'0.68rem',marginTop:4}}>Try a different date or manager</div>
              </div>
            )}
          </div>

          {/* ── Map area ── */}
          <div style={{flex:1,position:'relative'}}>
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
            <style>{`
              @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
              .leaflet-popup-content-wrapper{border-radius:12px!important;box-shadow:0 8px 28px rgba(0,0,0,0.14)!important}
              .leaflet-popup-content{margin:12px 14px!important;font-family:system-ui,sans-serif}
              .leaflet-control-zoom{border-radius:10px!important;overflow:hidden;border:none!important;box-shadow:0 2px 10px rgba(0,0,0,0.12)!important}
              .leaflet-control-zoom a{font-size:16px!important;width:34px!important;height:34px!important;line-height:34px!important}
            `}</style>

            <div ref={mapRef} style={{width:'100%',height:'100%'}}/>

            {/* Loading overlay */}
            {loading && (
              <div style={{position:'absolute',inset:0,background:'rgba(255,255,255,0.8)',display:'flex',alignItems:'center',justifyContent:'center',gap:10,zIndex:1000}}>
                <div style={{width:18,height:18,border:'2.5px solid #E5E7EB',borderTopColor:'#2563EB',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
                <span style={{fontSize:'0.82rem',color:'#374151',fontWeight:600}}>Loading journeys…</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {/* Empty state */}
            {!loading && journeys.length === 0 && mapReady && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,background:'rgba(249,250,251,0.9)',zIndex:5}}>
                <div style={{fontSize:'3rem'}}>🛣️</div>
                <div style={{fontWeight:800,fontSize:'0.95rem',color:'#374151'}}>No journeys for this selection</div>
                <div style={{fontSize:'0.75rem',color:'#9CA3AF',textAlign:'center',maxWidth:260}}>
                  Try selecting a different date or manager.<br/>Journeys appear once a manager starts tracking.
                </div>
              </div>
            )}

            {/* Legend overlay */}
            <div style={{position:'absolute',top:12,left:12,background:'rgba(255,255,255,0.95)',borderRadius:10,padding:'8px 12px',zIndex:500,boxShadow:'0 2px 10px rgba(0,0,0,0.1)',fontSize:'0.65rem',display:'flex',flexDirection:'column',gap:5}}>
              <div style={{fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:2}}>Legend</div>
              {[
                { icon:'★', color:'#2563EB', label:'Journey Start' },
                { icon:'1', color:'#10B981', label:'Visit Stop (numbered)' },
                { icon:'●', color:'#6B7280', label:'Journey End' },
              ].map(l => (
                <div key={l.label} style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:16,height:16,borderRadius:'50%',background:l.color,color:'#fff',fontWeight:800,fontSize:'0.55rem',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{l.icon}</div>
                  <span style={{color:'#374151'}}>{l.label}</span>
                </div>
              ))}
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                <div style={{width:24,height:2,background:'#2563EB',opacity:0.8,borderTop:'2px dashed #2563EB'}}/>
                <span style={{color:'#374151'}}>Route (dotted)</span>
              </div>
            </div>

            {/* Stop detail card */}
            {selVisit && (
              <StopDetail
                visit={selVisit}
                color={selVisit._color || '#2563EB'}
                onClose={() => setSelVisit(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

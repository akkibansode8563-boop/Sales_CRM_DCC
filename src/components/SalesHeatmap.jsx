// -----------------------------------------------------------
// SALES HEATMAP — Leaflet map showing visit density
// Color-coded territory dots, visit clusters, manager filters
// -----------------------------------------------------------
import { useEffect, useRef, useState } from 'react'
import {
  getUsersSync         as getUsers,
  getHeatmapDataSync   as getHeatmapData,
  getTerritoryStatsSync as getTerritoryStats
} from '../utils/supabaseDB'
import './SalesHeatmap.css'

let L = null
const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316']
const TERRITORY_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#84CC16','#8B5CF6']

function loadLeaflet(cb) {
  if (window.L) { L = window.L; cb(); return }
  if (!document.getElementById('leaflet-css')) {
    const lnk = document.createElement('link'); lnk.id='leaflet-css'; lnk.rel='stylesheet'
    lnk.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(lnk)
  }
  if (!document.getElementById('leaflet-js')) {
    const s = document.createElement('script'); s.id='leaflet-js'
    s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload=()=>{L=window.L;cb()}; document.head.appendChild(s)
  } else {
    const chk=setInterval(()=>{if(window.L){clearInterval(chk);L=window.L;cb()}},200)
  }
}

export default function SalesHeatmap({ onClose }) {
  const mapRef   = useRef(null)
  const mapInst  = useRef(null)
  const dotsRef  = useRef([])
  const [mapReady,     setMapReady]     = useState(false)
  const [managers,     setManagers]     = useState([])
  const [selManager,   setSelManager]   = useState(null)
  const [heatData,     setHeatData]     = useState([])
  const [terrStats,    setTerrStats]    = useState([])
  const [showVisits,   setShowVisits]   = useState(true)
  const [showGPS,      setShowGPS]      = useState(false)

  useEffect(() => {
    const mgrs = getUsers('Sales Manager')
    setManagers(mgrs)
    setTerrStats(getTerritoryStats())
    loadLeaflet(() => setMapReady(true))
    return () => { if (mapInst.current) { mapInst.current.remove(); mapInst.current = null } }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInst.current) return
    const m = L.map(mapRef.current, { zoomControl: true, preferCanvas: true })
    mapInst.current = m
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(m)
    setTimeout(() => { if (m) m.invalidateSize() }, 300)
    m.setView([19.0760, 72.8777], 10)  // Mumbai default
    refreshData(null)
  }, [mapReady])

  const refreshData = (mgr_id) => {
    const data = getHeatmapData(mgr_id)
    setHeatData(data)
    if (mapInst.current) renderDots(data)
  }

  const renderDots = (data) => {
    if (!mapInst.current || !L) return
    const map = mapInst.current
    dotsRef.current.forEach(d => map.removeLayer(d))
    dotsRef.current = []

    const filtered = data.filter(p => {
      if (p.type === 'visit' && !showVisits) return false
      if (p.type === 'gps'   && !showGPS)   return false
      return true
    })

    filtered.forEach((pt, i) => {
      const isVisit = pt.type === 'visit'
      const mgr = managers.find(m => m.id === pt.manager_id)
      const mgrIdx = managers.findIndex(m => m.id === pt.manager_id)
      const color = AVATAR_COLORS[mgrIdx % AVATAR_COLORS.length] || '#6B7280'
      const size = isVisit ? 14 : 7
      const opacity = isVisit ? 0.85 : 0.35
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:${isVisit?'2px solid #fff':'none'};opacity:${opacity};box-shadow:${isVisit?`0 0 0 3px ${color}22`:'none'}"></div>`,
        iconSize: [size, size], iconAnchor: [size/2, size/2], className: ''
      })
      const mk = L.marker([pt.lat, pt.lng], { icon })
      if (isVisit && pt.label) mk.bindTooltip(`${pt.label}${mgr?` (${mgr.full_name})`:''}`)
      mk.addTo(map)
      dotsRef.current.push(mk)
    })
  }

  useEffect(() => { if (mapReady && mapInst.current) renderDots(heatData) }, [showVisits, showGPS, heatData])

  const filterManager = (mgr) => {
    const m = mgr?.id === selManager?.id ? null : mgr
    setSelManager(m)
    refreshData(m?.id || null)
  }

  const visitCount = heatData.filter(d => d.type === 'visit').length
  const gpsCount   = heatData.filter(d => d.type === 'gps').length

  return (
    <div className="shm-overlay" onClick={onClose}>
      <div className="shm-panel" onClick={e => e.stopPropagation()}>
        <div className="shm-header">
          <div>
            <div className="shm-title">🔥 Sales Activity Heatmap</div>
            <div className="shm-sub">{visitCount} visits · {gpsCount} GPS points plotted</div>
          </div>
          <button className="shm-close" onClick={onClose}>✕</button>
        </div>

        <div className="shm-body">
          {/* Controls sidebar */}
          <div className="shm-sidebar">
            {/* Layer toggles */}
            <div className="shm-section">
              <div className="shm-sec-lbl">Map Layers</div>
              <label className="shm-toggle">
                <input type="checkbox" checked={showVisits} onChange={e => setShowVisits(e.target.checked)}/>
                <span className="shm-toggle-track"/>
                <span>Customer Visits</span>
                <span className="shm-count">{visitCount}</span>
              </label>
              <label className="shm-toggle">
                <input type="checkbox" checked={showGPS} onChange={e => setShowGPS(e.target.checked)}/>
                <span className="shm-toggle-track"/>
                <span>GPS Trail Points</span>
                <span className="shm-count">{gpsCount}</span>
              </label>
            </div>

            {/* Manager filter */}
            <div className="shm-section">
              <div className="shm-sec-lbl">Filter by Manager</div>
              <button className={`shm-mgr-btn ${!selManager ? 'shm-mgr-active' : ''}`} onClick={() => filterManager(null)}>
                All Managers
              </button>
              {managers.map((m, i) => (
                <button key={m.id}
                  className={`shm-mgr-btn ${selManager?.id === m.id ? 'shm-mgr-active' : ''}`}
                  onClick={() => filterManager(m)}>
                  <div className="shm-mgr-dot" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}/>
                  {m.full_name}
                </button>
              ))}
            </div>

            {/* Territory stats */}
            <div className="shm-section">
              <div className="shm-sec-lbl">Territory Stats</div>
              {terrStats.map((t, i) => (
                <div key={t.name} className="shm-terr-row">
                  <div className="shm-terr-dot" style={{ background: TERRITORY_COLORS[i % TERRITORY_COLORS.length] }}/>
                  <div className="shm-terr-body">
                    <div className="shm-terr-name">{t.name}</div>
                    <div className="shm-terr-meta">{t.managers} mgr · {t.visits_total} visits · {t.customers} customers</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="shm-section shm-legend">
              <div className="shm-sec-lbl">Legend</div>
              <div className="shm-leg-item"><div style={{width:14,height:14,borderRadius:'50%',background:'#2563EB',border:'2px solid #fff',boxShadow:'0 0 0 3px #2563EB22'}}/><span>Customer Visit</span></div>
              <div className="shm-leg-item"><div style={{width:7,height:7,borderRadius:'50%',background:'#2563EB',opacity:0.35}}/><span>GPS Trail Point</span></div>
            </div>
          </div>

          {/* Map */}
          <div ref={mapRef} className="shm-map" style={{ background: '#E5E7EB' }}>
            {heatData.length === 0 && mapReady && (
              <div className="shm-empty-map">
                <div className="shm-empty-ico">🗺️</div>
                <div className="shm-empty-txt">No GPS visits recorded yet.</div>
                <div className="shm-empty-sub">Start a journey and log visits to see heatmap.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

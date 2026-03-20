// -----------------------------------------------------------
// JOURNEY REPLAY — Admin tool to replay any salesperson's
// full route with timeline events, suspicious flags,
// idle detection and animated playback on Leaflet map
// -----------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react'
import { getJourneyReplayData, getJourneyHistory, getUsers, calcDistanceKm } from '../utils/supabaseDB'
import './JourneyReplay.css'

let L = null
const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899']
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '--'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '--'

function loadLeaflet(cb) {
  if (window.L) { L = window.L; cb(); return }
  if (!document.getElementById('leaflet-css')) {
    const lnk = document.createElement('link')
    lnk.id = 'leaflet-css'; lnk.rel = 'stylesheet'
    lnk.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(lnk)
  }
  if (!document.getElementById('leaflet-js')) {
    const s = document.createElement('script')
    s.id = 'leaflet-js'; s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload = () => { L = window.L; cb() }
    document.head.appendChild(s)
  } else {
    const chk = setInterval(() => { if (window.L) { clearInterval(chk); L = window.L; cb() } }, 200)
  }
}

export default function JourneyReplay({ onClose }) {
  const mapRef     = useRef(null)
  const mapInst    = useRef(null)
  const replayRef  = useRef(null)
  const routeRef   = useRef(null)
  const dotRef     = useRef(null)
  const markersRef = useRef([])

  const [managers,       setManagers]       = useState([])
  const [selManager,     setSelManager]     = useState(null)
  const [journeys,       setJourneys]       = useState([])
  const [selJourney,     setSelJourney]     = useState(null)
  const [replayData,     setReplayData]     = useState(null)
  const [replayIdx,      setReplayIdx]      = useState(0)
  const [playing,        setPlaying]        = useState(false)
  const [speed,          setSpeed]          = useState(3) // x multiplier
  const [mapReady,       setMapReady]       = useState(false)
  const [activeEvent,    setActiveEvent]    = useState(null)

  useEffect(() => {
    const users = getUsers('Sales Manager')
    setManagers(users)
    loadLeaflet(() => setMapReady(true))
    return () => {
      if (replayRef.current) clearInterval(replayRef.current)
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInst.current) return
    const m = L.map(mapRef.current, { zoomControl: true })
    mapInst.current = m
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(m)
    m.setView([20.5937, 78.9629], 5)
  }, [mapReady])

  const selectManager = (mgr) => {
    setSelManager(mgr)
    setJourneys(getJourneyHistory(mgr.id))
    setSelJourney(null); setReplayData(null); setReplayIdx(0); setPlaying(false)
    clearTimeout(replayRef.current)
  }

  const selectJourney = (j) => {
    setSelJourney(j)
    const data = getJourneyReplayData(j.id)
    setReplayData(data); setReplayIdx(0); setPlaying(false)
    clearInterval(replayRef.current)
    if (data && mapInst.current) renderJourneyOnMap(data, 0)
  }

  const renderJourneyOnMap = useCallback((data, upToIdx) => {
    if (!mapInst.current || !L) return
    const map = mapInst.current
    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []
    if (routeRef.current) map.removeLayer(routeRef.current)
    if (dotRef.current) map.removeLayer(dotRef.current)

    const locs = data.locations
    if (locs.length === 0) return

    const subset = upToIdx === null ? locs : locs.slice(0, upToIdx + 1)
    const pts = subset.map(l => [l.latitude, l.longitude])

    // Draw route
    if (pts.length > 1) {
      routeRef.current = L.polyline(pts, { color: '#2563EB', weight: 3.5, opacity: 0.8, dashArray: null }).addTo(map)
    }

    // Draw current dot
    if (pts.length > 0) {
      const last = pts[pts.length - 1]
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:#2563EB;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 3px rgba(37,99,235,0.3)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7], className: ''
      })
      dotRef.current = L.marker(last, { icon }).addTo(map)
    }

    // Draw visit markers
    data.visits.forEach((v, i) => {
      if (!v.latitude || !v.longitude) return
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;background:#10B981;color:#fff;border-radius:50%;font-size:0.7rem;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.2)">${i+1}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12], className: ''
      })
      const mk = L.marker([v.latitude, v.longitude], { icon })
        .bindTooltip(`${v.client_name || v.customer_name} · ${fmtTime(v.created_at)}`)
        .addTo(map)
      markersRef.current.push(mk)
    })

    // Fit bounds
    if (pts.length > 0) {
      if (pts.length === 1) map.setView(pts[0], 14)
      else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] })
    }
  }, [])

  // Playback engine
  useEffect(() => {
    if (!playing || !replayData) return
    const locs = replayData.locations
    if (replayIdx >= locs.length - 1) { setPlaying(false); return }
    replayRef.current = setInterval(() => {
      setReplayIdx(prev => {
        const next = prev + 1
        if (next >= locs.length) { setPlaying(false); clearInterval(replayRef.current); return prev }
        renderJourneyOnMap(replayData, next)
        // Find active event
        const loc = locs[next]
        const evt = replayData.events.find(e => e.time >= loc.timestamp)
        if (evt) setActiveEvent(evt)
        return next
      })
    }, Math.max(100, 500 / speed))
    return () => clearInterval(replayRef.current)
  }, [playing, replayData, speed, renderJourneyOnMap])

  const togglePlay = () => {
    if (!replayData) return
    if (replayIdx >= replayData.locations.length - 1) setReplayIdx(0)
    setPlaying(p => !p)
  }
  const resetReplay = () => { setPlaying(false); setReplayIdx(0); clearInterval(replayRef.current); if (replayData) renderJourneyOnMap(replayData, 0) }
  const progressPct = replayData?.locations.length ? Math.round((replayIdx / (replayData.locations.length - 1)) * 100) : 0

  const EVENT_META = {
    start:      { bg: '#EFF6FF', color: '#2563EB', ico: '🚀' },
    visit:      { bg: '#ECFDF5', color: '#059669', ico: '📍' },
    idle:       { bg: '#FFFBEB', color: '#D97706', ico: '⏸️' },
    suspicious: { bg: '#FEF2F2', color: '#DC2626', ico: '⚠️' },
    end:        { bg: '#F5F3FF', color: '#7C3AED', ico: '🏁' },
  }

  return (
    <div className="jr-overlay" onClick={onClose}>
      <div className="jr-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="jr-header">
          <div>
            <div className="jr-title">🎬 Journey Replay</div>
            <div className="jr-sub">Replay any manager's route in full detail</div>
          </div>
          <button className="jr-close" onClick={onClose}>✕</button>
        </div>

        <div className="jr-body">
          {/* Left: Selector + Timeline */}
          <div className="jr-sidebar">
            {/* Manager select */}
            <div className="jr-section">
              <div className="jr-sec-lbl">Select Manager</div>
              <div className="jr-mgr-list">
                {managers.map((m, i) => (
                  <button key={m.id}
                    className={`jr-mgr-btn ${selManager?.id === m.id ? 'jr-mgr-active' : ''}`}
                    onClick={() => selectManager(m)}>
                    <div className="jr-mgr-av" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>{m.full_name?.[0]}</div>
                    <div>
                      <div className="jr-mgr-name">{m.full_name}</div>
                      <div className="jr-mgr-terr">{m.territory || '—'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Journey select */}
            {selManager && journeys.length > 0 && (
              <div className="jr-section">
                <div className="jr-sec-lbl">Select Journey</div>
                <div className="jr-journey-list">
                  {journeys.slice(0,8).map(j => (
                    <button key={j.id}
                      className={`jr-journey-btn ${selJourney?.id === j.id ? 'jr-jrny-active' : ''}`}
                      onClick={() => selectJourney(j)}>
                      <div className="jr-jrny-date">{fmtDate(j.date)}</div>
                      <div className="jr-jrny-meta">{j.total_visits} visits · {j.total_km} km · {j.status === 'active' ? '🔴 Live' : '✅ Done'}</div>
                      {j.suspicious_flags > 0 && <span className="jr-flag-badge">⚠️ {j.suspicious_flags} flags</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selManager && journeys.length === 0 && (
              <div className="jr-empty">No journeys recorded for this manager yet.</div>
            )}

            {/* Timeline */}
            {replayData && (
              <div className="jr-section jr-timeline-section">
                <div className="jr-sec-lbl">Route Timeline</div>
                <div className="jr-timeline">
                  {replayData.events.map((e, i) => {
                    const m = EVENT_META[e.type] || EVENT_META.visit
                    return (
                      <div key={i} className="jr-tl-item" onClick={() => {
                        setActiveEvent(e)
                        const loc = replayData.locations.find(l => l.timestamp >= e.time)
                        if (loc && mapInst.current) mapInst.current.setView([loc.latitude, loc.longitude], 16)
                      }}>
                        <div className="jr-tl-dot" style={{ background: m.color }}>{m.ico}</div>
                        <div className="jr-tl-body">
                          <div className="jr-tl-label">{e.label}</div>
                          {e.sub && <div className="jr-tl-sub">{e.sub}</div>}
                          <div className="jr-tl-time">{fmtTime(e.time)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Map + Controls */}
          <div className="jr-map-col">
            {/* Replay controls */}
            {replayData && (
              <div className="jr-controls">
                <div className="jr-ctrl-row">
                  <button className="jr-ctrl-btn" onClick={resetReplay}>⏮ Reset</button>
                  <button className={`jr-ctrl-play ${playing ? 'jr-ctrl-pause' : ''}`} onClick={togglePlay}>
                    {playing ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <div className="jr-speed-wrap">
                    <span>Speed:</span>
                    {[1,2,5,10].map(s => (
                      <button key={s} className={`jr-spd-btn ${speed === s ? 'jr-spd-active' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>
                    ))}
                  </div>
                </div>
                <div className="jr-progress-bar">
                  <div className="jr-progress-fill" style={{ width: `${progressPct}%` }}/>
                  <span className="jr-progress-lbl">{progressPct}% · {replayIdx}/{replayData.locations.length} points</span>
                </div>
                {activeEvent && (
                  <div className="jr-active-event" style={{ background: (EVENT_META[activeEvent.type] || EVENT_META.visit).bg }}>
                    <span>{(EVENT_META[activeEvent.type] || EVENT_META.visit).ico}</span>
                    <span style={{ color: (EVENT_META[activeEvent.type] || EVENT_META.visit).color, fontWeight: 700 }}>{activeEvent.label}</span>
                    {activeEvent.sub && <span className="jr-evt-sub">— {activeEvent.sub}</span>}
                    <span className="jr-evt-time">{fmtTime(activeEvent.time)}</span>
                  </div>
                )}
                {/* Journey summary */}
                <div className="jr-summary-row">
                  <div className="jr-sum-stat"><span className="jr-sum-val">{replayData.visits.length}</span><span className="jr-sum-lbl">Visits</span></div>
                  <div className="jr-sum-stat"><span className="jr-sum-val">{selJourney?.total_km} km</span><span className="jr-sum-lbl">Distance</span></div>
                  <div className="jr-sum-stat"><span className="jr-sum-val">{replayData.locations.length}</span><span className="jr-sum-lbl">GPS Pts</span></div>
                  {selJourney?.suspicious_flags > 0 && (
                    <div className="jr-sum-stat"><span className="jr-sum-val" style={{ color: '#EF4444' }}>{selJourney.suspicious_flags}</span><span className="jr-sum-lbl">⚠️ Flags</span></div>
                  )}
                </div>
              </div>
            )}
            <div ref={mapRef} className="jr-map" style={{ background: '#E5E7EB' }}>
              {!selJourney && (
                <div className="jr-map-placeholder">
                  <div className="jr-map-ph-ico">🗺️</div>
                  <div className="jr-map-ph-txt">{selManager ? 'Select a journey to load the map' : 'Select a manager first'}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

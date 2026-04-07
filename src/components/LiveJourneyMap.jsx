// -----------------------------------------------------------
// LIVE JOURNEY MAP — Real-time GPS tracking with route replay
// Features: live position, route polyline, visit markers,
//           idle detection, fake GPS flags, journey replay
// -----------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  addJourneyLocation, getIdleStatus, calcDistanceKm, calcTravelTime,
  getJourneyLocationsSync as getJourneyLocations
} from '../utils/supabaseDB'
import './LiveJourneyMap.css'

let L = null
const STOP_COLORS = ['#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#8B5CF6']

function loadLeaflet(cb) {
  if (window.L) { L = window.L; cb(); return }
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link')
    link.id = 'leaflet-css'; link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
  }
  if (!document.getElementById('leaflet-js')) {
    const s = document.createElement('script')
    s.id = 'leaflet-js'; s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload = () => { L = window.L; cb() }
    document.head.appendChild(s)
  } else {
    const check = setInterval(() => { if (window.L) { clearInterval(check); L = window.L; cb() } }, 200)
  }
}

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '--'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '--'

export default function LiveJourneyMap({ journey, visits, managerName, mode='live', onClose }) {
  const mapRef         = useRef(null)
  const mapInst        = useRef(null)
  const liveMarkerRef  = useRef(null)
  const routeLineRef   = useRef(null)
  const visitMarkersRef= useRef([])
  const intervalRef    = useRef(null)
  const replayRef      = useRef(null)
  const [mapReady,     setMapReady]     = useState(false)
  const [gpsCoords,    setGpsCoords]    = useState(null)
  const [idleInfo,     setIdleInfo]     = useState({idle:false,minutes:0})
  const [suspFlag,     setSuspFlag]     = useState(null)
  const [trackingOn,   setTrackingOn]   = useState(mode==='live')
  const [replayIdx,    setReplayIdx]    = useState(0)
  const [replayPlaying,setReplayPlaying]= useState(false)
  const [gpsError,     setGpsError]     = useState(null)
  const [locations,    setLocations]    = useState([])
  const [elapsed,      setElapsed]      = useState('')

  // Elapsed timer
  useEffect(() => {
    if (!journey?.start_time) return
    const tick = () => {
      const ms = Date.now() - new Date(journey.start_time)
      const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000)
      setElapsed(h>0?`${h}h ${m}m`:`${m}m`)
    }
    tick(); const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [journey?.start_time])

  // Load journey locations
  useEffect(() => {
    if (journey?.id) {
      const locs = getJourneyLocations(journey.id)
      setLocations(locs)
      if (journey.status==='active') {
        const idle = getIdleStatus(journey.id)
        setIdleInfo(idle)
      }
    }
  }, [journey?.id])

  // Init map
  useEffect(() => {
    loadLeaflet(() => {
      if (!mapRef.current || mapInst.current) return
      const lat = journey?.start_latitude || 19.076
      const lng = journey?.start_longitude || 72.877
      const map = L.map(mapRef.current, { zoomControl:true, attributionControl:false, preferCanvas: true })
      mapInst.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OSM' }).addTo(map)
      L.control.attribution({position:'bottomleft'}).addTo(map)
      map.setView([lat,lng], journey?.start_latitude ? 13 : 11)
      setTimeout(() => { if (map) map.invalidateSize() }, 300)
      setMapReady(true)
    })
    return () => {
      clearInterval(intervalRef.current)
      clearInterval(replayRef.current)
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
    }
  }, [])

  // Render map content whenever data changes
  useEffect(() => {
    if (mapReady && mapInst.current) renderAll()
  }, [mapReady, locations, visits, gpsCoords, mode, replayIdx])

  const renderAll = useCallback(() => {
    const map = mapInst.current
    if (!map || !L) return
    // Clear existing markers
    visitMarkersRef.current.forEach(m => m.remove())
    visitMarkersRef.current = []
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null }
    if (liveMarkerRef.current) { liveMarkerRef.current.remove(); liveMarkerRef.current = null }

    const allPts = []

    // Start marker
    if (journey?.start_latitude) {
      const ico = makePin('#2563EB','★',true)
      const m = L.marker([journey.start_latitude, journey.start_longitude],{icon:ico}).addTo(map)
        .bindPopup(`<div style="font-family:system-ui;padding:4px"><b style="color:#2563EB">🏢 Journey Start</b><br><small>${journey.start_location||''}</small><br><small>${fmtTime(journey.start_time)}</small></div>`)
      visitMarkersRef.current.push(m)
      allPts.push([journey.start_latitude, journey.start_longitude])
    }

    // GPS route line (from journey_locations)
    const displayLocs = mode==='replay' ? locations.slice(0, replayIdx+1) : locations
    if (displayLocs.length > 1) {
      const pts = displayLocs.map(l=>[l.latitude, l.longitude])
      routeLineRef.current = L.polyline(pts, { color:'#2563EB', weight:3, opacity:0.7, dashArray:'10,6', lineJoin:'round' }).addTo(map)
      allPts.push(...pts)
    }

    // Visit stop markers
    visits.forEach((v,i) => {
      if (!v.latitude || !v.longitude) return
      const color = STOP_COLORS[i%STOP_COLORS.length]
      const ico = makePin(color, String(i+1))
      const m = L.marker([v.latitude,v.longitude],{icon:ico}).addTo(map)
        .bindPopup(`<div style="font-family:system-ui;min-width:160px"><div style="background:${color};color:#fff;padding:5px 8px;border-radius:6px 6px 0 0;margin:-8px -8px 7px;font-weight:800;font-size:0.8rem">Stop #${i+1}</div><b>${v.client_name||v.customer_name}</b><br><small>📍 ${v.location||'—'}</small><br><small>${v.client_type} · ${fmtTime(v.created_at)}</small></div>`)
      visitMarkersRef.current.push(m)
      allPts.push([v.latitude, v.longitude])
    })

    // Live pulsing marker
    if (gpsCoords && mode==='live') {
      const html = `<div style="position:relative;width:20px;height:20px"><div style="position:absolute;inset:0;background:#2563EB;border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.5)"></div><div style="position:absolute;inset:-6px;border:2px solid rgba(37,99,235,0.3);border-radius:50%;animation:ping 1.5s infinite"></div></div>`
      const ico = L.divIcon({ className:'', html, iconSize:[20,20], iconAnchor:[10,10] })
      liveMarkerRef.current = L.marker([gpsCoords.lat, gpsCoords.lng], {icon:ico}).addTo(map)
        .bindPopup(`<b>📡 ${managerName||'You'}</b><br><small>${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}</small>`)
      allPts.push([gpsCoords.lat, gpsCoords.lng])
    }

    // Replay current position
    if (mode==='replay' && locations[replayIdx]) {
      const loc = locations[replayIdx]
      const html = `<div style="background:#7C3AED;width:18px;height:18px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(124,58,237,0.5)"></div>`
      const ico = L.divIcon({ className:'', html, iconSize:[18,18], iconAnchor:[9,9] })
      liveMarkerRef.current = L.marker([loc.latitude, loc.longitude], {icon:ico}).addTo(map)
      allPts.push([loc.latitude, loc.longitude])
    }

    // Fit bounds
    if (allPts.length > 1) {
      try { map.fitBounds(allPts, {padding:[40,40]}) } catch{}
    } else if (allPts.length===1) {
      map.setView(allPts[0], 14)
    }
  }, [journey, visits, locations, gpsCoords, mode, replayIdx, managerName])

  // Live GPS tracking (poll every 15s)
  useEffect(() => {
    if (!trackingOn || mode!=='live' || !journey?.status==='active') return
    const track = () => {
      navigator.geolocation?.getCurrentPosition(
        async pos => {
          const {latitude, longitude} = pos.coords
          setGpsCoords({lat:latitude, lng:longitude})
          setGpsError(null)
          if (journey?.id) {
            const result = addJourneyLocation(journey.id, journey.manager_id, latitude, longitude)
            if (result.is_suspicious) setSuspFlag(result.suspicious_reason)
            else setSuspFlag(null)
            const locs = getJourneyLocations(journey.id)
            setLocations(locs)
            const idle = getIdleStatus(journey.id)
            setIdleInfo(idle)
          }
        },
        err => setGpsError('GPS unavailable: ' + err.message),
        { enableHighAccuracy:true, timeout:10000, maximumAge:10000 }
      )
    }
    track()
    intervalRef.current = setInterval(track, 15000)
    return () => clearInterval(intervalRef.current)
  }, [trackingOn, journey?.id, mode])

  // Replay control
  const startReplay = () => {
    if (!locations.length) return
    setReplayIdx(0); setReplayPlaying(true)
    replayRef.current = setInterval(() => {
      setReplayIdx(prev => {
        if (prev >= locations.length-1) { clearInterval(replayRef.current); setReplayPlaying(false); return prev }
        return prev+1
      })
    }, 800)
  }
  const stopReplay = () => { clearInterval(replayRef.current); setReplayPlaying(false) }

  // Suspicious flags count
  const suspCount = locations.filter(l=>l.is_suspicious).length

  // Total km
  const totalKm = (() => {
    if (journey?.total_km) return journey.total_km
    let km=0
    for(let i=1;i<locations.length;i++) km+=calcDistanceKm(locations[i-1].latitude,locations[i-1].longitude,locations[i].latitude,locations[i].longitude)
    return Math.round(km*10)/10
  })()

  return (
    <div className="ljm-wrap">
      {/* Header */}
      <div className="ljm-header">
        <div className="ljm-hdr-left">
          <div className="ljm-hdr-ico" style={{background:mode==='replay'?'#7C3AED':'#2563EB'}}>
            {mode==='replay' ? '⏮' : '🗺️'}
          </div>
          <div>
            <div className="ljm-title">{mode==='replay' ? 'Journey Replay' : 'Live Journey Map'}</div>
            <div className="ljm-sub">
              {managerName} ·
              {journey?.status==='active' ? <span className="ljm-live-badge">● LIVE</span> : <span className="ljm-done-badge">✓ {fmtDate(journey?.end_time)}</span>}
              {elapsed && <span style={{marginLeft:6,color:'#6B7280'}}>· {elapsed}</span>}
            </div>
          </div>
        </div>
        <button className="ljm-close" onClick={onClose}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Close
        </button>
      </div>

      {/* Alert banners */}
      {idleInfo.idle && (
        <div className="ljm-alert ljm-alert-warn">
          ⏸ Idle for {idleInfo.minutes} min — no movement detected
        </div>
      )}
      {suspFlag && (
        <div className="ljm-alert ljm-alert-danger">
          🚨 Suspicious GPS: {suspFlag}
        </div>
      )}

      {/* Map */}
      <div className="ljm-map-area">
        <div ref={mapRef} style={{height:'100%',width:'100%'}}/>
        {!mapReady && (
          <div className="ljm-loading">
            <div className="ljm-spinner"/>
            <span>Loading map…</span>
          </div>
        )}
        {mapReady && journey?.status==='active' && (
          <div className="ljm-gps-pill" style={{background:trackingOn?'#ECFDF5':'#FEF2F2',borderColor:trackingOn?'#A7F3D0':'#FECACA'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:trackingOn?'#10B981':'#EF4444',display:'inline-block',animation:trackingOn?'pulse 1.5s infinite':'none'}}/>
            <span style={{color:trackingOn?'#059669':'#DC2626',fontSize:'0.7rem',fontWeight:700}}>
              {trackingOn ? 'GPS Tracking ON' : 'Tracking Paused'}
            </span>
            <button className="ljm-gps-toggle" onClick={()=>setTrackingOn(t=>!t)}>
              {trackingOn ? 'Pause' : 'Resume'}
            </button>
          </div>
        )}
        {gpsError && <div className="ljm-gps-error">⚠️ {gpsError}</div>}
      </div>

      {/* Stats bar */}
      <div className="ljm-stats">
        {[
          {ico:'📍', v:visits.length,    l:'Stops'},
          {ico:'🛣️', v:`${totalKm} km`,  l:'Distance'},
          {ico:'📡', v:locations.length, l:'GPS Points'},
          {ico:'⏱️', v:elapsed||'—',     l:'Duration'},
          ...(suspCount>0 ? [{ico:'🚨', v:suspCount, l:'Flags', warn:true}] : []),
        ].map((s,i)=>(
          <div key={i} className={`ljm-stat ${s.warn?'ljm-stat-warn':''}`}>
            <span className="ljm-stat-ico">{s.ico}</span>
            <div>
              <div className="ljm-stat-val">{s.v}</div>
              <div className="ljm-stat-lbl">{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Replay controls */}
      {mode==='replay' && locations.length>0 && (
        <div className="ljm-replay-bar">
          <button className={`ljm-replay-btn ${replayPlaying?'ljm-replay-stop':''}`} onClick={replayPlaying?stopReplay:startReplay}>
            {replayPlaying
              ? <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="3" height="8" fill="currentColor"/><rect x="7" y="2" width="3" height="8" fill="currentColor"/></svg> Pause</>
              : <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg> Play Replay</>
            }
          </button>
          <div className="ljm-replay-progress">
            <input type="range" min={0} max={locations.length-1} value={replayIdx} onChange={e=>setReplayIdx(+e.target.value)} className="ljm-replay-slider"/>
            <div className="ljm-replay-time">
              {locations[replayIdx] ? fmtTime(locations[replayIdx].timestamp) : '--'}
              <span style={{color:'#9CA3AF'}}>  ({replayIdx+1}/{locations.length})</span>
            </div>
          </div>
          <button className="ljm-replay-reset" onClick={()=>{stopReplay();setReplayIdx(0)}}>↺</button>
        </div>
      )}

      {/* Timeline */}
      {visits.length > 0 && (
        <div className="ljm-timeline">
          <div className="ljm-tl-header">Route Timeline</div>
          <div className="ljm-tl-item">
            <div className="ljm-tl-dot" style={{background:'#2563EB',fontSize:'0.6rem'}}>★</div>
            <div className="ljm-tl-body">
              <div className="ljm-tl-name">Journey Start</div>
              <div className="ljm-tl-meta">📍 {journey?.start_location?.split(',')[0]||'Starting Point'}</div>
            </div>
            <div className="ljm-tl-time">{fmtTime(journey?.start_time)}</div>
          </div>
          {visits.map((v,i)=>(
            <div key={v.id} className="ljm-tl-item">
              <div className="ljm-tl-dot" style={{background:STOP_COLORS[i%STOP_COLORS.length]}}>{i+1}</div>
              <div className="ljm-tl-body">
                <div className="ljm-tl-name">{v.client_name||v.customer_name}</div>
                <div className="ljm-tl-meta">
                  <span className="ljm-tl-tag">{v.client_type}</span>
                  {v.location?.split(',')[0]}
                </div>
              </div>
              <div className="ljm-tl-time">{fmtTime(v.created_at)}</div>
            </div>
          ))}
          {journey?.status==='completed' && journey.end_location && (
            <div className="ljm-tl-item">
              <div className="ljm-tl-dot" style={{background:'#6B7280',fontSize:'0.6rem'}}>■</div>
              <div className="ljm-tl-body">
                <div className="ljm-tl-name">Journey End</div>
                <div className="ljm-tl-meta">📍 {journey.end_location?.split(',')[0]||'End Point'}</div>
              </div>
              <div className="ljm-tl-time">{fmtTime(journey.end_time)}</div>
            </div>
          )}
        </div>
      )}

      {/* GPS Coords panel */}
      {gpsCoords && mode==='live' && (
        <div className="ljm-coords">
          <span className="ljm-coords-label">Current Position</span>
          <span className="ljm-coords-val">{gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}</span>
        </div>
      )}
    </div>
  )
}

function makePin(color, label, isStart=false) {
  const s = isStart ? 38 : 30
  return L?.divIcon({
    className:'',
    html:`<div style="position:relative;width:${s}px;height:${s}px">
      <div style="width:100%;height:100%;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.25)"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-62%);color:#fff;font-weight:900;font-size:${isStart?13:11}px;font-family:system-ui">${label}</div>
    </div>`,
    iconSize:[s,s], iconAnchor:[s/2,s], popupAnchor:[0,-s]
  })
}

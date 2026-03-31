import { useEffect, useRef, useState } from 'react'
import { calcDistanceKm, calcTravelTime } from '../utils/supabaseDB'
import { createVisitDraft, validateVisitDraft } from '../utils/visitRequirements'
import './JourneyMap.css'

let L = null
const STOP_COLORS = ['#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#84CC16','#8B5CF6','#34D399']
const CLIENT_TYPES = ['Retailer','Distributor','Wholesaler','Dealer','Direct Customer','Other']
const VISIT_TYPES  = ['Field Visit','Sales Visit','Service Visit','Demo Visit','Follow-up','Other']

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '--'

export default function JourneyMap({ journey, visits, onVisitLogged, onClose, managerName }) {
  const mapRef         = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef     = useRef([])
  const polylineRef    = useRef(null)
  const [mapReady,   setMapReady]   = useState(false)
  const [locating,   setLocating]   = useState(false)
  const [currentPos, setCurrentPos] = useState(null)
  const [showForm,   setShowForm]   = useState(false)
  const [formError,  setFormError]  = useState('')
  const [isOnline,   setIsOnline]   = useState(navigator.onLine)
  const [photoPreview,  setPhotoPreview]  = useState(null)
  // Voice note — optional
  const [isRecording,   setIsRecording]   = useState(false)
  const [voiceNote,     setVoiceNote]     = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [recordTimer,   setRecordTimer]   = useState(null)
  const [form, setForm] = useState(() => {
    const draft = createVisitDraft()
    return {
      client_name: draft.customer_name,
      contact_person: draft.contact_person,
      contact_phone: draft.contact_phone,
      client_type: draft.client_type,
      location: draft.location,
      visit_type: draft.visit_type,
      notes: draft.notes,
      latitude: draft.latitude,
      longitude: draft.longitude,
      photo: draft.photo,
      voice_note: draft.voice_note,
    }
  })

  // Online/offline listener
  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Load Leaflet CSS
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
  }, [])

  // Init map
  useEffect(() => {
    const tryInit = () => {
      if (window.L) { L = window.L; initMap() }
      else if (!document.getElementById('leaflet-js')) {
        const s = document.createElement('script')
        s.id = 'leaflet-js'; s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        s.onload = () => { L = window.L; initMap() }
        document.head.appendChild(s)
      } else setTimeout(tryInit, 200)
    }
    tryInit()
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [])

  const initMap = () => {
    if (!mapRef.current || mapInstanceRef.current) return
    const lat = journey?.start_latitude || 20.5937
    const lng = journey?.start_longitude || 78.9629
    const map = L.map(mapRef.current, { zoomControl: true })
    mapInstanceRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution:'© OpenStreetMap contributors', maxZoom:19 }).addTo(map)
    map.setView([lat, lng], journey?.start_latitude ? 14 : 5)
    setMapReady(true)
  }

  useEffect(() => {
    if (mapReady && mapInstanceRef.current) renderMap()
  }, [mapReady, visits, journey, currentPos])

  const renderMap = () => {
    const map = mapInstanceRef.current
    if (!map || !L) return
    markersRef.current.forEach(m => m.remove()); markersRef.current = []
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null }
    const pts = []

    // Start marker
    if (journey?.start_latitude) {
      const icon = makeIcon(0, '#2563EB', '★', true)
      const m = L.marker([journey.start_latitude, journey.start_longitude], {icon}).addTo(map)
        .bindPopup(`<div style="font-family:system-ui;min-width:160px;padding:4px">
          <b style="color:#2563EB">🏢 Journey Start</b><br>
          <small style="color:#6B7280">${journey.start_location||'Starting Point'}</small><br>
          <small style="color:#9CA3AF">⏰ ${fmtTime(journey.start_time)}</small>
        </div>`)
      markersRef.current.push(m)
      pts.push([journey.start_latitude, journey.start_longitude])
    }

    // Visit markers
    visits.forEach((v,i) => {
      if (!v.latitude || !v.longitude) return
      const prev = pts.length > 0 ? pts[pts.length-1] : null
      const dist = prev ? calcDistanceKm(prev[0],prev[1],v.latitude,v.longitude) : 0
      const color = STOP_COLORS[i % STOP_COLORS.length]
      const icon  = makeIcon(i+1, color, String(i+1))
      const m = L.marker([v.latitude,v.longitude],{icon}).addTo(map)
        .bindPopup(`<div style="font-family:system-ui;min-width:190px">
          <div style="background:${color};color:#fff;padding:6px 10px;border-radius:6px 6px 0 0;margin:-8px -8px 8px;font-weight:800;font-size:0.82rem">Stop #${i+1} · ${v.client_name}</div>
          <small>📍 ${v.location}</small><br>
          <small style="color:#6B7280">${v.client_type} · ${v.visit_type}</small>
          ${dist>0?`<br><small style="color:#7C3AED">🛣️ ${dist.toFixed(1)}km · ${calcTravelTime(dist)}</small>`:''}
          ${v.notes?`<br><small><i>💬 "${v.notes}"</i></small>`:''}
          <br><small style="color:#9CA3AF">⏰ ${fmtTime(v.created_at)}</small>
        </div>`)
      markersRef.current.push(m)
      pts.push([v.latitude, v.longitude])
    })

    // Live position
    if (currentPos) {
      const icon = L.divIcon({
        className:'',
        html:`<div style="width:16px;height:16px;background:#2563EB;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(37,99,235,0.2)"></div>`,
        iconSize:[16,16], iconAnchor:[8,8]
      })
      const m = L.marker([currentPos.lat,currentPos.lng],{icon}).addTo(map)
        .bindPopup('<b>📡 Your Current Location</b>')
      markersRef.current.push(m)
    }

    // Route polyline
    if (pts.length > 1) {
      polylineRef.current = L.polyline(pts, {
        color:'#2563EB', weight:3, opacity:0.65,
        dashArray:'10,7', lineJoin:'round'
      }).addTo(map)
      map.fitBounds(polylineRef.current.getBounds(), {padding:[48,48]})
    } else if (pts.length === 1) {
      map.setView(pts[0], 14)
    }
  }

  const makeIcon = (num, color, label, isStart=false) => {
    const s = isStart ? 38 : 32
    return L?.divIcon({
      className:'',
      html:`<div style="position:relative;width:${s}px;height:${s}px">
        <div style="width:100%;height:100%;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.25)"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-62%);color:#fff;font-weight:900;font-size:${isStart?13:11}px;font-family:system-ui">${label}</div>
      </div>`,
      iconSize:[s,s], iconAnchor:[s/2,s], popupAnchor:[0,-s]
    })
  }

  const getLocation = () => {
    setLocating(true)
    navigator.geolocation?.getCurrentPosition(
      async p => {
        const c = {lat:p.coords.latitude, lng:p.coords.longitude}
        setCurrentPos(c)
        setForm(f=>({...f, latitude:c.lat, longitude:c.lng, location:`${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`}))
        mapInstanceRef.current?.setView([c.lat,c.lng],15)
        setLocating(false)
        try {
          const d = await (await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${c.lat}&lon=${c.lng}&format=json`)).json()
          const addr = d.display_name?.split(',').slice(0,3).join(', ')
          if (addr) setForm(f=>({...f, location:addr}))
        } catch {}
      },
      () => setLocating(false),
      {enableHighAccuracy:true, timeout:10000}
    )
  }

  const submitVisit = () => {
    setFormError('')
    const validationError = validateVisitDraft({ ...form, customer_name: form.client_name })
    if (validationError) { setFormError(validationError); return }
    onVisitLogged({...form})
    setForm({
      client_name:'', contact_person:'', contact_phone:'', client_type:'Retailer', location:'',
      visit_type:'Field Visit', notes:'', latitude:null, longitude:null, photo:null, voice_note:null
    })
    setPhotoPreview(null)
    setVoiceNote(null)
    setShowForm(false); setCurrentPos(null)
  }

  const capturePhoto = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = e => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        setForm(f => ({ ...f, photo: ev.target.result }))
        setPhotoPreview(ev.target.result)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  // ── Voice note recording ─────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onload = ev => {
          setVoiceNote(ev.target.result)
          setForm(f => ({ ...f, voice_note: ev.target.result }))
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(t => t.stop())
      }
      rec.start()
      setMediaRecorder(rec)
      setIsRecording(true)
      setRecordingTime(0)
      const timer = setInterval(() => setRecordingTime(t => {
        if (t >= 60) { rec.stop(); clearInterval(timer); setIsRecording(false); return t }
        return t + 1
      }), 1000)
      setRecordTimer(timer)
    } catch { setFormError('Microphone access denied') }
  }
  const stopRecording = () => {
    if (mediaRecorder) mediaRecorder.stop()
    setIsRecording(false)
    if (recordTimer) { clearInterval(recordTimer); setRecordTimer(null) }
  }
  const clearVoiceNote = () => {
    setVoiceNote(null)
    setForm(f => ({ ...f, voice_note: null }))
  }

  const visitsWithDist = visits.map((v,i) => {
    const pl = i===0 ? journey?.start_latitude  : visits[i-1]?.latitude
    const pn = i===0 ? journey?.start_longitude : visits[i-1]?.longitude
    const dist = (pl && v.latitude) ? calcDistanceKm(pl,pn,v.latitude,v.longitude) : null
    return {...v, dist, travel: dist ? calcTravelTime(dist) : null}
  })
  const totalKm = visitsWithDist.reduce((s,v)=>s+(v.dist||0), 0)

  return (
    <div className="jmap-wrap">

      {/* -- Header -- */}
      <div className="jmap-header">
        <div className="jmap-hdr-left">
          <div className="jmap-hdr-ico">🗺️</div>
          <div>
            <div className="jmap-hdr-title">Journey Map</div>
            <div className="jmap-hdr-sub">
              {journey
                ? `${managerName||'Field'} · ${visits.length} stops · ${totalKm.toFixed(1)} km`
                : 'Start a journey to enable live tracking'}
            </div>
          </div>
        </div>
        <button className="jmap-close" onClick={onClose}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Close
        </button>
      </div>

      {/* -- Map -- */}
      <div className="jmap-map" style={{position:'relative'}}>
        <div ref={mapRef} style={{height:'100%',width:'100%'}}/>

        {/* Loading overlay */}
        {!mapReady && (
          <div style={{position:'absolute',inset:0,background:'#F5F7FB',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,zIndex:10}}>
            <div style={{width:32,height:32,border:'3px solid #E5E7EB',borderTopColor:'#2563EB',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
            <div style={{fontSize:'0.84rem',color:'#6B7280',fontFamily:'var(--font)'}}>Loading map…</div>
          </div>
        )}

        {/* GPS indicator */}
        {mapReady && journey && (
          <div className="jmap-gps-chip">
            <span className="jmap-gps-dot"/>
            <span className="jmap-gps-txt">GPS Active</span>
          </div>
        )}

        {/* Offline warning */}
        {!isOnline && (
          <div className="jmap-net-offline">
            ⚠️ Offline — map tiles may not load
          </div>
        )}
      </div>

      {/* -- Stats bar -- */}
      {journey && (
        <div className="jmap-stats">
          <div className="jmap-stat">
            <span className="jmap-stat-ico">📍</span>
            <div><div className="jmap-stat-val">{visits.length}</div><div className="jmap-stat-lbl">Stops</div></div>
          </div>
          <div className="jmap-stat">
            <span className="jmap-stat-ico">🛣️</span>
            <div><div className="jmap-stat-val">{totalKm.toFixed(1)} km</div><div className="jmap-stat-lbl">Distance</div></div>
          </div>
          <div className="jmap-stat">
            <span className="jmap-stat-ico">⏰</span>
            <div><div className="jmap-stat-val">{fmtTime(journey.start_time)}</div><div className="jmap-stat-lbl">Started</div></div>
          </div>
          <div className="jmap-stat">
            <span className="jmap-stat-ico">⏱️</span>
            <div>
              <div className="jmap-stat-val" style={{color:'#10B981'}}>Live</div>
              <div className="jmap-stat-lbl">Status</div>
            </div>
          </div>
        </div>
      )}

      {/* -- Log Visit Panel -- */}
      {journey && (
        <div className="jmap-log-panel">
          {/* ── Live stop counter ── */}
          {visits.length > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px 0',flexWrap:'wrap'}}>
              {visits.map((v,i) => (
                <div key={v.id||i} style={{
                  display:'flex',alignItems:'center',justifyContent:'center',
                  width:26,height:26,borderRadius:'50%',
                  background:STOP_COLORS[i%STOP_COLORS.length],
                  color:'#fff',fontWeight:800,fontSize:'0.72rem',
                  flexShrink:0,cursor:'default',
                  title:v.client_name,
                  boxShadow:'0 2px 6px rgba(0,0,0,0.15)',
                }}
                title={`Stop ${i+1}: ${v.client_name||'Unknown'}`}
                >{i+1}</div>
              ))}
              <div style={{fontSize:'0.65rem',color:'#9CA3AF',fontWeight:600,marginLeft:2}}>
                {visits.length} stop{visits.length!==1?'s':''} logged
              </div>
            </div>
          )}
          {!showForm ? (
            <button className="jmap-log-btn" onClick={() => { setShowForm(true); getLocation() }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Log Stop #{visits.length + 1}
            </button>
          ) : (
            <>
              <div className="jmap-log-title">📍 Log Stop #{visits.length + 1}</div>
              {formError && (
                <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'var(--r-sm)',padding:'8px 11px',fontSize:'0.76rem',color:'#EF4444',fontWeight:600,marginBottom:10}}>
                  ⚠️ {formError}
                </div>
              )}
              <div className="jmap-form-row">
                <div className="jmap-fg">
                  <label>Customer Name *</label>
                  <input value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} placeholder="e.g. ABC Distributors" autoFocus/>
                </div>
                <div className="jmap-fg">
                  <label>Nature of Business *</label>
                  <select value={form.client_type} onChange={e=>setForm(f=>({...f,client_type:e.target.value}))}>
                    {CLIENT_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="jmap-form-row">
                <div className="jmap-fg">
                  <label>Contact Person *</label>
                  <input value={form.contact_person} onChange={e=>setForm(f=>({...f,contact_person:e.target.value}))} placeholder="Owner / Contact person"/>
                </div>
                <div className="jmap-fg">
                  <label>Contact Phone *</label>
                  <input value={form.contact_phone} onChange={e=>setForm(f=>({...f,contact_phone:e.target.value}))} placeholder="+91 9876543210"/>
                </div>
              </div>
              <div className="jmap-fg" style={{marginBottom:8}}>
                <label>Address *</label>
                <div style={{display:'flex',gap:6}}>
                  <input
                    value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                    placeholder="Area or address" style={{flex:1}}
                  />
                  <button
                    onClick={getLocation} disabled={locating}
                    style={{background:locating?'#F3F4F6':'#EFF6FF',border:'1.5px solid #BFDBFE',borderRadius:'var(--r-sm)',padding:'0 12px',cursor:'pointer',color:'#2563EB',fontWeight:700,fontSize:'0.78rem',flexShrink:0,fontFamily:'var(--font)',transition:'all 0.12s',transform:'none'}}
                  >
                    {locating ? '⏳' : '📡'} GPS
                  </button>
                </div>
                {form.latitude && (
                  <div style={{fontSize:'0.62rem',color:'#10B981',marginTop:3,fontFamily:'var(--font-mono)'}}>
                    ✓ GPS: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                  </div>
                )}
              </div>
              <div className="jmap-form-row" style={{marginBottom:8}}>
                <div className="jmap-fg">
                  <label>Visit Type</label>
                  <select value={form.visit_type} onChange={e=>setForm(f=>({...f,visit_type:e.target.value}))}>
                    {VISIT_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                {visits.length>0 && form.latitude && (
                  <div className="jmap-fg" style={{justifyContent:'flex-end'}}>
                    <label>Distance from last</label>
                    <div style={{background:'#F5F3FF',border:'1px solid #DDD6FE',borderRadius:'var(--r-sm)',padding:'9px 10px',fontSize:'0.76rem',fontWeight:700,color:'#7C3AED',fontFamily:'var(--font-mono)'}}>
                      {calcDistanceKm(visits[visits.length-1].latitude,visits[visits.length-1].longitude,form.latitude,form.longitude).toFixed(1)} km
                    </div>
                  </div>
                )}
              </div>
              <div className="jmap-fg" style={{marginBottom:10}}>
                <label>Notes / Outcome</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Orders placed, discussions, outcomes…" rows={2}/>
              </div>
              <div className="jmap-fg" style={{marginBottom:10}}>
                <label>Visit Photo *</label>
                {photoPreview ? (
                  <div style={{position:'relative',borderRadius:'var(--r-sm)',overflow:'hidden',border:'1.5px solid #E5E7EB'}}>
                    <img src={photoPreview} alt="Visit" style={{width:'100%',height:150,objectFit:'cover',display:'block'}}/>
                    <button onClick={() => { setForm(f=>({...f,photo:null})); setPhotoPreview(null) }} style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.65)',border:'none',borderRadius:'50%',width:26,height:26,color:'#fff',cursor:'pointer'}}>×</button>
                  </div>
                ) : (
                  <button onClick={capturePhoto} style={{background:'#F9FAFB',border:'1.5px dashed #D1D5DB',borderRadius:'var(--r-sm)',padding:'12px',cursor:'pointer',fontWeight:700,color:'#374151',width:'100%'}}>
                    Take / Upload Visit Photo
                  </button>
                )}
              </div>
              {/* ── Voice Note (optional) ── */}
              <div className="jmap-fg" style={{marginBottom:10}}>
                <label>Voice Note <span style={{fontWeight:400,color:'#9CA3AF',fontSize:'0.62rem'}}>(optional)</span></label>
                {voiceNote ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'#F0FDF4',border:'1.5px solid #6EE7B7',borderRadius:'var(--r-sm)'}}>
                    <span style={{fontSize:'1rem'}}>🎤</span>
                    <audio controls src={voiceNote} style={{flex:1,height:30}}/>
                    <button onClick={clearVoiceNote} style={{background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:'1rem',padding:2}}>✕</button>
                  </div>
                ) : isRecording ? (
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'#FEF2F2',border:'1.5px solid #FECACA',borderRadius:'var(--r-sm)'}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:'#EF4444',animation:'pulse 1s infinite',display:'inline-block'}}/>
                    <span style={{flex:1,fontSize:'0.8rem',fontWeight:700,color:'#DC2626'}}>Recording… {recordingTime}s / 60s</span>
                    <button onClick={stopRecording} style={{background:'#EF4444',border:'none',borderRadius:6,padding:'5px 12px',color:'#fff',fontWeight:700,fontSize:'0.75rem',cursor:'pointer',fontFamily:'inherit'}}>Stop</button>
                  </div>
                ) : (
                  <button onClick={startRecording} style={{width:'100%',padding:'10px',border:'1.5px dashed #D1D5DB',borderRadius:'var(--r-sm)',background:'#F9FAFB',color:'#374151',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:'0.8rem',fontWeight:600,fontFamily:'inherit'}}>
                    🎤 Record Voice Note (optional)
                  </button>
                )}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:8}}>
                <button
                  onClick={() => {
                    setShowForm(false)
                    setFormError('')
                    setPhotoPreview(null)
                    setVoiceNote(null)
                    setForm({
                      client_name:'', contact_person:'', contact_phone:'', client_type:'Retailer', location:'',
                      visit_type:'Field Visit', notes:'', latitude:null, longitude:null, photo:null, voice_note:null
                    })
                  }}
                  style={{background:'#F3F4F6',border:'1.5px solid #E5E7EB',borderRadius:'var(--r-md)',padding:'11px',fontWeight:700,cursor:'pointer',fontFamily:'var(--font)',color:'#374151',transform:'none',boxShadow:'none'}}
                >
                  Cancel
                </button>
                <button className="jmap-log-btn" onClick={submitVisit}>
                  ✅ Log Stop #{visits.length + 1}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* -- Timeline -- */}
      {visitsWithDist.length > 0 && (
        <div className="jmap-timeline">
          <div className="jmap-tl-hdr">Journey Timeline — {visits.length} {visits.length===1?'stop':'stops'}</div>

          {/* Start entry */}
          <div className="jmap-tl-item">
            <div className="jmap-tl-dot" style={{background:'#2563EB',fontSize:'0.6rem'}}>★</div>
            <div className="jmap-tl-body">
              <div className="jmap-tl-name">Journey Start</div>
              <div className="jmap-tl-meta">📍 {journey?.start_location?.split(',')[0]||'Starting Point'}</div>
            </div>
            <div className="jmap-tl-time">{fmtTime(journey?.start_time)}</div>
          </div>

          {visitsWithDist.map((v,i) => (
            <div key={v.id} className="jmap-tl-item">
              <div className="jmap-tl-dot" style={{background:STOP_COLORS[i%STOP_COLORS.length]}}>{i+1}</div>
              <div className="jmap-tl-body">
                <div className="jmap-tl-name">{v.client_name}</div>
                <div className="jmap-tl-meta">
                  <span style={{background:'#EFF6FF',color:'#2563EB',fontSize:'0.6rem',fontWeight:700,padding:'1px 6px',borderRadius:'99px'}}>{v.client_type}</span>
                  {' '}{v.location?.split(',')[0]}
                  {v.dist!=null && <span style={{color:'#7C3AED',marginLeft:4}}>· {v.dist.toFixed(1)}km</span>}
                </div>
                {v.notes && <div style={{fontSize:'0.65rem',color:'#6B7280',marginTop:2}}>💬 {v.notes}</div>}
              </div>
              <div className="jmap-tl-time">{fmtTime(v.created_at)}</div>
            </div>
          ))}

          {/* Summary row */}
          {totalKm > 0 && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',background:'#F8FAFD',borderTop:'1px solid #E5E7EB',padding:'10px 16px',gap:1}}>
              {[
                {v:visits.length,l:'Stops'},
                {v:`${totalKm.toFixed(1)} km`,l:'Distance'},
                {v:calcTravelTime(totalKm),l:'Est. Drive'}
              ].map(s=>(
                <div key={s.l} style={{textAlign:'center'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem',fontWeight:700,color:'#111827'}}>{s.v}</div>
                  <div style={{fontSize:'0.58rem',color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:600,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -- No journey state -- */}
      {!journey && (
        <div className="jmap-error">
          <div className="jmap-error-ico">🚗</div>
          <div className="jmap-error-msg">No active journey.<br/>Start a journey from the Home tab to enable GPS tracking and route mapping.</div>
          <span className="jmap-error-link" onClick={onClose}>← Back to Dashboard</span>
        </div>
      )}
    </div>
  )
}

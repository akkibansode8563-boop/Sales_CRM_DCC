import { useEffect, useRef, memo } from 'react'

/* Uses vanilla leaflet (already in deps) — avoids react-leaflet peer dep issues */
const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316']
const STATUS_COLORS = {
  'On Field': '#10B981', 'In-Office': '#2563EB', 'Travel': '#7C3AED',
  'Lunch Break': '#F59E0B', 'Meeting': '#EC4899', 'Work From Home': '#6B7280'
}

export default memo(function LiveManagerMap({ managers = [] }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    if (mapInstanceRef.current) return
    if (typeof window === 'undefined') return

    import('leaflet').then(L => {
      // Fix leaflet icon paths
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current, {
        center: [19.076, 72.8777], // Mumbai default
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: true
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map)

      mapInstanceRef.current = { map, L }
    })

    return () => {
      if (mapInstanceRef.current?.map) {
        mapInstanceRef.current.map.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current) return
    const { map, L } = mapInstanceRef.current

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const validManagers = managers.filter(m => m.last_gps?.lat || m.last_location?.lat)
    if (validManagers.length === 0) return

    const bounds = []

    validManagers.forEach((m, i) => {
      const gps = m.last_gps || m.last_location
      if (!gps?.lat) return

      const color = STATUS_COLORS[m.status] || '#6B7280'
      const initial = (m.name || '?')[0].toUpperCase()

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:${color};border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:800;font-size:14px;
          position:relative;cursor:pointer;
        ">
          ${initial}
          ${m.active_journey ? `<span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:#10B981;border-radius:50%;border:2px solid #fff;animation:pulse 1.5s infinite;"></span>` : ''}
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
      })

      const lat = parseFloat(gps.lat)
      const lng = parseFloat(gps.lng || gps.longitude || 0)
      if (isNaN(lat) || isNaN(lng)) return

      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="min-width:160px;font-family:sans-serif">
            <div style="font-weight:800;font-size:0.88rem;color:#111827;margin-bottom:4px">${m.name}</div>
            <div style="font-size:0.72rem;color:#6B7280;margin-bottom:6px">${m.territory || 'No territory'}</div>
            <div style="display:inline-block;padding:3px 8px;border-radius:99px;font-size:0.68rem;font-weight:700;
              background:${color}22;color:${color};">${m.status}</div>
            <div style="margin-top:8px;font-size:0.72rem;color:#374151">
              <div>Visits today: <strong>${m.visits_today || 0}</strong></div>
              <div>Sales: <strong>₹${Number(m.today_sales||0).toLocaleString('en-IN')}</strong></div>
            </div>
          </div>
        `)

      markersRef.current.push(marker)
      bounds.push([lat, lng])
    })

    if (bounds.length > 0) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 }) } catch(e) {}
    }
  }, [managers])

  return (
    <div style={{position:'relative'}}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
      <div ref={mapRef} style={{width:'100%', height:340, borderRadius:'0 0 12px 12px', zIndex:1}}/>
      {managers.length === 0 && (
        <div style={{
          position:'absolute', inset:0, display:'flex', alignItems:'center',
          justifyContent:'center', background:'rgba(249,250,251,0.9)', borderRadius:12,
          flexDirection:'column', gap:8, zIndex:10
        }}>
          <div style={{fontSize:'2rem', opacity:0.4}}>&#x1F5FA;</div>
          <div style={{fontSize:'0.83rem', color:'#6B7280', fontWeight:600}}>No active managers with GPS data</div>
          <div style={{fontSize:'0.72rem', color:'#9CA3AF'}}>Managers appear here once they start a journey</div>
        </div>
      )}
    </div>
  )
})

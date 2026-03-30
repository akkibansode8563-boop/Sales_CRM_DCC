import { useEffect, useMemo, useRef, useState } from 'react'
import {
  calcDistanceKm,
  calcTravelTime,
  getAllVisitsAllSync as getAllVisitsAll,
  getJourneyHistorySync as getJourneyHistory,
  getJourneyLocationsSync as getJourneyLocations,
  getTerritoryStatsSync as getTerritoryStats,
  getUsersSync as getUsers,
} from '../utils/supabaseDB'
import './SalesHeatmap.css'

let L = null
const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316']
const TERRITORY_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316','#84CC16','#8B5CF6']

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : '--'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '--'
const minutesBetween = (from, to) => {
  if (!from || !to) return 0
  return Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000))
}

async function loadLeaflet() {
  if (window.L) { L = window.L; return L }
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link')
    link.id = 'leaflet-css'
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
  }
  const mod = await import('leaflet')
  L = mod.default || mod
  window.L = L
  return L
}

function buildJourneyCollections(managers, managerId = null) {
  const scopedManagers = managerId ? managers.filter(m => m.id === managerId) : managers
  const allVisits = (getAllVisitsAll() || []).filter(v => v?.latitude && v?.longitude)

  return scopedManagers.flatMap((manager, managerIndex) => {
    const journeys = (getJourneyHistory(manager.id) || [])
      .slice()
      .sort((a, b) => new Date(b.start_time || b.created_at || 0) - new Date(a.start_time || a.created_at || 0))

    return journeys.map((journey, journeyIndex) => {
      const journeyVisits = allVisits
        .filter(v => v.manager_id === manager.id && v.visit_date === journey.date)
        .slice()
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))

      const gpsTrail = (getJourneyLocations(journey.id) || [])
        .filter(point => point?.latitude && point?.longitude)
        .map(point => ({
          id: `gps-${journey.id}-${point.id}`,
          lat: Number(point.latitude),
          lng: Number(point.longitude),
          time: point.timestamp,
        }))

      const points = []
      let previousPoint = null

      if (journey.start_latitude && journey.start_longitude) {
        previousPoint = {
          id: `start-${journey.id}`,
          type: 'start',
          lat: Number(journey.start_latitude),
          lng: Number(journey.start_longitude),
          time: journey.start_time,
          label: 'Journey Start',
          location: journey.start_location || 'Starting Point',
          customerName: journey.start_location || 'Starting Point',
          distanceFromPreviousKm: 0,
          timeTakenMinutes: 0,
        }
        points.push(previousPoint)
      }

      journeyVisits.forEach((visit, visitIndex) => {
        const visitLat = Number(visit.latitude)
        const visitLng = Number(visit.longitude)
        const distanceFromPreviousKm = previousPoint ? calcDistanceKm(previousPoint.lat, previousPoint.lng, visitLat, visitLng) : 0
        const timeTakenMinutes = previousPoint ? minutesBetween(previousPoint.time, visit.created_at) : 0
        const visitPoint = {
          id: `visit-${journey.id}-${visit.id}`,
          type: 'visit',
          visitNumber: visitIndex + 1,
          lat: visitLat,
          lng: visitLng,
          time: visit.created_at,
          label: `Visit ${visitIndex + 1}`,
          customerName: visit.client_name || visit.customer_name || 'Unknown Customer',
          businessType: visit.client_type || 'Unknown',
          contactPerson: visit.contact_person || '',
          contactPhone: visit.contact_phone || '',
          location: visit.location || 'Location unavailable',
          visitType: visit.visit_type || 'Field Visit',
          notes: visit.notes || '',
          distanceFromPreviousKm,
          timeTakenMinutes,
        }
        points.push(visitPoint)
        previousPoint = visitPoint
      })

      if (journey.end_latitude && journey.end_longitude) {
        const endLat = Number(journey.end_latitude)
        const endLng = Number(journey.end_longitude)
        points.push({
          id: `end-${journey.id}`,
          type: 'end',
          lat: endLat,
          lng: endLng,
          time: journey.end_time,
          label: 'Journey End',
          location: journey.end_location || 'End Point',
          customerName: journey.end_location || 'End Point',
          distanceFromPreviousKm: previousPoint ? calcDistanceKm(previousPoint.lat, previousPoint.lng, endLat, endLng) : 0,
          timeTakenMinutes: previousPoint ? minutesBetween(previousPoint.time, journey.end_time) : 0,
        })
      }

      return {
        id: journey.id,
        color: AVATAR_COLORS[managerIndex % AVATAR_COLORS.length],
        managerId: manager.id,
        managerName: manager.full_name,
        territory: manager.territory || 'Unassigned',
        date: journey.date,
        journeyIndex,
        startLabel: journey.start_location || 'Starting Point',
        totalKm: Number(journey.total_km || 0),
        visitCount: journeyVisits.length,
        points,
        gpsTrail,
      }
    })
  })
}

function popupHtml(point, journey) {
  if (point.type === 'visit') {
    return `
      <div style="min-width:220px;font-family:system-ui,sans-serif;padding:2px 4px">
        <div style="font-weight:800;font-size:0.9rem;color:#111827;margin-bottom:4px">${point.label}</div>
        <div style="font-weight:700;color:#1F2937;margin-bottom:4px">${point.customerName}</div>
        <div style="font-size:0.72rem;color:#6B7280;line-height:1.5">${point.businessType}</div>
        <div style="font-size:0.72rem;color:#6B7280;line-height:1.5">${point.contactPerson || 'No contact'}${point.contactPhone ? ` · ${point.contactPhone}` : ''}</div>
        <div style="font-size:0.72rem;color:#6B7280;line-height:1.5">${point.location}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:0.72rem;color:#374151;line-height:1.6">
          <div>Time: ${fmtTime(point.time)}</div>
          <div>Distance from previous: ${point.distanceFromPreviousKm.toFixed(1)} km</div>
          <div>Travel time: ${calcTravelTime(point.distanceFromPreviousKm)}${point.timeTakenMinutes ? ` · ${point.timeTakenMinutes} min actual` : ''}</div>
        </div>
      </div>`
  }

  return `
    <div style="min-width:200px;font-family:system-ui,sans-serif;padding:2px 4px">
      <div style="font-weight:800;font-size:0.88rem;color:#111827">${point.label}</div>
      <div style="font-size:0.72rem;color:#6B7280;line-height:1.5;margin-top:4px">${point.location}</div>
      <div style="font-size:0.72rem;color:#374151;line-height:1.6;margin-top:8px">
        <div>Date: ${fmtDate(journey.date)}</div>
        <div>Time: ${fmtTime(point.time)}</div>
      </div>
    </div>`
}

export default function SalesHeatmap({ onClose }) {
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const markersRef = useRef([])
  const linesRef = useRef([])
  const [mapReady, setMapReady] = useState(false)
  const [managers, setManagers] = useState([])
  const [selManager, setSelManager] = useState(null)
  const [terrStats, setTerrStats] = useState([])
  const [showVisits, setShowVisits] = useState(true)
  const [showGPS, setShowGPS] = useState(true)
  const [journeyCollections, setJourneyCollections] = useState([])
  const [selectedJourneyId, setSelectedJourneyId] = useState(null)
  const [selectedPoint, setSelectedPoint] = useState(null)

  useEffect(() => {
    let cancelled = false
    const managerList = getUsers('Sales Manager') || []
    setManagers(managerList)
    setTerrStats(getTerritoryStats() || [])
    loadLeaflet().then(() => {
      if (!cancelled) setMapReady(true)
    })
    return () => {
      cancelled = true
      if (mapInst.current) {
        mapInst.current.remove()
        mapInst.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInst.current) return
    const map = L.map(mapRef.current, { zoomControl: true })
    mapInst.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    map.setView([19.0760, 72.8777], 10)
  }, [mapReady])

  const refreshData = (managerId = null) => {
    const data = buildJourneyCollections(managers, managerId)
    setJourneyCollections(data)
    setSelectedPoint(null)
    setSelectedJourneyId(data[0]?.id || null)
  }

  useEffect(() => {
    if (managers.length > 0) refreshData(selManager?.id || null)
  }, [managers, selManager])

  useEffect(() => {
    if (!journeyCollections.some(journey => journey.id === selectedJourneyId)) {
      setSelectedJourneyId(journeyCollections[0]?.id || null)
    }
  }, [journeyCollections, selectedJourneyId])

  const managerJourneys = useMemo(() => {
    if (!selManager) return journeyCollections
    return journeyCollections.filter(journey => journey.managerId === selManager.id)
  }, [journeyCollections, selManager])

  const selectedJourney = useMemo(
    () => journeyCollections.find(journey => journey.id === selectedJourneyId) || null,
    [journeyCollections, selectedJourneyId]
  )

  const summary = useMemo(() => {
    const base = managerJourneys
    return {
      totalJourneys: base.length,
      totalVisits: base.reduce((sum, journey) => sum + journey.visitCount, 0),
      totalKm: base.reduce((sum, journey) => sum + Number(journey.totalKm || 0), 0),
      gpsPoints: base.reduce((sum, journey) => sum + journey.gpsTrail.length, 0),
    }
  }, [managerJourneys])

  useEffect(() => {
    if (!mapInst.current || !L) return
    const map = mapInst.current
    markersRef.current.forEach(marker => map.removeLayer(marker))
    linesRef.current.forEach(line => map.removeLayer(line))
    markersRef.current = []
    linesRef.current = []

    const bounds = []

    journeyCollections.forEach(journey => {
      const routePoints = journey.points.filter(point => point.type !== 'end' || point.lat)
      const managerIndex = managers.findIndex(manager => manager.id === journey.managerId)
      const color = AVATAR_COLORS[managerIndex % AVATAR_COLORS.length] || journey.color || '#2563EB'
      const isSelectedJourney = selectedJourneyId === journey.id

      if (showVisits && routePoints.length > 1) {
        const routeLine = L.polyline(
          routePoints.map(point => [point.lat, point.lng]),
          {
            color,
            weight: isSelectedJourney ? 4 : 3,
            opacity: isSelectedJourney ? 0.95 : 0.65,
            dashArray: '6 10',
          }
        ).addTo(map)
        linesRef.current.push(routeLine)
      }

      if (showGPS && journey.gpsTrail.length > 1) {
        const gpsLine = L.polyline(
          journey.gpsTrail.map(point => [point.lat, point.lng]),
          {
            color,
            weight: 2,
            opacity: 0.35,
          }
        ).addTo(map)
        linesRef.current.push(gpsLine)
      }

      if (showGPS) {
        journey.gpsTrail.forEach((point, pointIndex) => {
          if (pointIndex % 4 !== 0) return
          const gpsIcon = L.divIcon({
            className: '',
            html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};opacity:0.35"></div>`,
            iconSize: [8, 8],
            iconAnchor: [4, 4],
          })
          const gpsMarker = L.marker([point.lat, point.lng], { icon: gpsIcon }).addTo(map)
          markersRef.current.push(gpsMarker)
          bounds.push([point.lat, point.lng])
        })
      }

      if (showVisits) {
        journey.points.forEach(point => {
          const isVisit = point.type === 'visit'
          const label = point.type === 'start' ? 'S' : point.type === 'end' ? 'E' : String(point.visitNumber)
          const size = isVisit ? 28 : 24
          const markerIcon = L.divIcon({
            className: '',
            html: `<div style="width:${size}px;height:${size}px;border-radius:${isVisit ? '50%' : '10px'};background:${color};border:2px solid #fff;box-shadow:0 0 0 3px ${color}22,0 4px 12px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${isVisit ? 12 : 11}px">${label}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          })
          const marker = L.marker([point.lat, point.lng], { icon: markerIcon })
            .addTo(map)
            .bindPopup(popupHtml(point, journey))
            .on('click', () => {
              setSelectedPoint({ ...point, managerName: journey.managerName, date: journey.date })
              setSelectedJourneyId(journey.id)
            })

          if (point.type === 'visit') {
            marker.bindTooltip(`${point.label}: ${point.customerName}`, { direction: 'top', offset: [0, -10] })
          }

          markersRef.current.push(marker)
          bounds.push([point.lat, point.lng])
        })
      }
    })

    if (selectedJourney) {
      const selectedBounds = selectedJourney.points.map(point => [point.lat, point.lng])
      if (selectedBounds.length > 0) {
        map.fitBounds(selectedBounds, { padding: [40, 40] })
        return
      }
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [journeyCollections, managers, selectedJourney, selectedJourneyId, showGPS, showVisits])

  const filterManager = (manager) => {
    const nextManager = manager?.id === selManager?.id ? null : manager
    setSelManager(nextManager)
  }

  return (
    <div className="shm-overlay" onClick={onClose}>
      <div className="shm-panel shm-panel-wide" onClick={e => e.stopPropagation()}>
        <div className="shm-header">
          <div>
            <div className="shm-title">🔥 Sales Activity Heatmap</div>
            <div className="shm-sub">
              {summary.totalVisits} visit logs · {summary.gpsPoints} GPS trail points · {summary.totalJourneys} journeys
            </div>
          </div>
          <button className="shm-close" onClick={onClose}>✕</button>
        </div>

        <div className="shm-body">
          <div className="shm-sidebar shm-sidebar-wide">
            <div className="shm-section">
              <div className="shm-sec-lbl">Map Layers</div>
              <label className="shm-toggle">
                <input type="checkbox" checked={showVisits} onChange={e => setShowVisits(e.target.checked)}/>
                <span className="shm-toggle-track"/>
                <span>Journey Visits</span>
                <span className="shm-count">{summary.totalVisits}</span>
              </label>
              <label className="shm-toggle">
                <input type="checkbox" checked={showGPS} onChange={e => setShowGPS(e.target.checked)}/>
                <span className="shm-toggle-track"/>
                <span>GPS Trail Lines</span>
                <span className="shm-count">{summary.gpsPoints}</span>
              </label>
            </div>

            <div className="shm-section">
              <div className="shm-sec-lbl">Filter by Manager</div>
              <button className={`shm-mgr-btn ${!selManager ? 'shm-mgr-active' : ''}`} onClick={() => filterManager(null)}>
                All Managers
              </button>
              {managers.map((manager, index) => (
                <button
                  key={manager.id}
                  className={`shm-mgr-btn ${selManager?.id === manager.id ? 'shm-mgr-active' : ''}`}
                  onClick={() => filterManager(manager)}
                >
                  <div className="shm-mgr-dot" style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}/>
                  {manager.full_name}
                </button>
              ))}
            </div>

            {selManager && (
              <div className="shm-section">
                <div className="shm-sec-lbl">Manager Summary</div>
                <div className="shm-summary-card">
                  <div className="shm-summary-title">{selManager.full_name}</div>
                  <div className="shm-summary-meta">{selManager.territory || 'Unassigned territory'}</div>
                  <div className="shm-summary-grid">
                    <div><strong>{summary.totalJourneys}</strong><span>Journeys</span></div>
                    <div><strong>{summary.totalVisits}</strong><span>Logs</span></div>
                    <div><strong>{summary.totalKm.toFixed(1)} km</strong><span>Distance</span></div>
                  </div>
                </div>
              </div>
            )}

            {managerJourneys.length > 0 && (
              <div className="shm-section">
                <div className="shm-sec-lbl">{selManager ? `${selManager.full_name}'s Journeys` : 'Journey List'}</div>
                <div className="shm-journey-list">
                  {managerJourneys.map(journey => (
                    <button
                      key={journey.id}
                      className={`shm-journey-btn ${selectedJourneyId === journey.id ? 'shm-journey-active' : ''}`}
                      onClick={() => {
                        setSelectedJourneyId(journey.id)
                        setSelectedPoint(null)
                      }}
                    >
                      <div className="shm-journey-title">{fmtDate(journey.date)}</div>
                      <div className="shm-journey-meta">{journey.startLabel}</div>
                      <div className="shm-journey-meta">{journey.visitCount} logs · {journey.totalKm.toFixed(1)} km</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedPoint && (
              <div className="shm-section">
                <div className="shm-sec-lbl">Selected Log</div>
                <div className="shm-detail-card">
                  <div className="shm-detail-title">{selectedPoint.label}</div>
                  <div className="shm-detail-name">{selectedPoint.customerName}</div>
                  <div className="shm-detail-meta">{selectedPoint.businessType || 'Journey point'}</div>
                  <div className="shm-detail-meta">{selectedPoint.contactPerson || 'No contact'}{selectedPoint.contactPhone ? ` · ${selectedPoint.contactPhone}` : ''}</div>
                  <div className="shm-detail-meta">{selectedPoint.location}</div>
                  <div className="shm-detail-stats">
                    <div><span>Time</span><strong>{fmtTime(selectedPoint.time)}</strong></div>
                    <div><span>Distance from previous</span><strong>{selectedPoint.distanceFromPreviousKm?.toFixed(1) || '0.0'} km</strong></div>
                    <div><span>Travel time</span><strong>{selectedPoint.type === 'visit' ? `${selectedPoint.timeTakenMinutes || 0} min` : '--'}</strong></div>
                    <div><span>Drive estimate</span><strong>{selectedPoint.type === 'visit' ? calcTravelTime(selectedPoint.distanceFromPreviousKm || 0) : '--'}</strong></div>
                  </div>
                </div>
              </div>
            )}

            <div className="shm-section">
              <div className="shm-sec-lbl">Territory Stats</div>
              {terrStats.map((territory, index) => (
                <div key={territory.name} className="shm-terr-row">
                  <div className="shm-terr-dot" style={{ background: TERRITORY_COLORS[index % TERRITORY_COLORS.length] }}/>
                  <div className="shm-terr-body">
                    <div className="shm-terr-name">{territory.name}</div>
                    <div className="shm-terr-meta">{territory.managers} mgr · {territory.visits_total} visits · {territory.customers} customers</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div ref={mapRef} className="shm-map" style={{ background: '#E5E7EB' }}>
            {journeyCollections.length === 0 && mapReady && (
              <div className="shm-empty-map">
                <div className="shm-empty-ico">🗺️</div>
                <div className="shm-empty-txt">No journey data recorded yet.</div>
                <div className="shm-empty-sub">Start a journey and log visits to track the manager route here.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

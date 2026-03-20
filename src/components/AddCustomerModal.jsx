// -----------------------------------------------------------
// ADD CUSTOMER MODAL — GPS-powered customer creation
// Auto-detects location, reverse geocodes address,
// territory assignment, full form with validation
// -----------------------------------------------------------
import { useState, useEffect } from 'react'
import { createCustomer, getTerritories } from '../utils/supabaseDB'
import './AddCustomerModal.css'

const CLIENT_TYPES = ['Retailer','Distributor','Wholesaler','Dealer','Direct Customer','Other']

export default function AddCustomerModal({ onCreated, onClose, createdBy }) {
  const [form, setForm] = useState({
    name: '', owner_name: '', phone: '', type: 'Retailer',
    address: '', territory: '', latitude: null, longitude: null
  })
  const [locating,   setLocating]   = useState(false)
  const [locError,   setLocError]   = useState('')
  const [gpsFixed,   setGpsFixed]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const territories = getTerritories()

  // Auto-detect location on open
  useEffect(() => { autoDetect() }, [])

  const autoDetect = async () => {
    if (!navigator.geolocation) return
    setLocating(true); setLocError('')
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 9000, enableHighAccuracy: true })
      )
      const lat = pos.coords.latitude, lng = pos.coords.longitude
      setForm(p => ({ ...p, latitude: lat, longitude: lng }))
      setGpsFixed(true)
      // Reverse geocode
      try {
        const d = await (await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)).json()
        const addr = d.address
        const parts = [addr?.road, addr?.suburb, addr?.city || addr?.town, addr?.state].filter(Boolean)
        const addrStr = parts.slice(0,3).join(', ')
        const territory = territories.find(t => d.display_name?.toLowerCase().includes(t.toLowerCase().split(' ')[0]))
        setForm(p => ({
          ...p,
          address: addrStr || d.display_name?.split(',').slice(0,3).join(', ') || '',
          territory: territory || p.territory
        }))
      } catch {}
    } catch(e) {
      setLocError(e.code === 1 ? 'Location access denied. Please enter address manually.' : 'Could not detect location.')
    } finally { setLocating(false) }
  }

  const set = (k,v) => { setForm(p => ({ ...p, [k]: v })); setError('') }

  const submit = async () => {
    if (!form.name.trim()) return setError('Customer name is required.')
    setSubmitting(true)
    try {
      const c = createCustomer({ ...form, created_by: createdBy || null })
      onCreated(c)
      onClose()
    } catch(e) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="acm-overlay" onClick={onClose}>
      <div className="acm-sheet" onClick={e => e.stopPropagation()}>
        {/* Handle bar */}
        <div className="acm-handle"/>

        <div className="acm-header">
          <div>
            <div className="acm-title">Add Customer</div>
            <div className="acm-sub">GPS location auto-detected</div>
          </div>
          <button className="acm-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* GPS Status Bar */}
        <div className={`acm-gps-bar ${gpsFixed ? 'acm-gps-ok' : locating ? 'acm-gps-finding' : 'acm-gps-off'}`}>
          {locating ? (
            <><div className="acm-gps-spin"/><span>Detecting your location…</span></>
          ) : gpsFixed ? (
            <><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6.5l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg><span>GPS location captured ({form.latitude?.toFixed(4)}, {form.longitude?.toFixed(4)})</span></>
          ) : (
            <><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 4v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg><span>{locError || 'GPS not available'}</span><button className="acm-retry" onClick={autoDetect}>Retry</button></>
          )}
        </div>

        <div className="acm-body">
          {error && <div className="acm-error">{error}</div>}

          {/* Customer Name */}
          <div className="acm-fg">
            <label>Customer / Business Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Raj Traders" autoFocus/>
          </div>

          {/* Owner + Phone */}
          <div className="acm-row2">
            <div className="acm-fg">
              <label>Owner Name</label>
              <input value={form.owner_name} onChange={e => set('owner_name', e.target.value)}
                placeholder="Owner / Contact"/>
            </div>
            <div className="acm-fg">
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+91 9999999999"/>
            </div>
          </div>

          {/* Type + Territory */}
          <div className="acm-row2">
            <div className="acm-fg">
              <label>Customer Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}>
                {CLIENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="acm-fg">
              <label>Territory</label>
              <select value={form.territory} onChange={e => set('territory', e.target.value)}>
                <option value="">Select territory</option>
                {territories.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Address */}
          <div className="acm-fg">
            <div className="acm-addr-lbl">
              <label>Address</label>
              <button className="acm-detect-btn" onClick={autoDetect} disabled={locating}>
                {locating
                  ? <><div className="acm-gps-spin acm-spin-sm"/><span>Detecting…</span></>
                  : <><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 1v1.5M5.5 8V9.5M1 5.5h1.5M8 5.5H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg><span>Detect Current</span></>
                }
              </button>
            </div>
            <textarea value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="Full address (auto-filled if GPS detected)"
              rows={2} className="acm-textarea"/>
          </div>

          {/* GPS Coordinates (read-only display) */}
          {gpsFixed && (
            <div className="acm-coords-row">
              <div className="acm-coord">
                <span className="acm-coord-lbl">Latitude</span>
                <span className="acm-coord-val">{form.latitude?.toFixed(6)}</span>
              </div>
              <div className="acm-coord">
                <span className="acm-coord-lbl">Longitude</span>
                <span className="acm-coord-val">{form.longitude?.toFixed(6)}</span>
              </div>
              <button className="acm-clear-gps" onClick={() => { setForm(p => ({ ...p, latitude: null, longitude: null })); setGpsFixed(false) }}>
                Clear GPS
              </button>
            </div>
          )}
        </div>

        <div className="acm-footer">
          <button className="acm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="acm-btn-submit" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : '+ Add Customer'}
          </button>
        </div>
      </div>
    </div>
  )
}

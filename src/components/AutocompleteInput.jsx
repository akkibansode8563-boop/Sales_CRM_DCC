import { useState, useEffect, useRef, useCallback } from 'react'
import { createCustomer, createBrand, createProduct } from '../utils/supabaseDB'
import './AutocompleteInput.css'

// -------------------------------------------------------------
//  AutocompleteInput — Smart searchable dropdown with
//  "+ Add New" quick-create, keyboard nav, offline recents
// -------------------------------------------------------------
export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search…',
  searchFn,        // (query) => [{id, name, ...}]
  recentsFn,       // () => [{id, name, ...}]
  renderItem,      // (item) => JSX label
  renderMeta,      // (item) => JSX secondary text
  addNewLabel,     // "Add New Customer" etc.
  onAddNew,        // () => void — open quick-add modal
  disabled = false,
  autoFocus = false,
  id,
  className = '',
}) {
  const [open,     setOpen]     = useState(false)
  const [results,  setResults]  = useState([])
  const [recents,  setRecents]  = useState([])
  const [cursor,   setCursor]   = useState(-1)
  const [loading,  setLoading]  = useState(false)
  const inputRef   = useRef(null)
  const listRef    = useRef(null)
  const wrapRef    = useRef(null)
  const debounce   = useRef(null)

  // Load recents on mount
  useEffect(() => {
    if (recentsFn) setRecents(recentsFn().slice(0,6))
  }, [recentsFn])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const close = () => { setOpen(false); setCursor(-1) }

  const doSearch = useCallback((q) => {
    if (!searchFn) return
    setLoading(true)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        const r = await searchFn(q)
        setResults(Array.isArray(r) ? r : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
        setCursor(-1)
      }
    }, 120)
  }, [searchFn])

  const handleChange = (e) => {
    const q = e.target.value
    onChange(q)
    if (q.length >= 1) { setOpen(true); doSearch(q) }
    else { setResults([]); setOpen(!!recentsFn) }
  }

  const handleFocus = () => {
    setOpen(true)
    if (!value) { setResults([]); if (recentsFn) setRecents(recentsFn().slice(0,6)) }
    else doSearch(value)
  }

  const handleSelect = (item) => {
    onChange(item.name)
    if (onSelect) onSelect(item)
    close()
    // Refresh recents
    if (recentsFn) setRecents(recentsFn().slice(0,6))
  }

  const handleKeyDown = (e) => {
    const items = displayItems()
    if (!open) { if (e.key==='ArrowDown'||e.key==='Enter') { setOpen(true); handleFocus() } return }
    if (e.key==='ArrowDown')  { e.preventDefault(); setCursor(c=>Math.min(c+1, items.length + (addNewLabel?0:-1))) }
    if (e.key==='ArrowUp')    { e.preventDefault(); setCursor(c=>Math.max(c-1,-1)) }
    if (e.key==='Escape')     { close() }
    if (e.key==='Enter') {
      e.preventDefault()
      if (cursor >= 0 && cursor < items.length) handleSelect(items[cursor])
      else if (cursor === items.length && addNewLabel && onAddNew) { close(); onAddNew() }
    }
    if (e.key==='Tab') close()
  }

  // Scroll cursor into view
  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      const el = listRef.current.children[cursor]
      el?.scrollIntoView({ block:'nearest', behavior:'smooth' })
    }
  }, [cursor])

  const displayItems = () => value?.length >= 1 ? results : recents

  const showAddNew = addNewLabel && onAddNew

  return (
    <div className={`ac-wrap ${className}`} ref={wrapRef}>
      <div className={`ac-input-box ${open ? 'ac-focused' : ''} ${disabled ? 'ac-disabled' : ''}`}>
        <svg className="ac-search-ico" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          className="ac-input"
        />
        {value && !disabled && (
          <button className="ac-clear" onClick={() => { onChange(''); if (onSelect) onSelect(null); close(); inputRef.current?.focus() }} tabIndex={-1} type="button">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        {loading && <span className="ac-spinner"/>}
      </div>

      {open && (
        <div className="ac-dropdown">
          {/* Recents header */}
          {!value && recents.length > 0 && (
            <div className="ac-section-label">⏱ Recently used</div>
          )}

          {/* Results / recents list */}
          <ul className="ac-list" ref={listRef}>
            {displayItems().map((item, i) => (
              <li
                key={item.id || item.name}
                className={`ac-item ${cursor === i ? 'ac-item-active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
                onMouseEnter={() => setCursor(i)}
              >
                <div className="ac-item-main">
                  {renderItem ? renderItem(item) : <span className="ac-item-name">{item.name}</span>}
                </div>
                {renderMeta && (
                  <div className="ac-item-meta">{renderMeta(item)}</div>
                )}
              </li>
            ))}

            {/* No results + query exists */}
            {value?.length >= 1 && results.length === 0 && !loading && (
              <li className="ac-no-results">
                No match for "<strong>{value}</strong>"
              </li>
            )}

            {/* Empty recents */}
            {!value && recents.length === 0 && (
              <li className="ac-no-results">Start typing to search…</li>
            )}
          </ul>

          {/* Add New entry */}
          {showAddNew && (
            <button
              className={`ac-add-new ${cursor === displayItems().length ? 'ac-add-new-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); close(); onAddNew() }}
              onMouseEnter={() => setCursor(displayItems().length)}
              type="button"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6.5 4v5M4 6.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {addNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------
//  QuickAddCustomerModal — inline modal to create new customer
// -------------------------------------------------------------
export function QuickAddCustomerModal({ onCreated, onClose }) {
  const [f, setF] = useState({ name:'', type:'Retailer', address:'', phone:'', territory:'' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!f.name.trim()) { setErr('Customer name is required'); return }
    setSaving(true)
    try {
      const c = await createCustomer(f)
      onCreated(c)
      onClose()
    } catch(e) { setErr(e.message); setSaving(false) }
  }

  return (
    <div className="qm-overlay" onClick={onClose}>
      <div className="qm-box" onClick={e=>e.stopPropagation()}>
        <div className="qm-hdr">
          <div className="qm-title">
            <div className="qm-title-ico">🏢</div>
            Add New Customer
          </div>
          <button className="qm-close" onClick={onClose}>✕</button>
        </div>
        <div className="qm-body">
          {err && <div className="qm-err">⚠️ {err}</div>}
          <div className="qm-fg">
            <label>Customer Name *</label>
            <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} placeholder="e.g. ABC Distributors" autoFocus/>
          </div>
          <div className="qm-row2">
            <div className="qm-fg">
              <label>Type</label>
              <select value={f.type} onChange={e=>setF(p=>({...p,type:e.target.value}))}>
                {['Retailer','Distributor','Wholesaler','Dealer','Direct Customer','Other'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="qm-fg">
              <label>Phone</label>
              <input value={f.phone} onChange={e=>setF(p=>({...p,phone:e.target.value}))} placeholder="9876543210"/>
            </div>
          </div>
          <div className="qm-fg">
            <label>Address</label>
            <input value={f.address} onChange={e=>setF(p=>({...p,address:e.target.value}))} placeholder="Area, City"/>
          </div>
          <div className="qm-fg">
            <label>Territory</label>
            <input value={f.territory} onChange={e=>setF(p=>({...p,territory:e.target.value}))} placeholder="e.g. Mumbai West"/>
          </div>
        </div>
        <div className="qm-foot">
          <button className="qm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="qm-btn-save" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Customer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
//  QuickAddBrandModal
// -------------------------------------------------------------
export function QuickAddBrandModal({ onCreated, onClose }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!name.trim()) { setErr('Brand name required'); return }
    try { const b = await createBrand(name); onCreated(b); onClose() }
    catch(e) { setErr(e.message) }
  }

  return (
    <div className="qm-overlay" onClick={onClose}>
      <div className="qm-box qm-box-sm" onClick={e=>e.stopPropagation()}>
        <div className="qm-hdr">
          <div className="qm-title"><div className="qm-title-ico">🏷️</div>Add New Brand</div>
          <button className="qm-close" onClick={onClose}>✕</button>
        </div>
        <div className="qm-body">
          {err && <div className="qm-err">⚠️ {err}</div>}
          <div className="qm-fg"><label>Brand Name *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Brand Alpha" autoFocus/></div>
        </div>
        <div className="qm-foot">
          <button className="qm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="qm-btn-save" onClick={submit}>✓ Save Brand</button>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
//  QuickAddProductModal
// -------------------------------------------------------------
export function QuickAddProductModal({ brandId, brandName, onCreated, onClose }) {
  const [f, setF] = useState({ name:'', category:'', brand_id:brandId||null, brand_name:brandName||'' })
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!f.name.trim()) { setErr('Product name required'); return }
    try { const p = await createProduct(f); onCreated(p); onClose() }
    catch(e) { setErr(e.message) }
  }

  return (
    <div className="qm-overlay" onClick={onClose}>
      <div className="qm-box qm-box-sm" onClick={e=>e.stopPropagation()}>
        <div className="qm-hdr">
          <div className="qm-title"><div className="qm-title-ico">📦</div>Add New Product</div>
          <button className="qm-close" onClick={onClose}>✕</button>
        </div>
        <div className="qm-body">
          {err && <div className="qm-err">⚠️ {err}</div>}
          {brandName && <div className="qm-info">Brand: <strong>{brandName}</strong></div>}
          <div className="qm-fg"><label>Product Name *</label><input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} placeholder="e.g. Alpha Pro 100" autoFocus/></div>
          <div className="qm-fg"><label>Category</label><input value={f.category} onChange={e=>setF(p=>({...p,category:e.target.value}))} placeholder="e.g. Electronics"/></div>
        </div>
        <div className="qm-foot">
          <button className="qm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="qm-btn-save" onClick={submit}>✓ Save Product</button>
        </div>
      </div>
    </div>
  )
}

import { memo, useState, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'

const fmt    = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '—'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'
const daysSince = iso => iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null

const PRIORITY_COLOR = { high: { bg:'#FEF2F2', color:'#DC2626', label:'High' }, medium: { bg:'#FFFBEB', color:'#D97706', label:'Medium' }, low: { bg:'#ECFDF5', color:'#059669', label:'Low' }, none: { bg:'#F3F4F6', color:'#6B7280', label:'New' } }
const TYPE_COLORS = { Retailer:'#3B82F6', Distributor:'#8B5CF6', Wholesaler:'#10B981', Dealer:'#F59E0B', 'Direct Customer':'#EF4444', Other:'#6B7280' }

export default memo(function CustomerDatabase({ customers = [], visits = [], managers = [] }) {
  const [search,    setSearch]    = useState('')
  const [typeFilter,setTypeFilter]= useState('all')
  const [sortBy,    setSortBy]    = useState('last_visit')
  const [selIds,    setSelIds]    = useState(new Set())
  const [expanded,  setExpanded]  = useState(null)

  // ── Enrich customer data with visit history ─────────────────
  const enriched = useMemo(() => customers.map(c => {
    const customerName = (c.name || '').trim().toLowerCase()
    const cVisits  = visits.filter(v => v.customer_id === c.id || (!v.customer_id && (v.customer_name || v.client_name || '').trim().toLowerCase() === customerName))
    const sorted   = [...cVisits].sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    const lastVisit= sorted[0] || null
    const totalSales = cVisits.reduce((s,v) => s + (v.sale_amount||0), 0)
    const createdBy  = managers.find(m => m.id === c.created_by)
    const days       = daysSince(lastVisit?.created_at)
    const priority   = !lastVisit ? 'none' : days > 21 ? 'high' : days > 14 ? 'medium' : 'low'
    return { ...c, cVisits, lastVisit, totalSales, createdBy, days, priority }
  }), [customers, visits, managers])

  // ── Filter + sort ───────────────────────────────────────────
  const types = useMemo(() => ['all', ...new Set(customers.map(c => c.type).filter(Boolean))], [customers])

  const filtered = useMemo(() => {
    let list = enriched
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.owner_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.territory || '').toLowerCase().includes(q)
      )
    }
    if (typeFilter !== 'all') list = list.filter(c => c.type === typeFilter)
    return [...list].sort((a,b) => {
      if (sortBy === 'last_visit') return (b.lastVisit ? new Date(b.lastVisit.created_at) : 0) - (a.lastVisit ? new Date(a.lastVisit.created_at) : 0)
      if (sortBy === 'visits')   return b.cVisits.length - a.cVisits.length
      if (sortBy === 'sales')    return b.totalSales - a.totalSales
      if (sortBy === 'name')     return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'priority') { const p={none:0,high:1,medium:2,low:3}; return p[a.priority]-p[b.priority] }
      return 0
    })
  }, [enriched, search, typeFilter, sortBy])

  // ── Selection ───────────────────────────────────────────────
  const toggleSelect = id => setSelIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll    = () => setSelIds(new Set(filtered.map(c => c.id)))
  const clearAll     = () => setSelIds(new Set())

  // ── Excel Export ────────────────────────────────────────────
  const exportExcel = useCallback(() => {
    const toExport = selIds.size > 0
      ? enriched.filter(c => selIds.has(c.id))
      : filtered

    const rows = toExport.map((c, i) => ({
      'Sr No':          i + 1,
      'Customer Name':  c.name || '',
      'Owner / Contact':c.owner_name || '',
      'Phone':          c.phone || '',
      'Type':           c.type || '',
      'Address':        c.address || '',
      'Territory':      c.territory || '',
      'GPS Latitude':   c.latitude || '',
      'GPS Longitude':  c.longitude || '',
      'Total Visits':   c.cVisits.length,
      'Last Visit Date':c.lastVisit ? fmtDate(c.lastVisit.created_at) : 'Never',
      'Days Since Visit':c.days ?? 'Never',
      'Visit Priority': PRIORITY_COLOR[c.priority]?.label || '',
      'Total Sales (₹)':c.totalSales,
      'Added By':       c.createdBy?.full_name || '',
      'Added On':       fmtDate(c.created_at),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)

    // Column widths
    ws['!cols'] = [
      {wch:6},{wch:28},{wch:22},{wch:16},{wch:16},
      {wch:36},{wch:18},{wch:14},{wch:14},
      {wch:13},{wch:18},{wch:18},{wch:14},{wch:16},{wch:20},{wch:16},
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Database')

    // Summary sheet
    const summary = [
      ['DCC SalesForce — Customer Database Export'],
      ['Exported on', new Date().toLocaleString('en-IN')],
      ['Total Customers', toExport.length],
      [''],
      ['Type Breakdown'],
      ...types.filter(t => t !== 'all').map(t => [t, toExport.filter(c => c.type === t).length]),
      [''],
      ['Priority Breakdown'],
      ['High (>21 days)', toExport.filter(c => c.priority === 'high').length],
      ['Medium (14-21 days)', toExport.filter(c => c.priority === 'medium').length],
      ['Low (<14 days)', toExport.filter(c => c.priority === 'low').length],
      ['New (never visited)', toExport.filter(c => c.priority === 'none').length],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summary)
    wsSummary['!cols'] = [{wch:30},{wch:20}]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

    XLSX.writeFile(wb, `DCC_Customers_${new Date().toISOString().split('T')[0]}.xlsx`)
  }, [filtered, enriched, selIds, types])

  // ── Summary KPIs ────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:   enriched.length,
    high:    enriched.filter(c => c.priority === 'high').length,
    newCust: enriched.filter(c => c.priority === 'none').length,
    active:  enriched.filter(c => c.days !== null && c.days <= 7).length,
  }), [enriched])

  return (
    <div>
      {/* ── KPI strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Total Customers', val:kpis.total,  color:'#2563EB', bg:'#EFF6FF' },
          { label:'Active (≤7 days)', val:kpis.active, color:'#059669', bg:'#ECFDF5' },
          { label:'Needs Visit',     val:kpis.high,   color:'#DC2626', bg:'#FEF2F2' },
          { label:'Never Visited',   val:kpis.newCust,color:'#D97706', bg:'#FFFBEB' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.color}30`, borderRadius:12, padding:'12px 14px' }}>
            <div style={{ fontFamily:'monospace', fontSize:'1.6rem', fontWeight:900, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:'0.62rem', fontWeight:700, color:k.color, opacity:0.7, marginTop:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Controls bar ── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
        {/* Search */}
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"
            style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, address, territory…"
            style={{ width:'100%', padding:'8px 12px 8px 32px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:'0.8rem', outline:'none', color:'#111827', boxSizing:'border-box' }}
          />
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:'0.78rem', color:'#374151', background:'#F9FAFB', cursor:'pointer' }}>
          {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>)}
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:'0.78rem', color:'#374151', background:'#F9FAFB', cursor:'pointer' }}>
          <option value="last_visit">Sort: Recent Visit</option>
          <option value="visits">Sort: Most Visits</option>
          <option value="sales">Sort: Most Sales</option>
          <option value="priority">Sort: Needs Attention</option>
          <option value="name">Sort: Name A–Z</option>
        </select>

        {/* Selection controls */}
        <button onClick={selIds.size === filtered.length ? clearAll : selectAll}
          style={{ padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:'0.75rem', fontWeight:700, cursor:'pointer', background:'#F9FAFB', color:'#374151', fontFamily:'inherit' }}>
          {selIds.size === filtered.length ? 'Deselect All' : 'Select All'}
        </button>

        {/* Export button */}
        <button onClick={exportExcel} style={{
          display:'flex', alignItems:'center', gap:6,
          padding:'8px 16px', borderRadius:8, border:'none',
          background:'linear-gradient(135deg,#059669,#10B981)',
          color:'#fff', fontWeight:800, fontSize:'0.82rem', cursor:'pointer', fontFamily:'inherit',
          boxShadow:'0 3px 10px rgba(16,185,129,0.3)',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="12" x2="12" y2="18"/>
            <polyline points="8 15 12 19 16 15"/>
          </svg>
          {selIds.size > 0 ? `Export ${selIds.size} Selected` : `Export All (${filtered.length})`}
        </button>

        <span style={{ fontSize:'0.7rem', color:'#9CA3AF', fontWeight:600 }}>
          {filtered.length} of {enriched.length} customers
        </span>
      </div>

      {/* ── Customer rows ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', color:'#9CA3AF' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:10 }}>🏪</div>
          <div style={{ fontWeight:700, color:'#374151', fontSize:'0.9rem' }}>No customers found</div>
          <div style={{ fontSize:'0.75rem', marginTop:4 }}>Customers are auto-created when managers log visits</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.map((c, idx) => {
            const isExpanded = expanded === c.id
            const isSelected = selIds.has(c.id)
            const pri = PRIORITY_COLOR[c.priority]
            const typeColor = TYPE_COLORS[c.type] || '#6B7280'

            return (
              <div key={c.id} style={{
                border: `1.5px solid ${isSelected ? '#2563EB' : '#E5E7EB'}`,
                borderRadius:12, background: isSelected ? '#EFF6FF' : '#fff',
                overflow:'hidden', transition:'all 0.15s',
                boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                {/* ── Main row ── */}
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', cursor:'pointer' }}
                  onClick={() => setExpanded(isExpanded ? null : c.id)}>

                  {/* Checkbox */}
                  <div onClick={e => { e.stopPropagation(); toggleSelect(c.id) }} style={{
                    width:18, height:18, borderRadius:4, border:`2px solid ${isSelected ? '#2563EB' : '#D1D5DB'}`,
                    background: isSelected ? '#2563EB' : '#fff',
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer',
                  }}>
                    {isSelected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>

                  {/* Sr No */}
                  <div style={{ width:26, height:26, borderRadius:6, background:`${typeColor}18`, color:typeColor, fontWeight:800, fontSize:'0.72rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {idx+1}
                  </div>

                  {/* Name + type */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:'0.88rem', color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2, flexWrap:'wrap' }}>
                      <span style={{ background:`${typeColor}18`, color:typeColor, fontSize:'0.6rem', fontWeight:700, padding:'1px 7px', borderRadius:99 }}>{c.type}</span>
                      {c.territory && <span style={{ fontSize:'0.63rem', color:'#9CA3AF' }}>📍 {c.territory}</span>}
                      {c.phone && <span style={{ fontSize:'0.63rem', color:'#9CA3AF' }}>📞 {c.phone}</span>}
                    </div>
                  </div>

                  {/* Owner */}
                  <div style={{ textAlign:'right', flexShrink:0, display:'none' }} className="customer-owner">
                    <div style={{ fontSize:'0.75rem', fontWeight:600, color:'#374151' }}>{c.owner_name || '—'}</div>
                  </div>

                  {/* Visits badge */}
                  <div style={{ textAlign:'center', flexShrink:0 }}>
                    <div style={{ fontWeight:900, fontSize:'1.1rem', color:'#111827', fontFamily:'monospace', lineHeight:1 }}>{c.cVisits.length}</div>
                    <div style={{ fontSize:'0.58rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase' }}>Visits</div>
                  </div>

                  {/* Priority */}
                  <span style={{ background:pri.bg, color:pri.color, fontSize:'0.62rem', fontWeight:800, padding:'3px 9px', borderRadius:99, flexShrink:0 }}>
                    {pri.label}
                  </span>

                  {/* Last visit */}
                  <div style={{ textAlign:'right', flexShrink:0, minWidth:80 }}>
                    <div style={{ fontSize:'0.72rem', fontWeight:600, color:'#374151' }}>
                      {c.lastVisit ? `${c.days}d ago` : 'Never'}
                    </div>
                    <div style={{ fontSize:'0.6rem', color:'#9CA3AF' }}>Last visit</div>
                  </div>

                  {/* Expand chevron */}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"
                    style={{ flexShrink:0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
                    <path d="M3 5l4 4 4-4"/>
                  </svg>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div style={{ borderTop:'1px solid #F3F4F6', padding:'14px 16px', background:'#FAFAFA' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:14 }}>
                      {[
                        { label:'Contact Person', val:c.owner_name || '—', icon:'👤' },
                        { label:'Phone',          val:c.phone || '—', icon:'📞' },
                        { label:'Address',        val:c.address || '—', icon:'📍' },
                        { label:'Territory',      val:c.territory || '—', icon:'🗺️' },
                        { label:'GPS Location',   val:c.latitude ? `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}` : '—', icon:'🛰️' },
                        { label:'Added By',       val:c.createdBy?.full_name || '—', icon:'👷' },
                        { label:'Added On',       val:fmtDate(c.created_at), icon:'📅' },
                        { label:'Total Sales',    val:fmt(c.totalSales), icon:'💰' },
                      ].map(f => (
                        <div key={f.label} style={{ background:'#fff', borderRadius:8, padding:'8px 11px', border:'1px solid #E5E7EB' }}>
                          <div style={{ fontSize:'0.6rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{f.icon} {f.label}</div>
                          <div style={{ fontSize:'0.8rem', fontWeight:600, color:'#111827', wordBreak:'break-word' }}>{f.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Visit history */}
                    {c.cVisits.length > 0 && (
                      <div>
                        <div style={{ fontSize:'0.62rem', fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                          Visit History ({c.cVisits.length} visits)
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          {[...c.cVisits].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,5).map((v,vi) => (
                            <div key={v.id||vi} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'#fff', borderRadius:8, border:'1px solid #F3F4F6', fontSize:'0.75rem' }}>
                              <div style={{ width:20, height:20, borderRadius:'50%', background:['#10B981','#2563EB','#F59E0B','#7C3AED','#EC4899'][vi%5], color:'#fff', fontWeight:800, fontSize:'0.6rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{vi+1}</div>
                              <div style={{ flex:1 }}>
                                <span style={{ fontWeight:600, color:'#374151' }}>{v.visit_type}</span>
                                {v.notes && <span style={{ color:'#9CA3AF', marginLeft:6 }}>· {v.notes.slice(0,60)}</span>}
                              </div>
                              <div style={{ color:'#9CA3AF', flexShrink:0 }}>{fmtDate(v.created_at)}</div>
                              <div style={{ fontWeight:600, color:v.sale_amount>0?'#059669':'#9CA3AF', flexShrink:0 }}>{v.sale_amount>0?fmt(v.sale_amount):'—'}</div>
                            </div>
                          ))}
                          {c.cVisits.length > 5 && <div style={{ fontSize:'0.7rem', color:'#9CA3AF', textAlign:'center', padding:4 }}>+{c.cVisits.length-5} more visits</div>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

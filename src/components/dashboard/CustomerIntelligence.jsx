import { memo, useState, useMemo } from 'react'
import { Badge, ProgressBar, Avatar } from '../ui/index'

const fmt = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const daysSince = iso => iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null

export default memo(function CustomerIntelligence({ customers = [], visits = [], managers = [] }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_visit')

  const enriched = useMemo(() => {
    return customers.map(c => {
      const cVisits = visits.filter(v => v.customer_id === c.id)
      const lastVisit = cVisits.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0]
      const totalSales = cVisits.reduce((s,v) => s + (v.sale_amount || 0), 0)
      const assignedMgr = managers.find(m => m.id === c.assigned_manager_id)
      const days = daysSince(lastVisit?.created_at)
      const frequency = cVisits.length > 0 ? (cVisits.length / Math.max(1, daysSince(c.created_at) || 30) * 30).toFixed(1) : 0
      const priority = !lastVisit ? 'high' : days > 21 ? 'high' : days > 14 ? 'medium' : 'low'

      return { ...c, cVisits, lastVisit, totalSales, assignedMgr, days, frequency, priority }
    })
  }, [customers, visits, managers])

  const filtered = useMemo(() => {
    let list = enriched
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name?.toLowerCase().includes(q) || c.type?.toLowerCase().includes(q) || c.territory?.toLowerCase().includes(q))
    }
    return [...list].sort((a,b) => {
      if (sortBy === 'last_visit') return (b.lastVisit ? new Date(b.lastVisit.created_at) : 0) - (a.lastVisit ? new Date(a.lastVisit.created_at) : 0)
      if (sortBy === 'visits') return b.cVisits.length - a.cVisits.length
      if (sortBy === 'sales') return b.totalSales - a.totalSales
      if (sortBy === 'priority') { const p = {high:0,medium:1,low:2}; return p[a.priority]-p[b.priority] }
      return 0
    })
  }, [enriched, search, sortBy])

  const priorityVariant = { high:'danger', medium:'warning', low:'success' }

  return (
    <div>
      {/* Controls */}
      <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customers..."
          style={{flex:1, minWidth:180, padding:'8px 12px', border:'1.5px solid #E5E7EB',
            borderRadius:8, fontSize:'0.82rem', outline:'none', color:'#111827'}}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:8,
            fontSize:'0.78rem', color:'#374151', background:'#F9FAFB', cursor:'pointer'}}>
          <option value="last_visit">Sort: Recent Visit</option>
          <option value="visits">Sort: Most Visits</option>
          <option value="sales">Sort: Most Sales</option>
          <option value="priority">Sort: Priority</option>
        </select>
        <span style={{fontSize:'0.72rem', color:'#9CA3AF', fontWeight:600}}>{filtered.length} customers</span>
      </div>

      {/* Customer Cards */}
      {filtered.length === 0 ? (
        <div style={{textAlign:'center', padding:'32px', color:'#9CA3AF'}}>
          <div style={{fontSize:'2rem', marginBottom:8}}>&#x1F3EA;</div>
          <div style={{fontSize:'0.83rem'}}>No customers found</div>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12}}>
          {filtered.slice(0, 20).map((c, i) => (
            <div key={c.id} style={{
              background:'#fff', border:'1.5px solid',
              borderColor: c.priority==='high' ? '#FECACA' : c.priority==='medium' ? '#FDE68A' : '#E5E7EB',
              borderRadius:12, padding:'14px 16px', transition:'box-shadow 0.15s'
            }}>
              {/* Header */}
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
                <Avatar name={c.name} index={i} size={36} radius={10}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:700, fontSize:'0.85rem', color:'#111827',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.name}</div>
                  <div style={{fontSize:'0.68rem', color:'#9CA3AF', marginTop:1}}>{c.type} &middot; {c.territory||'—'}</div>
                </div>
                <Badge variant={priorityVariant[c.priority]} size="xs">{c.priority}</Badge>
              </div>

              {/* Metrics */}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10}}>
                <div style={{background:'#F9FAFB', borderRadius:8, padding:'8px 10px'}}>
                  <div style={{fontSize:'0.6rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:2}}>Last Visit</div>
                  <div style={{fontSize:'0.78rem', fontWeight:700, color: c.days > 21 ? '#DC2626' : '#111827'}}>
                    {c.days !== null ? (c.days === 0 ? 'Today' : `${c.days}d ago`) : 'Never'}
                  </div>
                </div>
                <div style={{background:'#F9FAFB', borderRadius:8, padding:'8px 10px'}}>
                  <div style={{fontSize:'0.6rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:2}}>Visits</div>
                  <div style={{fontSize:'0.78rem', fontWeight:700, color:'#111827'}}>{c.cVisits.length}</div>
                </div>
                <div style={{background:'#F9FAFB', borderRadius:8, padding:'8px 10px'}}>
                  <div style={{fontSize:'0.6rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:2}}>Total Sales</div>
                  <div style={{fontSize:'0.78rem', fontWeight:700, color:'#2563EB'}}>{fmt(c.totalSales)}</div>
                </div>
                <div style={{background:'#F9FAFB', borderRadius:8, padding:'8px 10px'}}>
                  <div style={{fontSize:'0.6rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:2}}>Frequency</div>
                  <div style={{fontSize:'0.78rem', fontWeight:700, color:'#111827'}}>{c.frequency}/mo</div>
                </div>
              </div>

              {/* Manager */}
              {c.assignedMgr && (
                <div style={{display:'flex', alignItems:'center', gap:6, fontSize:'0.7rem', color:'#6B7280'}}>
                  <span style={{width:16, height:16, borderRadius:'50%', background:'#2563EB',
                    color:'#fff', fontSize:'0.55rem', fontWeight:800,
                    display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
                    {c.assignedMgr.full_name?.[0]}
                  </span>
                  {c.assignedMgr.full_name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

import { useState, useMemo, useEffect, useCallback, memo } from 'react'
import { getAllProductDayEntriesSync } from '../../utils/supabaseDB'

const fmt  = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const fmtK = v => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v||0)
const pctColor = p => p >= 100 ? '#059669' : p >= 75 ? '#2563EB' : p >= 50 ? '#F59E0B' : '#EF4444'
const pctBg   = p => p >= 100 ? '#ECFDF5' : p >= 75 ? '#EFF6FF' : p >= 50 ? '#FFFBEB' : '#FEF2F2'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function MiniBar({ pct, color }) {
  const c = pctColor(pct)
  return (
    <div style={{ height: 6, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: c, borderRadius: 99, transition: 'width .6s ease' }}/>
    </div>
  )
}

function PctBadge({ pct }) {
  return (
    <span style={{
      background: pctBg(pct), color: pctColor(pct),
      fontWeight: 800, fontSize: '0.62rem', padding: '2px 7px',
      borderRadius: 99, display: 'inline-block', minWidth: 36, textAlign: 'center',
    }}>{pct}%</span>
  )
}

export default memo(function ProductDayAdmin({ managers = [], onRefresh }) {
  const today   = new Date().toISOString().split('T')[0]
  const curYear = new Date().getFullYear()
  const curMonth= new Date().getMonth() + 1

  // ── Filters ────────────────────────────────────────────────
  const [viewMode,     setViewMode]     = useState('day')       // day | month | year | range
  const [selDate,      setSelDate]      = useState(today)
  const [selMonth,     setSelMonth]     = useState(curMonth)
  const [selYear,      setSelYear]      = useState(curYear)
  const [dateFrom,     setDateFrom]     = useState(today)
  const [dateTo,       setDateTo]       = useState(today)
  const [filterMgr,    setFilterMgr]    = useState('all')       // manager id or 'all'
  const [filterBrand,  setFilterBrand]  = useState('all')
  const [groupBy,      setGroupBy]      = useState('product')   // product | brand | manager | date
  const [rawEntries,   setRawEntries]   = useState([])
  const [loading,      setLoading]      = useState(false)
  const [lastRefresh,  setLastRefresh]  = useState(Date.now())
  const safeManagers = useMemo(() => Array.isArray(managers) ? managers.filter(Boolean) : [], [managers])

  // ── Auto-refresh every 30s ──────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setLastRefresh(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // ── Load data whenever filters change ──────────────────────
  useEffect(() => {
    setLoading(true)
    try {
      let from, to
      if (viewMode === 'day') {
        from = to = selDate
      } else if (viewMode === 'month') {
        const m = String(selMonth).padStart(2,'0')
        from = `${selYear}-${m}-01`
        to   = `${selYear}-${m}-31`
      } else if (viewMode === 'year') {
        from = `${selYear}-01-01`
        to   = `${selYear}-12-31`
      } else {
        from = dateFrom; to = dateTo
      }
      const mgrId = filterMgr === 'all' ? null : parseInt(filterMgr)
      const all = getAllProductDayEntriesSync(from, to, mgrId) || []
      setRawEntries(Array.isArray(all) ? all : [])
    } catch(e) {
      setRawEntries([])
    }
    setLoading(false)
  }, [viewMode, selDate, selMonth, selYear, dateFrom, dateTo, filterMgr, lastRefresh])

  // ── Derive available brands from loaded entries ─────────────
  const safeEntries = useMemo(() => (Array.isArray(rawEntries) ? rawEntries : []).map((entry) => ({
    ...entry,
    date: entry?.date || '',
    manager_name: entry?.manager_name || 'Unknown',
    manager_territory: entry?.manager_territory || '',
    brand: entry?.brand || '',
    product_name: entry?.product_name || 'Unknown product',
    target_amount: Number(entry?.target_amount || 0),
    achieved_amount: Number(entry?.achieved_amount || 0),
    target_qty: Number(entry?.target_qty || 0),
    achieved_qty: Number(entry?.achieved_qty || 0),
  })), [rawEntries])

  const allBrands = useMemo(() => {
    const brands = [...new Set(safeEntries.map(e => e.brand).filter(Boolean))].sort()
    return brands
  }, [safeEntries])

  // ── Apply brand filter ──────────────────────────────────────
  const entries = useMemo(() =>
    filterBrand === 'all' ? safeEntries : safeEntries.filter(e => e.brand === filterBrand),
  [safeEntries, filterBrand])

  // ── Summary KPIs ────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalTarget   = entries.reduce((s,e) => s + (e.target_amount||0),   0)
    const totalAchieved = entries.reduce((s,e) => s + (e.achieved_amount||0), 0)
    const totalQtyT     = entries.reduce((s,e) => s + (e.target_qty||0),      0)
    const totalQtyA     = entries.reduce((s,e) => s + (e.achieved_qty||0),    0)
    const pct           = totalTarget > 0 ? Math.round((totalAchieved/totalTarget)*100) : 0
    const pctQty        = totalQtyT   > 0 ? Math.round((totalQtyA/totalQtyT)*100)       : 0
    const brands        = new Set(entries.map(e=>e.brand).filter(Boolean)).size
    const products      = new Set(entries.map(e=>e.product_name).filter(Boolean)).size
    const mgrCount      = new Set(entries.map(e=>e.manager_id).filter(Boolean)).size
    return { totalTarget, totalAchieved, totalQtyT, totalQtyA, pct, pctQty, brands, products, mgrCount, count: entries.length }
  }, [entries])

  // ── Group-by logic ──────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = {}
    entries.forEach(e => {
      let key, label, sub
      if (groupBy === 'product') {
        key   = e.product_name || 'Unknown'
        label = key
        sub   = e.brand || '—'
      } else if (groupBy === 'brand') {
        key   = e.brand || 'Unknown'
        label = key
        sub   = null
      } else if (groupBy === 'manager') {
        key   = String(e.manager_id || 'x')
        label = e.manager_name || 'Unknown'
        sub   = e.manager_territory || ''
      } else {
        key   = e.date
        label = new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
        sub   = null
      }
      if (!map[key]) map[key] = { key, label, sub, target: 0, achieved: 0, qtyT: 0, qtyA: 0, count: 0, entries: [] }
      map[key].target   += (e.target_amount  || 0)
      map[key].achieved += (e.achieved_amount || 0)
      map[key].qtyT     += (e.target_qty     || 0)
      map[key].qtyA     += (e.achieved_qty   || 0)
      map[key].count    += 1
      map[key].entries.push(e)
    })
    return Object.values(map)
      .map(g => ({ ...g, pct: g.target > 0 ? Math.round((g.achieved/g.target)*100) : 0 }))
      .sort((a,b) => b.achieved - a.achieved)
  }, [entries, groupBy])

  // ── Day-by-day detail rows (flat, sorted by date desc) ─────
  const flatRows = useMemo(() =>
    [...entries].sort((a,b) => b.date.localeCompare(a.date) || (a.manager_name||'').localeCompare(b.manager_name||'')),
  [entries])

  const [showFlat, setShowFlat] = useState(false)

  // ── Manual refresh ─────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setLastRefresh(Date.now())
    onRefresh?.()
  }, [onRefresh])

  const yearOptions = Array.from({ length: 4 }, (_, i) => curYear - i)

  return (
    <div style={{ fontFamily: 'inherit' }}>

      {/* ── Filter bar ── */}
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB',
        padding: '14px 16px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
      }}>

        {/* View mode pills */}
        <div>
          <div style={labelStyle}>View</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['day','Day'],['month','Month'],['year','Year'],['range','Range']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={pillStyle(viewMode === v)}>{l}</button>
            ))}
          </div>
        </div>

        {/* Date pickers per mode */}
        {viewMode === 'day' && (
          <div>
            <div style={labelStyle}>Date</div>
            <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} style={inputS}/>
          </div>
        )}
        {viewMode === 'month' && (
          <>
            <div>
              <div style={labelStyle}>Month</div>
              <select value={selMonth} onChange={e => setSelMonth(+e.target.value)} style={inputS}>
                {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Year</div>
              <select value={selYear} onChange={e => setSelYear(+e.target.value)} style={inputS}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </>
        )}
        {viewMode === 'year' && (
          <div>
            <div style={labelStyle}>Year</div>
            <select value={selYear} onChange={e => setSelYear(+e.target.value)} style={inputS}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {viewMode === 'range' && (
          <>
            <div>
              <div style={labelStyle}>From</div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputS}/>
            </div>
            <div>
              <div style={labelStyle}>To</div>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputS}/>
            </div>
          </>
        )}

        {/* Manager filter */}
        <div>
          <div style={labelStyle}>Manager</div>
          <select value={filterMgr} onChange={e => setFilterMgr(e.target.value)} style={{...inputS, maxWidth: 160}}>
            <option value="all">All Managers</option>
            {safeManagers.filter(m => m.role !== 'Admin').map(m => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>

        {/* Brand filter (dynamic from loaded data) */}
        <div>
          <div style={labelStyle}>Brand</div>
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{...inputS, maxWidth: 140}}>
            <option value="all">All Brands</option>
            {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Group by */}
        <div>
          <div style={labelStyle}>Group By</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['product','Product'],['brand','Brand'],['manager','Manager'],['date','Date']].map(([v,l]) => (
              <button key={v} onClick={() => setGroupBy(v)} style={pillStyle(groupBy === v)}>{l}</button>
            ))}
          </div>
        </div>

        {/* Refresh */}
        <button onClick={handleRefresh} style={{
          padding: '7px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB',
          background: '#F9FAFB', color: '#374151', cursor: 'pointer',
          fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
          alignSelf: 'flex-end',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>

        {loading && (
          <div style={{ fontSize: '0.68rem', color: '#9CA3AF', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, border: '2px solid #E5E7EB', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin .7s linear infinite' }}/>
            Loading…
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#9CA3AF', alignSelf: 'center', textAlign: 'right' }}>
          Auto-syncs every 30s<br/>
          <span style={{ color: '#10B981', fontWeight: 700 }}>● Live</span>
        </div>
      </div>

      {/* ── KPI summary row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Entries',        val: kpis.count,               sub: `${kpis.mgrCount} manager(s)`,        color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Target (₹)',     val: fmtK(kpis.totalTarget),   sub: `${kpis.products} products`,          color: '#7C3AED', bg: '#F5F3FF' },
          { label: 'Achieved (₹)',   val: fmtK(kpis.totalAchieved), sub: `${kpis.brands} brand(s)`,            color: '#059669', bg: '#ECFDF5' },
          { label: 'Amount %',       val: `${kpis.pct}%`,           sub: `${fmt(kpis.totalAchieved)} of ${fmt(kpis.totalTarget)}`, color: pctColor(kpis.pct), bg: pctBg(kpis.pct) },
          { label: 'Qty Achieved',   val: kpis.totalQtyA,           sub: `Target: ${kpis.totalQtyT}`,          color: '#D97706', bg: '#FFFBEB' },
          { label: 'Qty %',          val: `${kpis.pctQty}%`,        sub: `${kpis.totalQtyA} / ${kpis.totalQtyT}`, color: pctColor(kpis.pctQty), bg: pctBg(kpis.pctQty) },
        ].map((k,i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: k.color, fontFamily: 'monospace', lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: '0.6rem', color: '#9CA3AF', marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Grouped cards ── */}
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#374151' }}>No product entries found</div>
          <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Try changing the date range or filters</div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {groupBy === 'product' ? 'By Product' : groupBy === 'brand' ? 'By Brand' : groupBy === 'manager' ? 'By Manager' : 'By Date'} — {grouped.length} group(s)
            </div>
            <button onClick={() => setShowFlat(f => !f)} style={{
              padding: '4px 10px', borderRadius: 6, border: '1.5px solid #E5E7EB',
              background: showFlat ? '#EFF6FF' : '#F9FAFB',
              color: showFlat ? '#2563EB' : '#374151',
              fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
            }}>
              {showFlat ? '▲ Hide Raw Entries' : '▼ Show All Entries'}
            </button>
          </div>

          {/* Grouped summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10, marginBottom: 14 }}>
            {grouped.map(g => (
              <GroupCard key={g.key} g={g} groupBy={groupBy}/>
            ))}
          </div>

          {/* Raw flat table */}
          {showFlat && <FlatTable rows={flatRows} groupBy={groupBy}/>}
        </>
      )}
    </div>
  )
})

// ── Group summary card ────────────────────────────────────────
const GroupCard = memo(function GroupCard({ g, groupBy }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {g.sub && (
              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                {groupBy === 'product' ? `🏷 ${g.sub}` : groupBy === 'manager' ? `📍 ${g.sub}` : g.sub}
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.label}
            </div>
            <div style={{ fontSize: '0.62rem', color: '#9CA3AF', marginTop: 2 }}>{g.count} entr{g.count===1?'y':'ies'}</div>
          </div>
          <PctBadge pct={g.pct}/>
        </div>
        <MiniBar pct={g.pct}/>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#F9FAFB' }}>
        {[
          { l: 'Target', v: fmt(g.target) },
          { l: 'Achieved', v: fmt(g.achieved) },
          { l: 'Qty Target', v: g.qtyT },
          { l: 'Qty Achieved', v: g.qtyA },
        ].map((m,i) => (
          <div key={i} style={{ background: '#fff', padding: '10px 14px', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: '0.58rem', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.l}</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: i===1?'#059669':'#111827', fontFamily: 'monospace', marginTop: 2 }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Expand detail */}
      {g.entries.length > 0 && (
        <div>
          <button onClick={() => setOpen(o => !o)} style={{
            width: '100%', padding: '8px 16px', border: 'none', background: '#FAFAFA',
            borderTop: '1px solid #F3F4F6', cursor: 'pointer',
            fontSize: '0.68rem', fontWeight: 700, color: '#6B7280',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            {open ? '▲ Hide detail' : `▼ ${g.entries.length} detail row${g.entries.length===1?'':'s'}`}
          </button>
          {open && (
            <div style={{ borderTop: '1px solid #F3F4F6' }}>
              {g.entries.map((e,i) => (
                <div key={e.id||i} style={{
                  padding: '10px 14px', borderBottom: i<g.entries.length-1 ? '1px solid #F9FAFB' : 'none',
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
                }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: '#9CA3AF', fontWeight: 700 }}>
                      {e.date} · {e.manager_name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', marginTop: 1 }}>
                      {e.product_name}
                    </div>
                    {e.brand && <div style={{ fontSize: '0.6rem', color: '#7C3AED', fontWeight: 600 }}>{e.brand}</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.58rem', color: '#9CA3AF', fontWeight: 700 }}>QTY</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>
                      <span style={{ color: '#059669' }}>{e.achieved_qty}</span>
                      <span style={{ color: '#D1D5DB' }}>/{e.target_qty}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.58rem', color: '#9CA3AF', fontWeight: 700 }}>AMOUNT</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>{fmt(e.achieved_amount)}</div>
                    <div style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>of {fmt(e.target_amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ── Flat table view ───────────────────────────────────────────
function FlatTable({ rows }) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Date','Manager','Brand','Product','Qty T','Qty A','Amt Target','Amt Achieved','%'].map(h => (
                <th key={h} style={{
                  padding: '9px 10px', textAlign: 'left',
                  fontSize: '0.62rem', fontWeight: 800, color: '#6B7280',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => {
              const pct = e.target_amount > 0 ? Math.round((e.achieved_amount/e.target_amount)*100) : 0
              return (
                <tr key={e.id||i} style={{ background: i%2===0 ? '#fff' : '#FAFAFA' }}>
                  <td style={tdS}>{e.date}</td>
                  <td style={tdS}>
                    <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>{e.manager_name||'—'}</div>
                    {e.manager_territory && <div style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>{e.manager_territory}</div>}
                  </td>
                  <td style={tdS}><span style={{ background: '#F5F3FF', color: '#7C3AED', borderRadius: 5, padding: '2px 6px', fontSize: '0.68rem', fontWeight: 700 }}>{e.brand||'—'}</span></td>
                  <td style={tdS}><div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{e.product_name||'—'}</div></td>
                  <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>{e.target_qty||0}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: '#059669', fontWeight: 700 }}>{e.achieved_qty||0}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontSize: '0.72rem' }}>{fmt(e.target_amount)}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>{fmt(e.achieved_amount)}</td>
                  <td style={{ ...tdS, textAlign: 'center' }}><PctBadge pct={pct}/></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────
const pillStyle = active => ({
  padding: '5px 10px', borderRadius: 7, border: '1.5px solid',
  fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer',
  background: active ? '#2563EB' : '#F9FAFB',
  color:      active ? '#fff'     : '#6B7280',
  borderColor:active ? '#2563EB' : '#E5E7EB',
  transition: 'all .15s',
})
const inputS = {
  padding: '6px 9px', borderRadius: 8, border: '1.5px solid #E5E7EB',
  fontSize: '0.78rem', fontFamily: 'inherit', color: '#111827',
  background: '#FAFAFA', outline: 'none',
}
const labelStyle = { fontSize: '0.6rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }
const tdS = { padding: '9px 10px', fontSize: '0.75rem', color: '#374151', borderBottom: '1px solid #F3F4F6', verticalAlign: 'top' }

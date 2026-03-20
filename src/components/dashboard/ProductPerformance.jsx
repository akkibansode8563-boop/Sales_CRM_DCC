import { memo, useState, useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'
import { Badge, ProgressBar } from '../ui/index'

const fmt = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const fmtK = v => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v || 0

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,padding:'10px 14px',boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
      <div style={{fontWeight:700,fontSize:'0.8rem',color:'#374151',marginBottom:6}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.75rem',color:'#6b7280',marginBottom:2}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:p.fill,display:'inline-block'}}/>
          {p.name}: <strong style={{color:'#111827'}}>₹{Number(p.value).toLocaleString('en-IN')}</strong>
        </div>
      ))}
    </div>
  )
}

export default memo(function ProductPerformance({ productEntries = [], period = 'month' }) {
  const [view, setView] = useState('top_products')

  const stats = useMemo(() => {
    const productMap = {}
    const brandMap = {}

    productEntries.forEach(p => {
      // Product aggregation
      const pk = p.product_name || 'Unknown'
      if (!productMap[pk]) productMap[pk] = { name:pk, brand:p.brand||'—', target:0, achieved:0, qty_target:0, qty_achieved:0, days:0 }
      productMap[pk].target     += (p.target_amount  || 0)
      productMap[pk].achieved   += (p.achieved_amount || 0)
      productMap[pk].qty_target += (p.target_qty  || 0)
      productMap[pk].qty_achieved += (p.achieved_qty || 0)
      productMap[pk].days++

      // Brand aggregation
      const bk = p.brand || 'Unknown Brand'
      if (!brandMap[bk]) brandMap[bk] = { name:bk, target:0, achieved:0, products:0 }
      brandMap[bk].target   += (p.target_amount  || 0)
      brandMap[bk].achieved += (p.achieved_amount || 0)
      brandMap[bk].products++
    })

    const products = Object.values(productMap)
      .sort((a,b) => b.achieved - a.achieved)
      .map(p => ({ ...p, pct: p.target > 0 ? Math.round((p.achieved/p.target)*100) : 0 }))

    const brands = Object.values(brandMap)
      .sort((a,b) => b.achieved - a.achieved)
      .map(b => ({ ...b, pct: b.target > 0 ? Math.round((b.achieved/b.target)*100) : 0 }))

    const totalAchieved = productEntries.reduce((s,p) => s + (p.achieved_amount||0), 0)
    const totalTarget   = productEntries.reduce((s,p) => s + (p.target_amount||0), 0)

    return { products, brands, totalAchieved, totalTarget,
      overallPct: totalTarget > 0 ? Math.round((totalAchieved/totalTarget)*100) : 0 }
  }, [productEntries])

  const COLORS = ['#2563EB','#10B981','#F59E0B','#7C3AED','#EF4444','#EC4899','#06B6D4','#F97316']

  if (productEntries.length === 0) return (
    <div style={{textAlign:'center',padding:'40px',color:'#9CA3AF'}}>
      <div style={{fontSize:'2.5rem',marginBottom:8,opacity:0.4}}>&#x1F4E6;</div>
      <div style={{fontSize:'0.83rem',fontWeight:600,color:'#374151'}}>No product data yet</div>
      <div style={{fontSize:'0.75rem',marginTop:4}}>Managers need to log product day entries</div>
    </div>
  )

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
        {[
          {l:'Total Products',  v:stats.products.length,    bg:'#EFF6FF',tc:'#2563EB'},
          {l:'Top Brand',       v:stats.brands[0]?.name||'—', bg:'#F5F3FF',tc:'#7C3AED'},
          {l:'Total Achieved',  v:fmt(stats.totalAchieved), bg:'#ECFDF5',tc:'#059669'},
          {l:'Achievement',     v:stats.overallPct+'%',     bg:'#FFFBEB',tc:'#D97706'},
        ].map((k,i) => (
          <div key={i} style={{background:k.bg,borderRadius:10,padding:'12px 14px'}}>
            <div style={{fontSize:'0.62rem',fontWeight:800,color:k.tc,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{k.l}</div>
            <div style={{fontFamily:'monospace',fontWeight:800,fontSize:'0.95rem',color:'#111827'}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* View Tabs */}
      <div style={{display:'flex',gap:6,marginBottom:14}}>
        {[{id:'top_products',l:'Top Products'},{id:'brands',l:'By Brand'},{id:'chart',l:'Chart'}].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{padding:'5px 14px',borderRadius:20,border:'1.5px solid',fontWeight:700,fontSize:'0.75rem',cursor:'pointer',
              background:view===v.id?'#2563EB':'#F9FAFB',
              color:view===v.id?'#fff':'#6B7280',
              borderColor:view===v.id?'#2563EB':'#E5E7EB'}}>
            {v.l}
          </button>
        ))}
      </div>

      {/* Top Products Table */}
      {view === 'top_products' && (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:500}}>
            <thead>
              <tr style={{background:'#F9FAFB'}}>
                {['Product','Brand','Achieved','Target','Achievement','Qty'].map(h => (
                  <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:'0.65rem',
                    fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',
                    borderBottom:'1.5px solid #E5E7EB',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.products.map((p,i) => (
                <tr key={i} style={{borderBottom:'1px solid #F3F4F6',transition:'background 0.1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'11px 14px'}}>
                    <div style={{fontWeight:700,fontSize:'0.83rem',color:'#111827'}}>{p.name}</div>
                  </td>
                  <td style={{padding:'11px 14px'}}>
                    <span style={{background:'#F5F3FF',color:'#7C3AED',padding:'2px 8px',borderRadius:99,fontSize:'0.65rem',fontWeight:700}}>{p.brand}</span>
                  </td>
                  <td style={{padding:'11px 14px',fontFamily:'monospace',fontWeight:700,color:'#2563EB',fontSize:'0.83rem'}}>{fmt(p.achieved)}</td>
                  <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:'0.83rem',color:'#6B7280'}}>{fmt(p.target)}</td>
                  <td style={{padding:'11px 14px',minWidth:120}}>
                    <ProgressBar value={p.achieved} max={p.target} showLabel={true}/>
                  </td>
                  <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:'0.83rem',color:'#374151'}}>
                    {p.qty_achieved}/{p.qty_target}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Brand Performance */}
      {view === 'brands' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {stats.brands.map((b,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
              background:'#F9FAFB',borderRadius:10,border:'1px solid #E5E7EB'}}>
              <div style={{width:36,height:36,borderRadius:10,background:COLORS[i%COLORS.length],
                color:'#fff',fontWeight:800,fontSize:'0.85rem',
                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {b.name[0]}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:'0.83rem',color:'#111827',marginBottom:4}}>{b.name}</div>
                <ProgressBar value={b.achieved} max={b.target}/>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontFamily:'monospace',fontWeight:700,fontSize:'0.83rem',color:'#111827'}}>{fmt(b.achieved)}</div>
                <div style={{fontSize:'0.68rem',color:'#9CA3AF',marginTop:1}}>{b.pct}% of target</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart View */}
      {view === 'chart' && (
        <div style={{height:250}}>
          <ResponsiveContainer>
            <BarChart data={stats.products.slice(0,10)} layout="vertical"
              margin={{top:4,right:60,left:8,bottom:4}} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F0F0"/>
              <XAxis type="number" tick={{fontSize:11,fill:'#9CA3AF'}} tickLine={false} axisLine={false}
                tickFormatter={fmtK}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#374151'}}
                tickLine={false} axisLine={false} width={100}
                tickFormatter={v => v.length > 14 ? v.slice(0,14)+'...' : v}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="achieved" name="Achieved" radius={[0,4,4,0]}>
                {stats.products.slice(0,10).map((_, i) => <Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
})

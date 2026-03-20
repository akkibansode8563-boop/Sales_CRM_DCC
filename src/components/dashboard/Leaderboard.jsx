const fmt = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '₹0'
const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316']

const MEDALS = ['#F59E0B','#9CA3AF','#CD7F32']

export default function Leaderboard({ managers = [], period = 'month' }) {
  // Sort by sales descending
  const ranked = [...managers]
    .filter(m => m.totalSales > 0 || m.visits > 0)
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 10)

  if (ranked.length === 0) {
    return (
      <div style={{textAlign:'center',padding:'32px 0',color:'#9ca3af'}}>
        <div style={{fontSize:'2rem',marginBottom:8}}>&#x1F3C6;</div>
        <div style={{fontSize:'0.83rem'}}>No data yet. Sales will appear here once managers log reports.</div>
      </div>
    )
  }

  const topSales = ranked[0]?.totalSales || 1

  return (
    <div>
      {ranked.map((m, i) => {
        const pct = topSales > 0 ? Math.round((m.totalSales / topSales) * 100) : 0
        const medal = i < 3 ? MEDALS[i] : null
        const achievePct = m.totalSalesTgt > 0 ? Math.round((m.totalSales / m.totalSalesTgt) * 100) : 0

        return (
          <div key={m.id} style={{
            display:'flex', alignItems:'center', gap:12, padding:'11px 0',
            borderBottom: i < ranked.length - 1 ? '1px solid #f3f4f6' : 'none'
          }}>
            {/* Rank */}
            <div style={{
              width:28, height:28, borderRadius:'50%', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: medal ? medal : '#f3f4f6',
              color: medal ? '#fff' : '#6b7280',
              fontWeight:800, fontSize: medal ? '0.75rem' : '0.72rem'
            }}>
              {i === 0 ? '&#x1F947;' : i === 1 ? '&#x1F948;' : i === 2 ? '&#x1F949;' : `#${i+1}`}
            </div>

            {/* Avatar */}
            <div style={{
              width:32, height:32, borderRadius:9, flexShrink:0,
              background: AVATAR_COLORS[i % AVATAR_COLORS.length],
              color:'#fff', fontWeight:800, fontSize:'0.82rem',
              display:'flex', alignItems:'center', justifyContent:'center'
            }}>
              {m.name?.[0]}
            </div>

            {/* Info */}
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:700, fontSize:'0.83rem', color:'#111827', 
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                {m.name}
              </div>
              <div style={{fontSize:'0.68rem', color:'#9ca3af', marginTop:1}}>
                {m.territory || 'No territory'} &middot; {m.visits} visits
              </div>
              {/* Progress bar */}
              <div style={{height:4, background:'#f3f4f6', borderRadius:99, marginTop:5, overflow:'hidden'}}>
                <div style={{
                  height:'100%', width:`${pct}%`,
                  background: i===0 ? '#F59E0B' : i===1 ? '#9CA3AF' : i===2 ? '#CD7F32' : '#2563EB',
                  borderRadius:99, transition:'width 0.6s ease'
                }}/>
              </div>
            </div>

            {/* Sales + achievement */}
            <div style={{textAlign:'right', flexShrink:0}}>
              <div style={{fontFamily:'monospace', fontWeight:700, fontSize:'0.83rem', color:'#111827'}}>
                {fmt(m.totalSales)}
              </div>
              {achievePct > 0 && (
                <div style={{
                  fontSize:'0.62rem', fontWeight:800, padding:'1px 6px', borderRadius:99, marginTop:2,
                  background: achievePct >= 100 ? '#ECFDF5' : achievePct >= 75 ? '#EFF6FF' : '#FFFBEB',
                  color: achievePct >= 100 ? '#059669' : achievePct >= 75 ? '#2563EB' : '#D97706'
                }}>
                  {achievePct}%
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PRIORITY_META = {
  high:   { bg:'#FEF2F2', border:'#FECACA', color:'#DC2626', dot:'#EF4444' },
  medium: { bg:'#FFFBEB', border:'#FDE68A', color:'#D97706', dot:'#F59E0B' },
  low:    { bg:'#F0FDF4', border:'#BBF7D0', color:'#059669', dot:'#10B981' },
}

const ICON_MAP = {
  'visit_suggestion': '&#x1F3AF;',
  'revisit':         '&#x1F504;',
  'report':          '&#x1F4CA;',
  'performance':     '&#x26A0;',
  'nearby':          '&#x1F4CD;',
  'sales_up':        '&#x1F4C8;',
  'sales_down':      '&#x1F4C9;',
}

export default function AIInsights({ suggestions = [], managerName = '' }) {
  if (!suggestions || suggestions.length === 0) {
    return (
      <div style={{textAlign:'center',padding:'28px 16px',color:'#9ca3af'}}>
        <div style={{fontSize:'1.8rem',marginBottom:8}}>&#x1F916;</div>
        <div style={{fontSize:'0.8rem',fontWeight:600,color:'#374151',marginBottom:4}}>All Clear</div>
        <div style={{fontSize:'0.75rem'}}>No suggestions for {managerName || 'this manager'} right now.</div>
      </div>
    )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {suggestions.map((s, i) => {
        const meta = PRIORITY_META[s.priority] || PRIORITY_META.medium
        const icon = ICON_MAP[s.type] || '&#x1F4A1;'
        return (
          <div key={i} style={{
            display:'flex', gap:10, padding:'11px 13px',
            background:meta.bg, border:`1px solid ${meta.border}`,
            borderRadius:10, alignItems:'flex-start'
          }}>
            <div style={{
              width:32, height:32, borderRadius:9, flexShrink:0,
              background:'#fff', border:`1px solid ${meta.border}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1rem'
            }} dangerouslySetInnerHTML={{__html: icon}}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:700, fontSize:'0.82rem', color:'#111827', marginBottom:2}}>
                {s.title}
              </div>
              <div style={{fontSize:'0.73rem', color:'#6b7280', lineHeight:1.4}}>
                {s.desc}
              </div>
              {s.customer && (
                <div style={{
                  marginTop:5, fontSize:'0.68rem', fontWeight:700,
                  color:meta.color, display:'flex', alignItems:'center', gap:4
                }}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:meta.dot,display:'inline-block'}}/>
                  {s.customer.name} &middot; {s.customer.type || 'Customer'}
                </div>
              )}
            </div>
            <span style={{
              fontSize:'0.58rem', fontWeight:800, padding:'2px 7px', borderRadius:99,
              background:'#fff', color:meta.color, border:`1px solid ${meta.border}`,
              flexShrink:0, textTransform:'uppercase', letterSpacing:'0.05em'
            }}>
              {s.priority}
            </span>
          </div>
        )
      })}
    </div>
  )
}

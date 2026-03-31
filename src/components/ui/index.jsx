import { memo } from 'react'

/* --- Card ------------------------------- */
export const Card = memo(({ children, className='', padding='18px 20px', hover=false, onClick, style={} }) => (
  <div
    onClick={onClick}
    style={{
      background:'#fff', border:'1px solid #E5E7EB',
      borderRadius:16, padding, boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
      transition:'box-shadow 0.15s, transform 0.15s',
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }}
    onMouseEnter={e => { if(hover||onClick){ e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.transform='translateY(-1px)' }}}
    onMouseLeave={e => { if(hover||onClick){ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform='translateY(0)' }}}
    className={className}
  >
    {children}
  </div>
))

/* --- KPI Card ---------------------------- */
export const KPICard = memo(({ icon, iconBg='#EFF6FF', iconColor='#2563EB', value, label, badge, trend, onClick }) => (
  <Card hover={!!onClick} onClick={onClick} padding="18px 16px">
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
      <div style={{width:40, height:40, borderRadius:12, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', color:iconColor}}>
        {icon}
      </div>
      {badge && <span style={{fontSize:'0.62rem', fontWeight:800, padding:'3px 9px', borderRadius:99, background:iconBg, color:iconColor}}>{badge}</span>}
    </div>
    <div style={{fontFamily:'monospace', fontSize:'1.8rem', fontWeight:700, color:'#111827', lineHeight:1, marginBottom:4}}>{value}</div>
    <div style={{fontSize:'0.65rem', color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700}}>{label}</div>
    {trend !== undefined && (
      <div style={{fontSize:'0.7rem', fontWeight:700, marginTop:6, color:trend >= 0 ? '#059669' : '#DC2626'}}>
        {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs yesterday
      </div>
    )}
  </Card>
))

/* --- Badge ------------------------------- */
const BADGE_STYLES = {
  success: { bg:'#ECFDF5', color:'#059669' },
  warning: { bg:'#FFFBEB', color:'#D97706' },
  danger:  { bg:'#FEF2F2', color:'#DC2626' },
  info:    { bg:'#EFF6FF', color:'#2563EB' },
  purple:  { bg:'#F5F3FF', color:'#7C3AED' },
  gray:    { bg:'#F3F4F6', color:'#6B7280' },
  pink:    { bg:'#FDF2F8', color:'#EC4899' },
}
export const Badge = memo(({ variant='info', children, size='sm', dot=false }) => {
  const s = BADGE_STYLES[variant] || BADGE_STYLES.info
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding: size==='xs' ? '2px 7px' : size==='sm' ? '3px 10px' : '5px 13px',
      borderRadius:99, fontSize: size==='xs' ? '0.58rem' : size==='sm' ? '0.68rem' : '0.78rem',
      fontWeight:700, background:s.bg, color:s.color
    }}>
      {dot && <span style={{width:6, height:6, borderRadius:'50%', background:s.color, display:'inline-block'}}/>}
      {children}
    </span>
  )
})

/* --- Status Badge ------------------------ */
const STATUS_VARIANTS = {
  'On Field':       'success',
  'In-Office':      'info',
  'Lunch Break':    'warning',
  'Travel':         'purple',
  'Meeting':        'pink',
  'Work From Home': 'gray',
}
export const StatusBadge = memo(({ status, pulse=false }) => {
  const variant = STATUS_VARIANTS[status] || 'gray'
  const s = BADGE_STYLES[variant]
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'4px 10px', borderRadius:99, fontSize:'0.68rem', fontWeight:700,
      background:s.bg, color:s.color
    }}>
      <span style={{
        width:6, height:6, borderRadius:'50%', background:s.color, display:'inline-block',
        animation: pulse && status==='On Field' ? 'pulse 1.5s infinite' : 'none'
      }}/>
      {status}
    </span>
  )
})

/* --- Modal ------------------------------- */
export const Modal = memo(({ open, onClose, title, children, footer, maxWidth=520 }) => {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{position:'fixed', inset:0, background:'rgba(17,24,39,0.5)', zIndex:1000,
        display:'flex', alignItems:'flex-end', backdropFilter:'blur(4px)',
        animation:'fadeIn 0.15s ease'}}
    >
      <div
        onClick={e=>e.stopPropagation()}
        style={{background:'#fff', borderRadius:'20px 20px 0 0', width:'100%',
          maxWidth, margin:'0 auto', maxHeight:'92vh', overflowY:'auto',
          boxShadow:'0 -4px 32px rgba(0,0,0,0.15)',
          animation:'slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)'}}
      >
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'18px 20px 14px', borderBottom:'1px solid #E5E7EB',
          position:'sticky', top:0, background:'#fff', zIndex:10,
          borderRadius:'20px 20px 0 0'}}>
          <div style={{fontWeight:900, fontSize:'1rem', color:'#111827'}}>{title}</div>
          <button onClick={onClose}
            style={{background:'#F3F4F6', border:'none', borderRadius:'50%',
              width:30, height:30, cursor:'pointer', color:'#6B7280',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem'}}>
            &#x2715;
          </button>
        </div>
        <div style={{padding:'18px 20px', display:'flex', flexDirection:'column', gap:14}}>
          {children}
        </div>
        {footer && (
          <div style={{padding:'12px 20px', borderTop:'1px solid #E5E7EB',
            display:'grid', gridTemplateColumns:'1fr 2fr', gap:10}}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
})

/* --- Alert Toast ------------------------- */
export const Toast = memo(({ msg, type='success' }) => {
  const colors = { success:'#111827', error:'#DC2626', info:'#2563EB', warning:'#D97706' }
  return (
    <div style={{
      position:'fixed', top:18, left:'50%', transform:'translateX(-50%)',
      padding:'10px 20px', borderRadius:99, fontSize:'0.8rem', fontWeight:700,
      zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.15)', whiteSpace:'nowrap',
      background:colors[type]||colors.success, color:'#fff',
      animation:'slideDown 0.22s ease', display:'flex', alignItems:'center', gap:8
    }}>
      {msg}
    </div>
  )
})

/* --- Progress Bar ------------------------ */
export const ProgressBar = memo(({ value=0, max=100, color='#2563EB', height=6, showLabel=false }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value/max)*100)) : 0
  const barColor = pct >= 100 ? '#10B981' : pct >= 75 ? '#2563EB' : pct >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <div>
      {showLabel && (
        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.7rem',
          fontWeight:700, color:'#374151', marginBottom:4}}>
          <span>{value?.toLocaleString?.() || value}</span>
          <span style={{color:barColor}}>{pct}%</span>
        </div>
      )}
      <div style={{height, background:'#F3F4F6', borderRadius:99, overflow:'hidden'}}>
        <div style={{height:'100%', width:`${pct}%`, background:barColor,
          borderRadius:99, transition:'width 0.6s ease'}}/>
      </div>
    </div>
  )
})

/* --- Avatar ------------------------------ */
const AVATAR_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899','#06B6D4','#F97316']
export const Avatar = memo(({ name='?', index=0, size=36, radius=10 }) => (
  <div style={{
    width:size, height:size, borderRadius:radius, flexShrink:0,
    background:AVATAR_COLORS[index % AVATAR_COLORS.length],
    color:'#fff', fontWeight:800, fontSize:size*0.38,
    display:'flex', alignItems:'center', justifyContent:'center'
  }}>
    {name?.[0]?.toUpperCase() || '?'}
  </div>
))

/* --- Empty State ------------------------- */
export const EmptyState = memo(({ icon='&#x1F4CB;', title='No data', subtitle='', action, onAction }) => (
  <div style={{textAlign:'center', padding:'48px 20px'}}>
    <div style={{fontSize:'2.5rem', marginBottom:12, opacity:0.4}} dangerouslySetInnerHTML={{__html:icon}}/>
    <div style={{fontSize:'0.88rem', fontWeight:700, color:'#374151', marginBottom:4}}>{title}</div>
    {subtitle && <div style={{fontSize:'0.78rem', color:'#9CA3AF', marginBottom:16}}>{subtitle}</div>}
    {action && (
      <button onClick={onAction}
        style={{background:'#2563EB', color:'#fff', border:'none', borderRadius:8,
          padding:'9px 20px', fontWeight:700, fontSize:'0.82rem', cursor:'pointer'}}>
        {action}
      </button>
    )}
  </div>
))

/* --- Section Header ---------------------- */
export const SectionHeader = memo(({ title, count, actions, subtitle }) => (
  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'14px 20px', borderBottom:'1px solid #F3F4F6', background:'#FAFAFA'}}>
    <div>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontWeight:900, fontSize:'0.95rem', color:'#111827'}}>{title}</span>
        {count !== undefined && (
          <span style={{fontSize:'0.7rem', fontWeight:700, color:'#6B7280',
            background:'#F3F4F6', border:'1px solid #E5E7EB',
            padding:'2px 8px', borderRadius:99}}>{count}</span>
        )}
      </div>
      {subtitle && <div style={{fontSize:'0.7rem', color:'#9CA3AF', marginTop:2}}>{subtitle}</div>}
    </div>
    {actions && <div style={{display:'flex', gap:8, alignItems:'center'}}>{actions}</div>}
  </div>
))

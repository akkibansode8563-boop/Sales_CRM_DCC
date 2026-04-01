import { memo, useState, useMemo } from 'react'
import { Badge, Avatar } from '../ui/index'

const fmt = (value) => value ? '₹' + Number(value).toLocaleString('en-IN') : '₹0'
const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null
const normalizeText = (value = '') => String(value).trim().toLowerCase()
const formatDue = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'No due date'

export default memo(function CustomerIntelligence({ customers = [], visits = [], managers = [], tasks = [] }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_visit')

  const managerById = useMemo(
    () => new Map((Array.isArray(managers) ? managers : []).map((manager) => [manager.id, manager])),
    [managers]
  )

  const visitsByCustomer = useMemo(() => {
    const map = new Map()

    ;(Array.isArray(visits) ? visits : []).forEach((visit) => {
      if (!visit?.customer_id) return
      if (!map.has(visit.customer_id)) map.set(visit.customer_id, [])
      map.get(visit.customer_id).push(visit)
    })

    map.forEach((customerVisits, customerId) => {
      map.set(customerId, [...customerVisits].sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0)))
    })

    return map
  }, [visits])

  const tasksByCustomer = useMemo(() => {
    const map = new Map()
    ;(Array.isArray(tasks) ? tasks : []).forEach((task) => {
      if (!task?.customer_id || task?.deleted_at) return
      if (!map.has(task.customer_id)) map.set(task.customer_id, [])
      map.get(task.customer_id).push(task)
    })

    map.forEach((customerTasks, customerId) => {
      map.set(
        customerId,
        [...customerTasks].sort((a, b) => new Date(a?.due_at || a?.created_at || 0) - new Date(b?.due_at || b?.created_at || 0))
      )
    })

    return map
  }, [tasks])

  const enriched = useMemo(() => {
    return (Array.isArray(customers) ? customers : []).map((customer) => {
      const customerVisits = visitsByCustomer.get(customer.id) || []
      const customerTasks = tasksByCustomer.get(customer.id) || []
      const openTasks = customerTasks.filter((task) => task.status !== 'completed')
      const lastVisit = customerVisits[0] || null
      const nextTask = openTasks[0] || null
      const overdueTasks = openTasks.filter((task) => task.due_at && new Date(task.due_at) < new Date())
      const totalSales = customerVisits.reduce((sum, visit) => sum + Number(visit?.sale_amount || 0), 0)
      const assignedMgr = managerById.get(customer.assigned_manager_id)
      const days = daysSince(lastVisit?.created_at)
      const customerAgeDays = Math.max(1, daysSince(customer.created_at) || 30)
      const frequency = customerVisits.length > 0 ? ((customerVisits.length / customerAgeDays) * 30).toFixed(1) : '0.0'
      const priority = overdueTasks.length > 0 || !lastVisit ? 'high' : days > 21 || openTasks.length > 0 ? 'medium' : 'low'

      const timeline = [
        ...customerVisits.slice(0, 2).map((visit) => ({
          id: `visit-${visit.id}`,
          type: 'visit',
          title: visit.visit_type || 'Visit',
          detail: visit.notes || visit.location || 'Visit logged',
          stamp: visit.created_at,
        })),
        ...openTasks.slice(0, 2).map((task) => ({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          detail: task.due_at ? `Due ${formatDue(task.due_at)}` : (task.description || 'Open follow-up'),
          stamp: task.due_at || task.created_at,
        })),
      ].sort((a, b) => new Date(b.stamp || 0) - new Date(a.stamp || 0)).slice(0, 3)

      return {
        ...customer,
        cVisits: customerVisits,
        lastVisit,
        totalSales,
        assignedMgr,
        days,
        frequency,
        priority,
        openTasks,
        overdueTasks,
        nextTask,
        timeline,
      }
    })
  }, [customers, managerById, tasksByCustomer, visitsByCustomer])

  const filtered = useMemo(() => {
    let list = enriched

    if (search) {
      const query = normalizeText(search)
      list = list.filter((customer) => (
        normalizeText(customer?.name).includes(query) ||
        normalizeText(customer?.type).includes(query) ||
        normalizeText(customer?.territory).includes(query) ||
        normalizeText(customer?.owner_name).includes(query) ||
        normalizeText(customer?.phone).includes(query)
      ))
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'last_visit') return new Date(b?.lastVisit?.created_at || 0) - new Date(a?.lastVisit?.created_at || 0)
      if (sortBy === 'visits') return (b?.cVisits?.length || 0) - (a?.cVisits?.length || 0)
      if (sortBy === 'sales') return (b?.totalSales || 0) - (a?.totalSales || 0)
      if (sortBy === 'priority') {
        const order = { high: 0, medium: 1, low: 2 }
        return (order[a?.priority] ?? 3) - (order[b?.priority] ?? 3)
      }
      if (sortBy === 'follow_up') return (b?.openTasks?.length || 0) - (a?.openTasks?.length || 0)
      return 0
    })
  }, [enriched, search, sortBy])

  const priorityVariant = { high: 'danger', medium: 'warning', low: 'success' }

  return (
    <div>
      <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customers..."
          style={{flex:1, minWidth:180, padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:'0.82rem', outline:'none', color:'#111827'}}
        />
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          style={{padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:'0.78rem', color:'#374151', background:'#F9FAFB', cursor:'pointer'}}
        >
          <option value="last_visit">Sort: Recent Visit</option>
          <option value="visits">Sort: Most Visits</option>
          <option value="sales">Sort: Most Sales</option>
          <option value="priority">Sort: Priority</option>
          <option value="follow_up">Sort: Follow-ups</option>
        </select>
        <span style={{fontSize:'0.72rem', color:'#9CA3AF', fontWeight:600}}>{filtered.length} customers</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{textAlign:'center', padding:'32px', color:'#9CA3AF'}}>
          <div style={{fontSize:'2rem', marginBottom:8}}>🏪</div>
          <div style={{fontSize:'0.83rem'}}>No customers found</div>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:12}}>
          {filtered.slice(0, 20).map((customer, index) => (
            <div
              key={customer.id}
              style={{
                background:'#fff',
                border:'1.5px solid',
                borderColor: customer.priority === 'high' ? '#FECACA' : customer.priority === 'medium' ? '#FDE68A' : '#E5E7EB',
                borderRadius:12,
                padding:'14px 16px',
                transition:'box-shadow 0.15s',
              }}
            >
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
                <Avatar name={customer.name} index={index} size={36} radius={10}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:700, fontSize:'0.85rem', color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                    {customer.name}
                  </div>
                  <div style={{fontSize:'0.68rem', color:'#9CA3AF', marginTop:1}}>
                    {customer.type || 'Customer'} • {customer.territory || '—'}
                  </div>
                </div>
                <Badge variant={priorityVariant[customer.priority]} size="xs">{customer.priority}</Badge>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10}}>
                <MetricCard label="Last Visit" value={customer.days !== null ? (customer.days === 0 ? 'Today' : `${customer.days}d ago`) : 'Never'} tone={customer.days > 21 ? '#DC2626' : '#111827'} />
                <MetricCard label="Visits" value={customer.cVisits.length} />
                <MetricCard label="Total Sales" value={fmt(customer.totalSales)} tone="#2563EB" />
                <MetricCard label="Open Tasks" value={customer.openTasks.length} tone={customer.overdueTasks.length > 0 ? '#DC2626' : '#111827'} />
              </div>

              {(customer.owner_name || customer.phone) && (
                <div style={{display:'flex', flexDirection:'column', gap:4, marginBottom:10}}>
                  {customer.owner_name && <div style={{fontSize:'0.7rem', color:'#374151', fontWeight:600}}>Owner: {customer.owner_name}</div>}
                  {customer.phone && <div style={{fontSize:'0.68rem', color:'#6B7280'}}>Phone: {customer.phone}</div>}
                </div>
              )}

              {customer.nextTask && (
                <div style={{marginBottom:10, padding:'9px 10px', borderRadius:10, background:customer.overdueTasks.length > 0 ? '#FEF2F2' : '#EFF6FF', border:`1px solid ${customer.overdueTasks.length > 0 ? '#FECACA' : '#BFDBFE'}`}}>
                  <div style={{fontSize:'0.62rem', fontWeight:800, color:customer.overdueTasks.length > 0 ? '#DC2626' : '#2563EB', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3}}>
                    Next Follow-up
                  </div>
                  <div style={{fontSize:'0.77rem', fontWeight:700, color:'#111827'}}>{customer.nextTask.title}</div>
                  <div style={{fontSize:'0.67rem', color:'#6B7280', marginTop:2}}>{formatDue(customer.nextTask.due_at)}</div>
                </div>
              )}

              {customer.timeline.length > 0 && (
                <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:10}}>
                  <div style={{fontSize:'0.62rem', color:'#9CA3AF', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em'}}>Recent Timeline</div>
                  {customer.timeline.map((entry) => (
                    <div key={entry.id} style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                      <div style={{width:9, height:9, borderRadius:'50%', background:entry.type === 'task' ? '#F59E0B' : '#2563EB', marginTop:6, flexShrink:0}}/>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:'0.73rem', fontWeight:700, color:'#111827'}}>{entry.title}</div>
                        <div style={{fontSize:'0.67rem', color:'#6B7280'}}>{entry.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {customer.assignedMgr && (
                <div style={{display:'flex', alignItems:'center', gap:6, fontSize:'0.7rem', color:'#6B7280'}}>
                  <span style={{width:16, height:16, borderRadius:'50%', background:'#2563EB', color:'#fff', fontSize:'0.55rem', fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
                    {customer.assignedMgr.full_name?.[0]}
                  </span>
                  {customer.assignedMgr.full_name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

function MetricCard({ label, value, tone = '#111827' }) {
  return (
    <div style={{background:'#F9FAFB', borderRadius:8, padding:'8px 10px'}}>
      <div style={{fontSize:'0.6rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:2}}>{label}</div>
      <div style={{fontSize:'0.78rem', fontWeight:700, color:tone}}>{value}</div>
    </div>
  )
}

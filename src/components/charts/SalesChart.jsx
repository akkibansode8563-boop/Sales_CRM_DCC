import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts'

const COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#EC4899']

const fmtINR = v => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,padding:'10px 14px',boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
      <div style={{fontWeight:700,fontSize:'0.8rem',color:'#374151',marginBottom:6}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.78rem',color:'#6b7280',marginBottom:2}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:p.color,display:'inline-block'}}/>
          <span>{p.name}:</span>
          <span style={{fontWeight:700,color:'#111827'}}>
            {p.name.toLowerCase().includes('sales') || p.name.toLowerCase().includes('profit')
              ? '₹' + Number(p.value).toLocaleString('en-IN')
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function DailySalesTrendChart({ data = [], managers = [] }) {
  return (
    <div style={{width:'100%',height:220}}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{top:4,right:16,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
          <XAxis dataKey="date" tick={{fontSize:11,fill:'#9ca3af'}} tickLine={false} axisLine={false}
            tickFormatter={d => new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}/>
          <YAxis tick={{fontSize:11,fill:'#9ca3af'}} tickLine={false} axisLine={false} tickFormatter={fmtINR} width={40}/>
          <Tooltip content={<CustomTooltip/>}/>
          <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:'0.75rem'}}/>
          {managers.length > 0
            ? managers.map((m,i) => (
                <Line key={m.id} type="monotone" dataKey={m.name} stroke={COLORS[i%COLORS.length]}
                  strokeWidth={2} dot={false} activeDot={{r:4}}/>
              ))
            : <Line type="monotone" dataKey="sales" name="Sales" stroke="#2563EB" strokeWidth={2.5}
                dot={false} activeDot={{r:4}}/>
          }
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function VisitBarChart({ data = [] }) {
  return (
    <div style={{width:'100%',height:180}}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{top:4,right:8,left:0,bottom:0}} barSize={14}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
          <XAxis dataKey="date" tick={{fontSize:11,fill:'#9ca3af'}} tickLine={false} axisLine={false}
            tickFormatter={d => new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}/>
          <YAxis tick={{fontSize:11,fill:'#9ca3af'}} tickLine={false} axisLine={false} width={28}/>
          <Tooltip content={<CustomTooltip/>}/>
          <Bar dataKey="visits" name="Visits" fill="#2563EB" radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ProductBarChart({ data = [] }) {
  return (
    <div style={{width:'100%',height:200}}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{top:4,right:16,left:4,bottom:0}} barSize={12}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
          <XAxis type="number" tick={{fontSize:11,fill:'#9ca3af'}} tickLine={false} axisLine={false} tickFormatter={fmtINR}/>
          <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#374151'}} tickLine={false} axisLine={false} width={90}/>
          <Tooltip content={<CustomTooltip/>}/>
          <Bar dataKey="achieved" name="Achieved" fill="#10B981" radius={[0,4,4,0]}/>
          <Bar dataKey="target" name="Target" fill="#e5e7eb" radius={[0,4,4,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MonthlyComparisonChart({ data = [] }) {
  return (
    <div style={{width:'100%',height:200}}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{top:4,right:8,left:0,bottom:0}} barSize={20} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
          <XAxis dataKey="month" tick={{fontSize:11,fill:'#9ca3af'}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:11,fill:'#9ca3af'}} tickLine={false} axisLine={false} tickFormatter={fmtINR} width={40}/>
          <Tooltip content={<CustomTooltip/>}/>
          <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:'0.75rem'}}/>
          <Bar dataKey="sales" name="Sales" fill="#2563EB" radius={[4,4,0,0]}/>
          <Bar dataKey="profit" name="Profit" fill="#10B981" radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

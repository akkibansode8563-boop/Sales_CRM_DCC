import { useState } from 'react'

const STEPS = [
  {
    n: 1,
    title: 'Create Supabase Project',
    icon: '🗄️',
    desc: 'Free account — no credit card needed',
    actions: [
      { label: 'Open Supabase', url: 'https://supabase.com', primary: true },
    ],
    detail: [
      'Click "Start your project" → Sign up with GitHub or email',
      'Click "New project"',
      'Name: DCC SalesForce CRM',
      'Set a strong database password — save it somewhere safe',
      'Region: Asia South 1 (Mumbai) — closest to your users',
      'Click "Create new project" and wait ~2 minutes',
    ],
  },
  {
    n: 2,
    title: 'Run the Database Schema',
    icon: '📋',
    desc: 'Creates all tables, indexes and realtime subscriptions',
    actions: [
      { label: 'Open SQL Editor', url: 'https://supabase.com/dashboard/project/_/sql/new', primary: true },
    ],
    detail: [
      'In your Supabase project → SQL Editor → "New query"',
      'Open the file  supabase/schema.sql  from your project ZIP',
      'Copy the entire contents and paste into the editor',
      'Click "Run" — you should see "Success. No rows returned"',
    ],
    note: 'The schema.sql file is included in your project ZIP under the supabase/ folder.',
  },
  {
    n: 3,
    title: 'Copy Your API Keys',
    icon: '🔑',
    desc: 'Project URL and anon key from Supabase settings',
    actions: [
      { label: 'Open API Settings', url: 'https://supabase.com/dashboard/project/_/settings/api', primary: true },
    ],
    detail: [
      'Supabase Dashboard → Settings (gear icon) → API',
      'Copy "Project URL"  — looks like: https://abcdefgh.supabase.co',
      'Copy "anon / public" key  — long string starting with eyJ...',
      'Keep these ready for the next step',
    ],
    copyFields: [
      { label: 'VITE_SUPABASE_URL', placeholder: 'https://abcdefgh.supabase.co' },
      { label: 'VITE_SUPABASE_ANON_KEY', placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
    ],
  },
  {
    n: 4,
    title: 'Add to Vercel Environment Variables',
    icon: '▲',
    desc: 'Vercel → Your Project → Settings → Environment Variables',
    actions: [
      { label: 'Open Vercel Dashboard', url: 'https://vercel.com/dashboard', primary: true },
    ],
    detail: [
      'Go to vercel.com → Click your project (crm-dcc or similar)',
      'Click "Settings" tab → "Environment Variables" in left menu',
      'Add first variable:  Name = VITE_SUPABASE_URL  |  Value = your project URL',
      'Add second variable: Name = VITE_SUPABASE_ANON_KEY  |  Value = your anon key',
      'Make sure both are set for "Production", "Preview", and "Development"',
      'Click "Save" for each one',
    ],
    image: true,
  },
  {
    n: 5,
    title: 'Redeploy on Vercel',
    icon: '🚀',
    desc: 'Vercel must rebuild the app with the new env vars',
    actions: [
      { label: 'Open Vercel Dashboard', url: 'https://vercel.com/dashboard', primary: true },
    ],
    detail: [
      'In Vercel → Your project → "Deployments" tab',
      'Click the 3-dot menu on the latest deployment',
      'Click "Redeploy" → Confirm',
      'Wait ~1 minute for build to complete',
      'Reload this page — the yellow banner will turn GREEN ✅',
    ],
    note: 'OR: Push any small change to GitHub — Vercel auto-deploys.',
  },
]

export default function CloudSetupGuide({ onClose }) {
  const [activeStep, setActiveStep] = useState(1)
  const [copied, setCopied] = useState({})

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(p => ({ ...p, [key]: true }))
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000)
    })
  }

  const step = STEPS[activeStep - 1]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 580,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #F3F4F6',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#111827', letterSpacing: '-0.01em' }}>
              ☁️ Enable Cloud Sync
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 3 }}>
              5-step setup · Free · Takes ~10 minutes
            </div>
          </div>
          <button onClick={onClose} style={{
            background: '#F3F4F6', border: 'none', borderRadius: '50%',
            width: 30, height: 30, cursor: 'pointer', color: '#6B7280',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
          }}>✕</button>
        </div>

        {/* Step progress */}
        <div style={{ padding: '14px 24px 0', display: 'flex', gap: 6 }}>
          {STEPS.map(s => (
            <button key={s.n} onClick={() => setActiveStep(s.n)} style={{
              flex: 1, height: 5, borderRadius: 99, border: 'none', cursor: 'pointer',
              background: s.n === activeStep ? '#2563EB' : s.n < activeStep ? '#10B981' : '#E5E7EB',
              transition: 'background 0.2s',
            }}/>
          ))}
        </div>
        <div style={{ padding: '6px 24px 0', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.6rem', color: '#9CA3AF', fontWeight: 700 }}>Step {activeStep} of {STEPS.length}</span>
          <span style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>{STEPS.slice(0, activeStep - 1).length} completed</span>
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {/* Step header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'linear-gradient(135deg,#EFF6FF,#F0FDF4)',
            border: '1px solid #BFDBFE', borderRadius: 14, padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ fontSize: '2rem', flexShrink: 0 }}>{step.icon}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111827' }}>
                Step {step.n}: {step.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 2 }}>{step.desc}</div>
            </div>
          </div>

          {/* Instruction list */}
          <div style={{ marginBottom: 16 }}>
            {step.detail.map((line, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, marginBottom: 8,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: '#EFF6FF', color: '#2563EB',
                  fontWeight: 800, fontSize: '0.65rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{i + 1}</div>
                <div style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.55, paddingTop: 2 }}>
                  {line}
                </div>
              </div>
            ))}
          </div>

          {/* Copy fields for step 3 */}
          {step.copyFields && (
            <div style={{ marginBottom: 16 }}>
              {step.copyFields.map(f => (
                <div key={f.label} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{f.label}</div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#F9FAFB', border: '1.5px solid #E5E7EB',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <code style={{ flex: 1, fontSize: '0.72rem', color: '#374151', wordBreak: 'break-all' }}>{f.placeholder}</code>
                    <button onClick={() => copy(f.placeholder, f.label)} style={{
                      background: copied[f.label] ? '#ECFDF5' : '#EFF6FF',
                      border: 'none', borderRadius: 6, padding: '4px 10px',
                      color: copied[f.label] ? '#059669' : '#2563EB',
                      fontWeight: 700, fontSize: '0.65rem', cursor: 'pointer',
                      whiteSpace: 'nowrap', fontFamily: 'inherit',
                    }}>
                      {copied[f.label] ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vercel screenshot guide for step 4 */}
          {step.image && (
            <div style={{
              background: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16,
              fontFamily: 'monospace', fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.7,
            }}>
              <div style={{ color: '#60A5FA', fontWeight: 700, marginBottom: 8 }}>▲ Vercel → Project → Settings → Environment Variables</div>
              <div>
                <span style={{ color: '#34D399' }}>Name</span>
                {' '.repeat(10)}
                <span style={{ color: '#34D399' }}>Value</span>
              </div>
              <div style={{ borderTop: '1px solid #334155', margin: '6px 0' }}/>
              <div>
                <span style={{ color: '#F8FAFC' }}>VITE_SUPABASE_URL</span>
                {'     '}
                <span style={{ color: '#FDE68A' }}>https://xxxxxxxx.supabase.co</span>
              </div>
              <div>
                <span style={{ color: '#F8FAFC' }}>VITE_SUPABASE_ANON_KEY</span>
                {'  '}
                <span style={{ color: '#FDE68A' }}>eyJhbGci...</span>
              </div>
            </div>
          )}

          {/* Note */}
          {step.note && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              background: '#FFFBEB', border: '1px solid #FDE68A',
              borderRadius: 10, padding: '10px 12px',
            }}>
              <span style={{ flexShrink: 0 }}>💡</span>
              <div style={{ fontSize: '0.75rem', color: '#92400E', lineHeight: 1.5 }}>{step.note}</div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '14px 24px 20px', borderTop: '1px solid #F3F4F6',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {step.actions.map(a => (
            <a key={a.label} href={a.url} target="_blank" rel="noreferrer" style={{
              flex: a.primary ? 1 : 0,
              padding: '11px 16px',
              background: a.primary ? '#2563EB' : '#F9FAFB',
              color: a.primary ? '#fff' : '#374151',
              border: a.primary ? 'none' : '1.5px solid #E5E7EB',
              borderRadius: 10, textDecoration: 'none',
              fontWeight: 800, fontSize: '0.85rem', textAlign: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: a.primary ? '0 4px 12px rgba(37,99,235,0.25)' : 'none',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
              {a.label}
            </a>
          ))}

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {activeStep > 1 && (
              <button onClick={() => setActiveStep(s => s - 1)} style={{
                padding: '11px 16px', borderRadius: 10, border: '1.5px solid #E5E7EB',
                background: '#F9FAFB', color: '#374151', fontWeight: 700, fontSize: '0.82rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>← Back</button>
            )}
            {activeStep < STEPS.length ? (
              <button onClick={() => setActiveStep(s => s + 1)} style={{
                padding: '11px 20px', borderRadius: 10, border: 'none',
                background: '#111827', color: '#fff', fontWeight: 800, fontSize: '0.85rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Next Step →</button>
            ) : (
              <button onClick={() => window.location.reload()} style={{
                padding: '11px 20px', borderRadius: 10, border: 'none',
                background: '#10B981', color: '#fff', fontWeight: 800, fontSize: '0.85rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>✅ Done — Reload App</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

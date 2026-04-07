import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { authLogin } from '../utils/supabaseDB'
import { isSupabaseConfigured } from '../utils/supabaseClient'
import { logLoginEvent } from '../services/syncService'
import dccLogo from '../assets/dcc-logo.png'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const isCloud = isSupabaseConfigured()
  const { login, isAuthenticated, user } = useAuthStore()
  const [form, setForm]     = useState({ username: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'Admin' ? '/admin' : '/manager', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const r = await authLogin(form.username, form.password)
      if (r.success) {
        login({
          id: r.user_id,
          username: r.username,
          role: r.role,
          full_name: r.full_name,
          territory: r.territory || '',
          email: r.email || '',
          phone: r.phone || '',
        }, r.token)
        // Audit log — fire and forget
        logLoginEvent(r.user_id, r.username, r.role, 'login').catch(() => {})
        navigate(r.role === 'Admin' ? '/admin' : '/manager')
      } else {
        logLoginEvent(null, form.username, null, 'failed').catch(() => {})
        setError(r.message || 'Invalid credentials')
      }
    } catch { setError('Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="login-root">
      {/* Left — Brand */}
      <div className="login-brand">
        <div className="lb-inner">
          <div className="lb-logo">
            <div className="lb-logo-mark">
              <img src={dccLogo} alt="DCC Logo" className="lb-logo-img"/>
            </div>
            <div>
              <div className="lb-brand-name">DCC SalesForce</div>
              <div className="lb-brand-sub">Field Intelligence Platform</div>
            </div>
          </div>

          <h1 className="lb-headline">Track. Sell.<br/><span>Win Together.</span></h1>
          <p className="lb-sub">A complete field sales CRM with live GPS tracking, real-time team visibility, and analytics — built for high-performance teams.</p>

          <div className="lb-features">
            {[
              'Live GPS route mapping & journey tracking',
              'Real-time manager status & field visibility',
              'Daily sales & profit target analytics',
              'Offline-ready PWA — works without internet',
            ].map((f, i) => (
              <div key={i} className="lb-feat">
                <span className="lb-feat-dot"/>
                {f}
              </div>
            ))}
          </div>

          <div className="lb-stats">
            <div className="lb-stat"><div className="lb-stat-num">PWA</div><div className="lb-stat-lbl">Offline Ready</div></div>
            <div className="lb-stat-div"/>
            <div className="lb-stat"><div className="lb-stat-num">AES</div><div className="lb-stat-lbl">Encrypted</div></div>
            <div className="lb-stat-div"/>
            <div className="lb-stat"><div className="lb-stat-num">99.9%</div><div className="lb-stat-lbl">Uptime SLA</div></div>
          </div>
        </div>
      </div>

      {/* Right — Form */}
      <div className="login-form-panel">
        <div className="lf-inner">

          {/* Mobile logo */}
          <div className="lf-mobile-logo">
            <div className="lf-mobile-logo-mark">
              <img src={dccLogo} alt="DCC Logo" className="lf-mobile-logo-img"/>
            </div>
            <div>
              <div className="lf-mobile-brand-name">DCC SalesForce</div>
              <div className="lf-mobile-brand-sub">Field Intelligence Platform</div>
            </div>
          </div>

          <div className="lf-company-logo">
            <div className="lf-company-logo-circle">
              <img src={dccLogo} alt="DCC Logo" className="lf-company-logo-img"/>
            </div>
          </div>

          <div className="lf-eyebrow">Welcome back</div>
          <h2 className="lf-title">Sign in to continue</h2>
          <p className="lf-desc">Enter your username and password to access your dashboard.</p>

          {error && (
            <div className="login-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#F87096" strokeWidth="1.5"/><path d="M8 5v3M8 11h.01" stroke="#F87096" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {error}
            </div>
          )}

          {/* Sync mode indicator */}
          <div style={{
            display:'flex', alignItems:'center', gap:6, padding:'7px 12px',
            borderRadius:8, marginBottom:12,
            background: isCloud ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${isCloud ? '#BBF7D0' : '#FDE68A'}`,
            fontSize:'0.72rem', fontWeight:600,
            color: isCloud ? '#059669' : '#D97706',
          }}>
            <span style={{width:7,height:7,borderRadius:'50%',background:isCloud?'#10B981':'#F59E0B',display:'inline-block',flexShrink:0}}/>
            {isCloud ? 'Cloud sync enabled — data syncs across all devices' : 'Local mode — data saved on this device only'}
          </div>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="lf-field">
              <label className="lf-label">Username</label>
              <div className="lf-input-wrap">
                <svg className="lf-ico" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <input type="text" value={form.username}
                  onChange={e => setForm(p => ({...p, username: e.target.value}))}
                  placeholder="Enter your username" required autoFocus autoComplete="username"/>
              </div>
            </div>
            <div className="lf-field">
              <label className="lf-label">Password</label>
              <div className="lf-input-wrap">
                <svg className="lf-ico" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(p => ({...p, password: e.target.value}))}
                  placeholder="Enter your password" required autoComplete="current-password"/>
                <button type="button" className="lf-toggle" onClick={() => setShowPwd(p => !p)} tabIndex={-1}>
                  {showPwd
                    ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/></svg>
                  }
                </button>
              </div>
            </div>
            <button type="submit" className="login-cta" disabled={loading}>
              {loading ? <span className="login-spinner"/> : null}
              {loading ? 'Signing in…' : 'Sign In'}
              {!loading && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
          </form>

          <div className="lf-footer">
            <span className="lf-status-dot"/>
            Secure login · Data encrypted · Offline ready
          </div>
        </div>
      </div>
    </div>
  )
}

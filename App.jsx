import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Component, useEffect } from 'react'
import Login          from './pages/Login'
import ManagerDashboard from './pages/ManagerDashboard'
import AdminDashboard   from './pages/AdminDashboard'
import ProtectedRoute   from './components/ProtectedRoute'
import './App.css'

// ── Global Error Boundary ─────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }

  static getDerivedStateFromError(error) { return { hasError: true, error } }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        minHeight:'100dvh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', background:'#F5F7FB',
        fontFamily:'Nunito Sans,system-ui,sans-serif', padding:24, textAlign:'center'
      }}>
        <div style={{fontSize:'3rem',marginBottom:16}}>⚠️</div>
        <h2 style={{fontSize:'1.1rem',fontWeight:800,color:'#111827',marginBottom:8}}>Something went wrong</h2>
        <p style={{fontSize:'0.8rem',color:'#6B7280',maxWidth:300,lineHeight:1.6,marginBottom:24}}>
          The app encountered an unexpected error. Your data is safe — please reload to continue.
        </p>
        <button
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/' }}
          style={{
            background:'#2563EB', color:'#fff', border:'none', borderRadius:12,
            padding:'13px 28px', fontSize:'0.9rem', fontWeight:800, cursor:'pointer'
          }}>
          Reload App
        </button>
        {import.meta.env.DEV && this.state.error && (
          <pre style={{marginTop:20,fontSize:'0.65rem',color:'#EF4444',maxWidth:340,textAlign:'left',wordBreak:'break-all'}}>
            {this.state.error.toString()}
          </pre>
        )}
      </div>
    )
  }
}

// ── Android hardware back-button handler ──────────────────────
function BackButtonHandler() {
  const navigate  = useNavigate()
  const location  = useLocation()

  useEffect(() => {
    // Push a dummy state so the first back press is intercepted
    window.history.pushState({ dccSFA: true }, '')

    const handler = (e) => {
      // If we're on login, let the system handle it (exit app)
      if (location.pathname === '/login') return

      // If on admin or manager root — go to login? No: just go back in nav stack
      e.preventDefault?.()
      navigate(-1)

      // Push again so next back is also intercepted
      setTimeout(() => window.history.pushState({ dccSFA: true }, ''), 100)
    }

    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [location.pathname, navigate])

  return null
}

// ── App ───────────────────────────────────────────────────────
function App() {
  return (
    <ErrorBoundary>
      <Router>
        <BackButtonHandler />
        <div className="app">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/manager"
              element={
                <ProtectedRoute>
                  <ManagerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/login" replace />} />
            {/* Catch-all — never show blank page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  )
}

export default App

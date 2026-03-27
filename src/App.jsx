import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import AppErrorBoundary from './components/AppErrorBoundary'
import './App.css'

// Lazy-load heavy pages — only downloaded when user navigates there
const Register         = lazy(() => import('./pages/Register'))
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'))
const AdminDashboard   = lazy(() => import('./pages/AdminDashboard'))

// Full-screen loading fallback shown between route transitions
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#F5F7FB', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 44, height: 44, border: '3px solid #E5E7EB',
        borderTopColor: '#2563EB', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}/>
      <span style={{ fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Loading…
      </span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function App() {
  return (
    <Router>
      <div className="app">
        <AppErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login"    element={<Login />} />
              <Route path="/register" element={
                <ProtectedRoute requireAdmin={true}><Register /></ProtectedRoute>
              }/>
              <Route path="/manager"  element={
                <ProtectedRoute><ManagerDashboard /></ProtectedRoute>
              }/>
              <Route path="/admin"    element={
                <ProtectedRoute requireAdmin={true}><AdminDashboard /></ProtectedRoute>
              }/>
              <Route path="/"         element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>
      </div>
    </Router>
  )
}

export default App

import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

/**
 * ProtectedRoute v3 — instant navigation, zero blocking.
 * Auth check reads from localStorage (instant).
 * Cloud sync happens in background on dashboard mount.
 */
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isAdmin } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/manager" replace />
  }

  return children
}

export default ProtectedRoute

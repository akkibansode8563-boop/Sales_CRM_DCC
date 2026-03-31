import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, isSessionValid, logout } = useAuthStore()

  // Session expired or corrupted → force logout
  if (!isSessionValid()) {
    if (isAuthenticated) logout() // clean up state
    return <Navigate to="/login" replace />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/manager" replace />
  }

  return children
}

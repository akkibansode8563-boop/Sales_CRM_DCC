import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

/**
 * ProtectedRoute v2 — INSTANT navigation, zero sync blocking.
 *
 * The old version blocked every page load behind a full-screen
 * "Syncing latest cloud data…" spinner by awaiting syncCloudToLocal()
 * inside the route guard. This added 2–8 seconds to every login.
 *
 * New behaviour:
 *  • Route guard only checks auth state (instant — reads from localStorage)
 *  • Background sync is kicked off by each dashboard on its own mount
 *  • A non-blocking sync indicator is shown in the dashboard header instead
 */
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isAdmin } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/manager" replace />
  }

  // Render children immediately — dashboard handles its own background sync
  return children
}

export default ProtectedRoute

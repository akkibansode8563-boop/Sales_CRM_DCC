import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { isSupabaseConfigured } from '../utils/supabaseClient'
import { syncCloudToLocal } from '../utils/supabaseDB'

const ProtectedRoute = ({ children, requireAdmin = false }) => {
    const { isAuthenticated, isAdmin } = useAuthStore()
    const hasScheduledSyncRef = useRef(false)

    useEffect(() => {
        if (!isAuthenticated || !isSupabaseConfigured()) {
            hasScheduledSyncRef.current = false
            return undefined
        }

        if (hasScheduledSyncRef.current) {
            return undefined
        }

        hasScheduledSyncRef.current = true
        const scheduleSync = window.requestIdleCallback
            ? window.requestIdleCallback
            : (callback) => window.setTimeout(callback, 350)
        const cancelScheduledSync = window.cancelIdleCallback
            ? window.cancelIdleCallback
            : window.clearTimeout

        const taskId = scheduleSync(() => {
            syncCloudToLocal().catch(() => {})
        })

        return () => {
            cancelScheduledSync(taskId)
        }
    }, [isAuthenticated])

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    if (requireAdmin && !isAdmin()) {
        return <Navigate to="/manager" replace />
    }

    return children
}

export default ProtectedRoute

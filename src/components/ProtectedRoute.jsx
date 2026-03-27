import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { isSupabaseConfigured } from '../utils/supabaseClient'
import { syncCloudToLocal } from '../utils/supabaseDB'

const ProtectedRoute = ({ children, requireAdmin = false }) => {
    const { isAuthenticated, isAdmin } = useAuthStore()
    const [syncing, setSyncing] = useState(() => isSupabaseConfigured())

    useEffect(() => {
        let active = true

        if (!isAuthenticated || !isSupabaseConfigured()) {
            setSyncing(false)
            return () => { active = false }
        }

        setSyncing(true)
        syncCloudToLocal()
            .catch(() => {})
            .finally(() => {
                if (active) setSyncing(false)
            })

        return () => { active = false }
    }, [isAuthenticated])

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    if (requireAdmin && !isAdmin()) {
        return <Navigate to="/manager" replace />
    }

    if (syncing) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#F5F7FB',
                color: '#6B7280',
                fontWeight: 700,
            }}>
                Syncing latest cloud data...
            </div>
        )
    }

    return children
}

export default ProtectedRoute

/**
 * DCC SalesForce — API Client v2
 * ─────────────────────────────────────────────────────────
 * Central Axios instance for all Edge Function calls.
 * Previously configured but never used — now actively wired.
 *
 * Base URL: VITE_SUPABASE_URL/functions/v1
 */

import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1`
  : (import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:3001')

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    // Supabase requires apikey header for Edge Functions
    ...(SUPABASE_ANON_KEY ? { 'apikey': SUPABASE_ANON_KEY } : {}),
  },
  timeout: 15000, // 15 second timeout (mobile networks can be slow)
})

// ── Request interceptor — inject fresh auth token ───────────
api.interceptors.request.use(
  (config) => {
    // Try session token first (set by authService after login)
    const sessionRaw = localStorage.getItem('dcc_session')
    if (sessionRaw) {
      try {
        const session = JSON.parse(sessionRaw)
        if (session?.token && Date.now() < session.expires) {
          config.headers.Authorization = `Bearer ${session.token}`
        }
      } catch {}
    }

    // Fallback: Zustand auth-storage token
    if (!config.headers.Authorization) {
      try {
        const authData = localStorage.getItem('auth-storage')
        if (authData) {
          const { state } = JSON.parse(authData)
          if (state?.token) {
            config.headers.Authorization = `Bearer ${state.token}`
          }
        }
      } catch {}
    }

    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor — handle auth / network errors ─────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired/invalid — clear and redirect to login
      localStorage.removeItem('dcc_session')
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }

    if (!error.response && error.code === 'ECONNABORTED') {
      // Timeout — surface meaningful message
      return Promise.reject(new Error('Request timed out — check your connection'))
    }

    return Promise.reject(error)
  }
)

export default api

// ── Convenience: Admin rules API ────────────────────────────
export const adminRulesApi = {
  list:     ()        => api.get('/admin-rules'),
  create:   (data)    => api.post('/admin-rules', data),
  update:   (id, data)=> api.patch(`/admin-rules/${id}`, data),
  delete:   (id)      => api.delete(`/admin-rules/${id}`),
  evaluate: (config)  => api.post('/evaluate-rules', config),
}

// ── Convenience: Live tracking API ──────────────────────────
export const trackingApi = {
  getLiveStatus: () => api.get('/live-tracking'),
}

// ── Convenience: Sync API ────────────────────────────────────
export const syncApi = {
  flush: (queue, deviceId, lastSyncedAt) => api.post('/sync-flush', {
    queue, device_id: deviceId, last_synced_at: lastSyncedAt,
  }),
}

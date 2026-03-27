/**
 * DCC SalesForce — Auth Store v2
 * ─────────────────────────────────────────────────────────
 * Features:
 *  • Zustand persist (survives refresh)
 *  • Auto-logout after 8 hours of inactivity
 *  • Activity tracking (mouse/key/touch)
 *  • Session timestamp
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000   // 8 hours
const ACTIVITY_CHECK_MS  = 60 * 1000              // check every 1 min

let activityTimer  = null
let checkInterval  = null

function resetActivityTimer(set, get) {
  const now = Date.now()
  set({ lastActivityAt: now })
}

function startSessionWatcher(set, get, logout) {
  if (checkInterval) clearInterval(checkInterval)
  checkInterval = setInterval(() => {
    const { lastActivityAt, isAuthenticated } = get()
    if (!isAuthenticated) { clearInterval(checkInterval); return }
    if (Date.now() - lastActivityAt > SESSION_TIMEOUT_MS) {
      clearInterval(checkInterval)
      logout()
    }
  }, ACTIVITY_CHECK_MS)
}

function attachActivityListeners(set, get) {
  const bump = () => resetActivityTimer(set, get)
  const EVENTS = ['mousemove','keydown','touchstart','click','scroll']
  EVENTS.forEach(e => window.addEventListener(e, bump, { passive: true }))
  return () => EVENTS.forEach(e => window.removeEventListener(e, bump))
}

let detachListeners = null

const useAuthStore = create(
  persist(
    (set, get) => ({
      user:           null,
      token:          null,
      isAuthenticated:false,
      lastActivityAt: null,
      loginAt:        null,

      login: (userData, token) => {
        const now = Date.now()
        set({
          user:            userData,
          token,
          isAuthenticated: true,
          lastActivityAt:  now,
          loginAt:         now,
        })
        // Start session watcher
        startSessionWatcher(set, get, get().logout)
        // Track activity
        if (detachListeners) detachListeners()
        detachListeners = attachActivityListeners(set, get)
      },

      logout: () => {
        if (checkInterval)   { clearInterval(checkInterval);  checkInterval = null }
        if (detachListeners) { detachListeners(); detachListeners = null }
        set({
          user:            null,
          token:           null,
          isAuthenticated: false,
          lastActivityAt:  null,
          loginAt:         null,
        })
        // Clear session storage
        try { sessionStorage.removeItem('dcc_intro_shown') } catch {}
      },

      // Bump activity manually (called from any user action)
      bumpActivity: () => {
        if (get().isAuthenticated) resetActivityTimer(set, get)
      },

      isAdmin:   () => get().user?.role === 'Admin',
      isManager: () => get().user?.role === 'Sales Manager',

      // Remaining session time in minutes
      sessionMinutesLeft: () => {
        const { lastActivityAt, isAuthenticated } = get()
        if (!isAuthenticated || !lastActivityAt) return 0
        const remaining = SESSION_TIMEOUT_MS - (Date.now() - lastActivityAt)
        return Math.max(0, Math.round(remaining / 60000))
      },
    }),
    {
      name:       'auth-storage',
      getStorage: () => localStorage,
      // Don't rehydrate if session expired
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.isAuthenticated && state.lastActivityAt) {
          if (Date.now() - state.lastActivityAt > SESSION_TIMEOUT_MS) {
            // Session expired — clear it
            setTimeout(() => {
              useAuthStore.getState().logout()
            }, 100)
          } else {
            // Valid session — restart watcher
            const store = useAuthStore
            setTimeout(() => {
              const s = store.getState()
              startSessionWatcher(s.setState || (() => {}), store.getState, s.logout)
              detachListeners = attachActivityListeners(store.setState || (() => {}), store.getState)
            }, 500)
          }
        }
      },
    }
  )
)

export default useAuthStore

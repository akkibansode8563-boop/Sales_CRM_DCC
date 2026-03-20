// ═══════════════════════════════════════════════════════════════
// AUTH STORE — Production  v2
// • Persisted session via localStorage (zustand/persist)
// • Role-based helpers: isAdmin, isManager
// • Session validation on each app load
// • Automatic logout on token corruption
// ═══════════════════════════════════════════════════════════════
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import BackgroundGPS from '../utils/backgroundGPS'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user:            null,
      token:           null,
      isAuthenticated: false,
      loginTime:       null,

      login(userData, token) {
        set({
          user:            userData,
          token:           token,
          isAuthenticated: true,
          loginTime:       new Date().toISOString(),
        })
      },

      logout() {
        // Stop background GPS on logout
        if (BackgroundGPS.isActive()) BackgroundGPS.stop()
        set({ user: null, token: null, isAuthenticated: false, loginTime: null })
      },

      // Validate session is still healthy
      isSessionValid() {
        const { isAuthenticated, user, token, loginTime } = get()
        if (!isAuthenticated || !user || !token) return false
        // Sessions expire after 12 hours
        if (loginTime) {
          const age = Date.now() - new Date(loginTime)
          if (age > 12 * 3600 * 1000) return false
        }
        return true
      },

      isAdmin()   { return get().user?.role === 'Admin' },
      isManager() { return get().user?.role === 'Sales Manager' },
    }),
    {
      name:       'dcc-sfa-auth-v2',
      getStorage: () => localStorage,
      // Only persist these keys
      partialize: (state) => ({
        user:            state.user,
        token:           state.token,
        isAuthenticated: state.isAuthenticated,
        loginTime:       state.loginTime,
      }),
    }
  )
)

export default useAuthStore

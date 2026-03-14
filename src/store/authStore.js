import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,

            login: (userData, token) => {
                set({
                    user: userData,
                    token: token,
                    isAuthenticated: true
                })
            },

            logout: () => {
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false
                })
            },

            isAdmin: () => {
                const { user } = get()
                return user?.role === 'Admin'
            },

            isManager: () => {
                const { user } = get()
                return user?.role === 'Sales Manager'
            }
        }),
        {
            name: 'auth-storage',
            getStorage: () => localStorage
        }
    )
)

export default useAuthStore

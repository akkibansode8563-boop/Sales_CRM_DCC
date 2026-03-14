import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:3001'

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const authData = localStorage.getItem('auth-storage')
        if (authData) {
            const { state } = JSON.parse(authData)
            if (state?.token) {
                config.headers.Authorization = `Bearer ${state.token}`
            }
        }
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('auth-storage')
            window.location.href = '/login'
        }
        return Promise.reject(error)
    }
)

export default api

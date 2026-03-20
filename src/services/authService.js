import { authLogin } from '../utils/localDB'

/* --- Auth Service ----------------------------
   JWT-like session management with localStorage
   ------------------------------------------- */

const SESSION_KEY = 'dcc_session'
const SESSION_TTL = 8 * 60 * 60 * 1000 // 8 hours

export async function login(username, password) {
  const result = await authLogin(username, password)
  if (!result.success) return result
  // Store session with expiry
  const session = {
    user: result.user,
    token: `dcc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    expires: Date.now() + SESSION_TTL,
    loginAt: new Date().toISOString()
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { ...result, token: session.token }
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (Date.now() > session.expires) {
      clearSession()
      return null
    }
    return session
  } catch { return null }
}

export function refreshSession() {
  const session = getSession()
  if (!session) return false
  session.expires = Date.now() + SESSION_TTL
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return true
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function isAuthenticated() {
  return !!getSession()
}

export function hasRole(role) {
  const session = getSession()
  return session?.user?.role === role
}

export function isAdmin() { return hasRole('Admin') }
export function isManager() { return hasRole('Sales Manager') }

// Activity heartbeat — refresh session on user activity
let heartbeatTimer = null
export function startSessionHeartbeat() {
  const refresh = () => refreshSession()
  document.addEventListener('click', refresh)
  document.addEventListener('keydown', refresh)
  heartbeatTimer = setInterval(() => {
    if (!getSession()) {
      // Session expired — reload to show login
      window.location.href = '/login'
    }
  }, 60000) // Check every minute
}

export function stopSessionHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
}

/**
 * DCC SalesForce — Auth Service v3
 * ─────────────────────────────────────────────────────────
 * Strategy:
 *  1. Try Edge Function (secure — signed JWT, bcrypt, audit log)
 *  2. Fall back to direct Supabase if Edge Function unavailable
 *  3. Fall back to local localStorage if fully offline
 *
 * Session is stored in Zustand (persist to localStorage).
 * Token is a signed JWT from the Edge Function.
 */

import { authLogin } from '../utils/supabaseDB'
import api from '../utils/api'

const SESSION_KEY = 'dcc_session'
const SESSION_TTL = 8 * 60 * 60 * 1000 // 8 hours

const USE_EDGE_FUNCTIONS = () =>
  import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true' &&
  !!import.meta.env.VITE_SUPABASE_URL

// ── Device fingerprint (stable across sessions per browser) ─
function getDeviceId() {
  const key = 'dcc_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = `${navigator.userAgent.slice(0, 40)}_${screen.width}x${screen.height}_${Date.now()}`
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64)
    // Use crypto.randomUUID if available
    if (crypto?.randomUUID) id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function getDeviceName() {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return `Android / ${ua.match(/Chrome\/[\d.]+/)?.[0] || 'Browser'}`
  if (/iPhone|iPad/i.test(ua)) return `iOS / ${ua.match(/Version\/[\d.]+/)?.[0] || 'Safari'}`
  return `Desktop / ${ua.match(/Chrome\/[\d.]+|Firefox\/[\d.]+|Safari\/[\d.]+/)?.[0] || 'Browser'}`
}

// ── Login via Edge Function ──────────────────────────────────
async function loginViaEdgeFunction(username, password) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  const url = `${baseUrl}/functions/v1/auth-login`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({
      username,
      password,
      device_id:   getDeviceId(),
      device_name: getDeviceName(),
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    return { success: false, message: data.message || 'Login failed' }
  }

  const data = await response.json()
  return data
}

// ── Main login entry point ───────────────────────────────────
export async function login(username, password) {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, '_')
  let result = null

  // Strategy 1: Edge Function (preferred)
  if (USE_EDGE_FUNCTIONS() && navigator.onLine) {
    try {
      result = await loginViaEdgeFunction(normalized, password)
    } catch (e) {
      console.warn('[authService] Edge Function login failed, falling back:', e)
    }
  }

  // Strategy 2: Direct Supabase (fallback)
  if (!result?.success) {
    try {
      result = await authLogin(normalized, password)
    } catch (e) {
      console.warn('[authService] Supabase login failed:', e)
    }
  }

  if (!result?.success) {
    return { success: false, message: result?.message || 'Cannot connect. Check internet and try again.' }
  }

  // Store session
  const session = {
    user: {
      id:        result.user_id || result.user?.id,
      username:  result.username || result.user?.username,
      role:      result.role || result.user?.role,
      full_name: result.full_name || result.user?.full_name,
      territory: result.territory || result.user?.territory || '',
      email:     result.email || result.user?.email || '',
      phone:     result.phone || result.user?.phone || '',
    },
    token:    result.token,
    expires:  Date.now() + SESSION_TTL,
    loginAt:  new Date().toISOString(),
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session))

  // Update API client default auth header
  if (result.token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${result.token}`
  }

  return { ...result, token: result.token, user: session.user }
}

// ── Session management ───────────────────────────────────────
export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (Date.now() > session.expires) {
      clearSession()
      return null
    }
    // Restore token to API client header
    if (session.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${session.token}`
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
  delete api.defaults.headers.common['Authorization']
}

export function isAuthenticated() {
  return !!getSession()
}

export function hasRole(role) {
  return getSession()?.user?.role === role
}

export function isAdmin() { return hasRole('Admin') }
export function isManager() { return hasRole('Sales Manager') }

// ── Activity heartbeat ──────────────────────────────────────
let heartbeatTimer = null

export function startSessionHeartbeat() {
  const refresh = () => refreshSession()
  document.addEventListener('click', refresh)
  document.addEventListener('keydown', refresh)
  heartbeatTimer = setInterval(() => {
    if (!getSession()) {
      window.location.href = '/login'
    }
  }, 60_000)
}

export function stopSessionHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
}

// ── Get current token for API calls ────────────────────────
export function getToken() {
  return getSession()?.token || null
}

// ── User Management (Proxies to Supabase for now) ───────────
import { 
  getUsers as dbGetUsers, 
  createUser as dbCreateUser, 
  updateUser as dbUpdateUser, 
  deleteUser as dbDeleteUser, 
  adminSetPassword as dbAdminSetPassword 
} from '../utils/supabaseDB'

export const getUsers = dbGetUsers
export const createUser = dbCreateUser
export const updateUser = dbUpdateUser
export const deleteUser = dbDeleteUser
export const adminSetPassword = dbAdminSetPassword

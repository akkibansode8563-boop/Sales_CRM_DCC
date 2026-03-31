/**
 * DCC SalesForce — Error Logger
 * ─────────────────────────────────────────────────────────────
 * • Hooks into window.onerror + unhandledrejection globally
 * • Stores last 100 errors in localStorage (async IDB optional)
 * • Sends critical errors to Supabase error_logs when online
 * • Provides helper to copy error details for user support
 */

import { supabase, isSupabaseConfigured } from './supabaseClient'

const ERROR_LOG_KEY = 'dcc_error_log'
const MAX_STORED    = 100
let _userId         = null
let _username       = null

// ── Set current user context ────────────────────────────────
export function setErrorLogUser(userId, username) {
  _userId   = userId
  _username = username
}

// ── Core logger ─────────────────────────────────────────────
export function logError(message, source = 'app', extra = {}) {
  const entry = {
    id:         Date.now(),
    ts:         new Date().toISOString(),
    message:    String(message).slice(0, 500),
    source,
    url:        window.location.pathname,
    user:       _username,
    ...extra,
  }

  // 1. Store locally (sync, always works)
  try {
    const existing = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]')
    existing.unshift(entry)
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(existing.slice(0, MAX_STORED)))
  } catch {}

  // 2. Send to Supabase in background (don't await — fire and forget)
  if (isSupabaseConfigured() && supabase && navigator.onLine) {
    supabase.from('error_logs').insert({
      user_id:       _userId,
      error_message: entry.message,
      stack_trace:   extra.stack?.slice(0, 2000) || null,
      url:           window.location.href,
      created_at:    entry.ts,
    }).then(() => {}).catch(() => {})
  }

  return entry
}

// ── Get stored errors ────────────────────────────────────────
export function getRecentErrors() {
  try {
    return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]')
  } catch { return [] }
}

// ── Clear error log ──────────────────────────────────────────
export function clearErrors() {
  localStorage.removeItem(ERROR_LOG_KEY)
}

// ── Generate support report (for "Copy Error Info" button) ──
export function getErrorReport() {
  const errors = getRecentErrors().slice(0, 5)
  const lines  = [
    `DCC SalesForce Error Report`,
    `Generated: ${new Date().toLocaleString()}`,
    `User: ${_username || 'unknown'}`,
    `App Version: ${import.meta.env.VITE_APP_VERSION || 'dev'}`,
    ``,
    ...errors.map((e, i) => [
      `--- Error ${i + 1} ---`,
      `Time: ${new Date(e.ts).toLocaleString()}`,
      `Source: ${e.source}`,
      `Message: ${e.message}`,
      e.stack ? `Stack: ${e.stack.slice(0, 300)}` : '',
    ].filter(Boolean).join('\n')),
  ]
  return lines.join('\n')
}

// ── Global hook — install once at app startup ────────────────
let _hooked = false
export function installGlobalErrorHook() {
  if (_hooked) return
  _hooked = true

  window.onerror = (msg, src, line, col, err) => {
    logError(String(msg), 'global', {
      src, line, col,
      stack: err?.stack,
    })
    return false // don't suppress normal error display
  }

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message || String(e.reason) || 'UnhandledRejection'
    logError(msg, 'promise', {
      stack: e.reason?.stack,
    })
  })
}

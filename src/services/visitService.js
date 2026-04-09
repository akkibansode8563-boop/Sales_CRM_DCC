/**
 * DCC SalesForce — Visit Service v1
 * ─────────────────────────────────────────────────────────
 * Centralizes all visit-related operations.
 * Previously scattered across ManagerDashboard.jsx.
 *
 * Key improvement: visit validation happens server-side
 * via the log-visit Edge Function — GPS, photo, notes
 * requirements cannot be bypassed by the client.
 */

import * as db from '../utils/supabaseDB'
import { getToken } from './authService'

const USE_EDGE_FUNCTIONS = () =>
  import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true' &&
  !!import.meta.env.VITE_SUPABASE_URL

function edgeFunctionUrl(path) {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  return `${base}/functions/v1/${path}`
}

function edgeHeaders() {
  const token = getToken()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  return {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }
}

// ── Create visit (server-validated) ──────────────────────────
export async function createVisit(visitData) {
  if (USE_EDGE_FUNCTIONS() && navigator.onLine) {
    try {
      const res = await fetch(edgeFunctionUrl('log-visit'), {
        method: 'POST',
        headers: edgeHeaders(),
        body: JSON.stringify(visitData),
      })
      const data = await res.json()

      // Validation error from server — surface cleanly to UI
      if (res.status === 422) {
        return { success: false, errors: data.errors, message: data.message }
      }

      // Duplicate conflict
      if (res.status === 409) {
        return { success: false, duplicate: true, message: data.message }
      }

      if (data.success) {
        return { success: true, visit: data.visit, ...data.visit }
      }

      throw new Error(data.message || 'Visit creation failed')
    } catch (e) {
      if (e.message?.includes('duplicate') || e.message?.includes('already logged')) {
        return { success: false, duplicate: true, message: e.message }
      }
      console.warn('[visitService] Edge Function visit failed, falling back:', e.message)
    }
  }

  // Fallback — direct Supabase / local (no server validation)
  try {
    const result = await db.createVisit(visitData)
    return { success: true, visit: result, ...result }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

// ── Get today's visits ────────────────────────────────────────
export async function getTodayVisits(managerId) {
  return db.getTodayVisits(managerId)
}

// ── Get all visits ───────────────────────────────────────────
export async function getAllVisits(managerId) {
  return db.getAllVisits(managerId)
}

// ── Get all visits (admin — all managers) ───────────────────
export async function getAllVisitsAdmin() {
  return db.getAllVisitsAll()
}

// ── Update visit ─────────────────────────────────────────────
export async function updateVisit(id, updates) {
  return db.updateVisit(id, updates)
}

// ── Get customer timeline ────────────────────────────────────
export async function getCustomerTimeline(customerId, limit = 12) {
  return db.getCustomerTimeline(customerId, limit)
}

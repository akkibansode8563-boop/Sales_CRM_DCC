/**
 * DCC SalesForce — Journey Service v1
 * ─────────────────────────────────────────────────────────
 * Centralizes all journey-related operations.
 * Previously scattered across ManagerDashboard.jsx and
 * addJourneyLocation() calls in the background GPS module.
 *
 * Strategy (same as other services):
 *  1. Try Edge Function API (validation in backend)
 *  2. Fall back to direct Supabase
 *  3. Fall back to local + offline queue
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

// ── Start Journey ────────────────────────────────────────────
export async function startJourney(managerId, startLocation, latitude, longitude) {
  if (USE_EDGE_FUNCTIONS() && navigator.onLine) {
    try {
      const res = await fetch(edgeFunctionUrl('start-journey'), {
        method: 'POST',
        headers: edgeHeaders(),
        body: JSON.stringify({
          manager_id:     managerId,
          start_location: startLocation,
          latitude,
          longitude,
        }),
      })
      const data = await res.json()
      if (data.success) return data.journey
      // Conflict (already active) — surface error to UI
      if (res.status === 409) throw new Error(data.message)
    } catch (e) {
      if (e.message?.includes('already active')) throw e
      console.warn('[journeyService] Edge Function start failed, falling back:', e.message)
    }
  }

  // Fallback to direct Supabase / local
  return db.startJourney(managerId, startLocation, latitude, longitude)
}

// ── End Journey ──────────────────────────────────────────────
export async function endJourney(managerId, endLocation, latitude, longitude) {
  return db.endJourney(managerId, endLocation, latitude, longitude)
}

// ── Log GPS point ─────────────────────────────────────────────
export async function logGPSPoint(journeyId, managerId, latitude, longitude, timestamp = null) {
  if (USE_EDGE_FUNCTIONS() && navigator.onLine) {
    try {
      const res = await fetch(edgeFunctionUrl('log-gps'), {
        method: 'POST',
        headers: edgeHeaders(),
        body: JSON.stringify({
          journey_id: journeyId,
          manager_id: managerId,
          latitude,
          longitude,
          timestamp: timestamp || new Date().toISOString(),
        }),
      })

      // Rate limited — not an error, just skip this point
      if (res.status === 429) {
        const data = await res.json()
        return { rate_limited: true, message: data.message }
      }

      if (res.ok) {
        const data = await res.json()
        return data
      }
    } catch (e) {
      console.warn('[journeyService] Edge Function GPS log failed, falling back:', e.message)
    }
  }

  // Fallback — local detection (no server validation)
  return db.addJourneyLocation(journeyId, managerId, latitude, longitude)
}

// ── Get active journey ───────────────────────────────────────
export async function getActiveJourney(managerId) {
  return db.getActiveJourney(managerId)
}

// ── Get journey history ──────────────────────────────────────
export async function getJourneyHistory(managerId) {
  return db.getJourneyHistory(managerId)
}

// ── Get journey GPS locations ────────────────────────────────
export function getJourneyLocations(journeyId) {
  return db.getJourneyLocations(journeyId)
}

// ── Get idle status for active journey ──────────────────────
export function getIdleStatus(journeyId) {
  return db.getIdleStatus(journeyId)
}

// ============================================================
// Edge Function: log-gps
// Route: POST /functions/v1/log-gps
// Replaces: addJourneyLocation() in localDB.js (frontend logic)
//
// Server-side enforced:
//  • Speed anomaly detection (>120 km/h)
//  • GPS jump detection (>50 km instant)
//  • Rate limiting (max 1 point per 30s per user)
//  • Automatic anomaly logging to gps_anomalies table
//  • journey_id resolution (local → cloud)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT, extractBearer } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Haversine distance (km) ──────────────────────────────────
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ── Auth ────────────────────────────────────────────────
    const token = extractBearer(req)
    const claims = await verifyJWT(token)
    if (!claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { journey_id, manager_id, latitude, longitude, timestamp } = body

    if (!journey_id || latitude == null || longitude == null) {
      return new Response(JSON.stringify({ error: 'journey_id, latitude, longitude are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const effectiveManagerId = Number(manager_id) || Number(claims.user_id || claims.sub)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Verify journey belongs to this manager ───────────────
    const { data: journey } = await supabase
      .from('journeys')
      .select('id, manager_id, status')
      .eq('id', journey_id)
      .eq('manager_id', effectiveManagerId)
      .eq('status', 'active')
      .maybeSingle()

    if (!journey) {
      return new Response(JSON.stringify({ error: 'Active journey not found for this manager' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Rate limiting — max 1 GPS point per 30 seconds ───────
    const RATE_LIMIT_SECONDS = 30
    const { data: lastPoint } = await supabase
      .from('journey_locations')
      .select('id, latitude, longitude, timestamp, speed_kmh')
      .eq('journey_id', journey_id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()

    const now = new Date()
    const pointTimestamp = timestamp ? new Date(timestamp) : now

    if (lastPoint) {
      const secondsSinceLast = (pointTimestamp.getTime() - new Date(lastPoint.timestamp).getTime()) / 1000
      if (secondsSinceLast < RATE_LIMIT_SECONDS) {
        return new Response(JSON.stringify({
          success: false,
          message: `Rate limited: GPS point too frequent (${Math.round(secondsSinceLast)}s since last point, min ${RATE_LIMIT_SECONDS}s)`,
          rate_limited: true,
        }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── Anomaly detection ────────────────────────────────────
    let speed_kmh = 0
    let is_suspicious = false
    let suspicious_reason = ''
    const anomalies: { type: string; reason: string; jump_km?: number; speed_kmh?: number }[] = []

    if (lastPoint) {
      const timeDiffHours = (pointTimestamp.getTime() - new Date(lastPoint.timestamp).getTime()) / 3_600_000
      const dist = distanceKm(lastPoint.latitude, lastPoint.longitude, latitude, longitude)

      if (timeDiffHours > 0) {
        speed_kmh = Math.round(dist / timeDiffHours)
      }

      // Rule 1: Impossible speed
      if (speed_kmh > 120) {
        is_suspicious = true
        suspicious_reason = `Impossible speed: ${speed_kmh} km/h`
        anomalies.push({ type: 'speed', reason: suspicious_reason, speed_kmh })
      }

      // Rule 2: Large GPS jump (>50 km in one step)
      if (dist > 50) {
        is_suspicious = true
        suspicious_reason = `Large GPS jump: ${dist.toFixed(1)} km`
        anomalies.push({ type: 'jump', reason: suspicious_reason, jump_km: dist })
      }

      // Rule 3: Stationary >30 min (idle)
      const minutesSinceLast = (pointTimestamp.getTime() - new Date(lastPoint.timestamp).getTime()) / 60_000
      if (dist < 0.05 && minutesSinceLast > 30) {
        suspicious_reason = `Stationary ${Math.round(minutesSinceLast)} minutes (idle)`
        anomalies.push({ type: 'stationary', reason: suspicious_reason })
      }
    }

    // ── Insert GPS point ─────────────────────────────────────
    const { data: location, error: insertError } = await supabase
      .from('journey_locations')
      .insert({
        journey_id,
        manager_id:        effectiveManagerId,
        latitude,
        longitude,
        timestamp:         pointTimestamp.toISOString(),
        speed_kmh,
        is_suspicious,
        suspicious_reason,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // ── Log anomalies ────────────────────────────────────────
    if (anomalies.length > 0) {
      // Update suspicious_flags on journey
      await supabase
        .from('journeys')
        .update({ suspicious_flags: supabase.rpc('increment', {}) })
        .eq('id', journey_id)
        .catch(() => {})

      // Insert into gps_anomalies audit table
      await Promise.all(anomalies.map(anomaly =>
        supabase.from('gps_anomalies').insert({
          manager_id:     effectiveManagerId,
          journey_id,
          latitude,
          longitude,
          anomaly_type:   anomaly.type,
          anomaly_reason: anomaly.reason,
          speed_kmh:      anomaly.speed_kmh || speed_kmh,
          jump_km:        anomaly.jump_km || null,
        }).catch(() => {})
      ))
    }

    return new Response(JSON.stringify({
      success: true,
      location,
      is_suspicious,
      suspicious_reason,
      speed_kmh,
      anomaly_count: anomalies.length,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[log-gps]', err)
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

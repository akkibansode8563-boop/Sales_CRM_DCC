// ============================================================
// Edge Function: start-journey
// Route: POST /functions/v1/start-journey
//
// Server-side enforced:
//  • Only one active journey per manager at a time
//  • GPS coordinates required
//  • Returns cloud journey ID (used to map local→cloud)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT, extractBearer } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const token = extractBearer(req)
    const claims = await verifyJWT(token)
    if (!claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { manager_id, start_location, latitude, longitude } = body

    if (latitude == null || longitude == null) {
      return new Response(JSON.stringify({ error: 'GPS coordinates are required to start a journey' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const effectiveManagerId = Number(manager_id) || Number(claims.user_id || claims.sub)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Prevent duplicate active journeys (server-enforced) ──
    const { data: existing } = await supabase
      .from('journeys')
      .select('id, start_time')
      .eq('manager_id', effectiveManagerId)
      .eq('status', 'active')
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({
        success: false,
        message: 'A journey is already active. End the current journey before starting a new one.',
        existing_journey_id: existing.id,
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()

    // ── Create journey ───────────────────────────────────────
    const { data: journey, error: journeyError } = await supabase
      .from('journeys')
      .insert({
        manager_id:       effectiveManagerId,
        date:             today,
        start_time:       now,
        start_location:   start_location || 'Starting Point',
        start_latitude:   latitude,
        start_longitude:  longitude,
        status:           'active',
      })
      .select()
      .single()

    if (journeyError) throw journeyError

    // ── Insert first GPS point ───────────────────────────────
    await supabase.from('journey_locations').insert({
      journey_id:       journey.id,
      manager_id:       effectiveManagerId,
      latitude,
      longitude,
      timestamp:        now,
      speed_kmh:        0,
      is_suspicious:    false,
      suspicious_reason: '',
    }).catch(() => {})

    // ── Update manager status ────────────────────────────────
    await supabase.from('status_history').insert({
      manager_id: effectiveManagerId,
      status:     'In-Field',
    }).catch(() => {})

    return new Response(JSON.stringify({ success: true, journey }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[start-journey]', err)
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

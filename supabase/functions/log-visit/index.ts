// ============================================================
// Edge Function: log-visit
// Route: POST /functions/v1/log-visit
// Replaces: createVisit() in supabaseDB.js (frontend logic)
//
// Server-side enforced:
//  • GPS required
//  • Customer name required
//  • Idempotency (max 1 visit per customer per journey)
//  • Photo validation
//  • Automatic customer visit_count update
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
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ── Auth ────────────────────────────────────────────────
    const token = extractBearer(req)
    const claims = await verifyJWT(token)
    if (!claims) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const {
      manager_id,
      customer_name,
      customer_id,
      contact_person,
      contact_phone,
      client_type,
      location,
      visit_type,
      interaction_type,
      notes,
      latitude,
      longitude,
      journey_id,
      sale_amount,
      photo,
    } = body

    // ── Server-side validation ────────────────────────────────
    const errors: string[] = []

    if (!customer_name?.trim()) errors.push('Customer name is required')
    if (!contact_person?.trim()) errors.push('Contact person is required')
    if (!contact_phone?.trim()) errors.push('Contact phone is required')
    if (!client_type?.trim()) errors.push('Nature of business is required')
    if (!location?.trim()) errors.push('Address / location is required')
    if (!interaction_type) errors.push('Interaction type is required')
    if (!notes?.trim()) errors.push('Visit notes are mandatory')
    if (latitude == null || longitude == null) errors.push('GPS location is required — enable location permission')
    if (!photo) errors.push('Visit photo is required')

    // Role check — only Sales Manager can log visits
    if (claims.role !== 'Sales Manager' && claims.role !== 'Admin') {
      errors.push('Only Sales Managers can log visits')
    }

    // Manager ID must match token subject
    const tokenManagerId = Number(claims.user_id || claims.sub)
    if (claims.role === 'Sales Manager' && manager_id && Number(manager_id) !== tokenManagerId) {
      errors.push('Cannot log visit for another manager')
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({ success: false, errors, message: errors[0] }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const effectiveManagerId = Number(manager_id) || tokenManagerId
    const today = new Date().toISOString().split('T')[0]

    // ── Duplicate prevention (server-side) ───────────────────
    // Prevent multiple visits to the same customer in the same journey
    if (customer_id && journey_id) {
      const { data: existing } = await supabase
        .from('visits')
        .select('id')
        .eq('manager_id', effectiveManagerId)
        .eq('customer_id', customer_id)
        .eq('journey_id', journey_id)
        .is('deleted_at', null)
        .maybeSingle()

      if (existing) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Visit for this customer already logged in the current journey',
          duplicate: true,
        }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── Insert visit ─────────────────────────────────────────
    const visitPayload = {
      manager_id:        effectiveManagerId,
      customer_id:       customer_id || null,
      customer_name:     customer_name.trim(),
      client_name:       customer_name.trim(),
      client_type:       client_type,
      visit_type:        visit_type || 'Field Visit',
      interaction_type:  interaction_type,
      visit_date:        today,
      location:          location,
      latitude:          latitude,
      longitude:         longitude,
      contact_person:    contact_person,
      contact_phone:     contact_phone,
      notes:             notes,
      sale_amount:       sale_amount || 0,
      journey_id:        journey_id || null,
      status:            'Completed',
      created_by:        effectiveManagerId,
      source:            'app',
    }

    const { data: newVisit, error: insertError } = await supabase
      .from('visits')
      .insert(visitPayload)
      .select()
      .single()

    if (insertError) throw insertError

    // ── Update customer visit_count (non-blocking) ───────────
    if (customer_id) {
      supabase
        .from('customers')
        .update({ visit_count: supabase.rpc('coalesce', {}), last_visited: new Date().toISOString() })
        .eq('id', customer_id)
        .catch(() => {})

      // Use raw SQL increment to avoid race condition
      await supabase.rpc('increment_visit_count', { p_customer_id: customer_id }).catch(() => {})
    }

    // ── Persist visit note if notes are present ───────────────
    if (notes?.trim() && newVisit?.id) {
      await supabase.from('visit_notes').insert({
        visit_id:      newVisit.id,
        customer_id:   customer_id || null,
        manager_id:    effectiveManagerId,
        note_type:     'visit_outcome',
        note_text:     notes.trim(),
        created_by:    effectiveManagerId,
        source:        'app',
      }).catch(() => {})
    }

    return new Response(JSON.stringify({ success: true, visit: newVisit }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[log-visit]', err)
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

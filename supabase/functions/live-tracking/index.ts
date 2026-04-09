// ============================================================
// Edge Function: live-tracking
// Route: GET /functions/v1/live-tracking
//
// Returns: real-time snapshot of all active Sales Managers
// Used by Admin Dashboard for live GPS tracking view.
//
// Replaces: getLiveStatus() in localDB.js (which reads localStorage)
// This version reads live from Postgres — always accurate.
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
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ── Auth — Admin only ─────────────────────────────────────
    const token = extractBearer(req)
    const claims = await verifyJWT(token)
    if (!claims || claims.role !== 'Admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Use the pre-built manager_live_state view ────────────
    const { data: managers, error } = await supabase
      .from('manager_live_state')
      .select('*')

    if (error) throw error

    // ── Fetch unread alerts summary ───────────────────────────
    const { data: alerts } = await supabase
      .from('rule_alerts')
      .select('manager_id, alert_type, severity, message, created_at')
      .eq('is_read', false)
      .eq('alert_date', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false })

    // ── Attach alerts to each manager ───────────────────────
    const alertsByManager = new Map<number, typeof alerts>()
    for (const alert of (alerts || [])) {
      const existing = alertsByManager.get(alert.manager_id) || []
      existing.push(alert)
      alertsByManager.set(alert.manager_id, existing)
    }

    const enriched = (managers || []).map(m => ({
      ...m,
      today_alerts: alertsByManager.get(m.id) || [],
      alert_count:  (alertsByManager.get(m.id) || []).length,
    }))

    return new Response(JSON.stringify({
      success:   true,
      managers:  enriched,
      count:     enriched.length,
      fetched_at: new Date().toISOString(),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[live-tracking]', err)
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

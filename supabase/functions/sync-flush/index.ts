// ============================================================
// Edge Function: sync-flush
// Route: POST /functions/v1/sync-flush
//
// Accepts: { queue: OfflineQueueItem[], device_id, last_synced_at }
// Returns: { results, failed, delta: { visits, journey_locations } }
//
// Replaces: flushOfflineQueue() in supabaseDB.js
// Adds:     Delta sync — returns only records changed since last sync
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT, extractBearer } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type QueueItem = {
  id: string
  type: string
  payload: Record<string, unknown>
  local_journey_id?: string | number
  queued_at: string
}

// ── Journey ID map: local_id → cloud_id ─────────────────────
const journeyIdMap = new Map<string, number>()

function translateJourneyId(localId: string | number | undefined): number | null {
  if (!localId) return null
  const mapped = journeyIdMap.get(String(localId))
  return mapped ?? null
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
    const { queue = [], device_id, last_synced_at } = body

    const managerId = Number(claims.user_id || claims.sub)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Process offline queue ────────────────────────────────
    const results: { id: string; type: string; success: boolean; error?: string }[] = []
    const failed: QueueItem[] = []

    // Sort queue: journeys first, then visits, then GPS points
    const PRIORITY_ORDER = ['startJourney', 'addJourneyLocation', 'createVisit', 'updateStatus', 'endJourney', 'createTask', 'createCustomer']
    const sortedQueue: QueueItem[] = [...queue].sort((a: QueueItem, b: QueueItem) => {
      const aIdx = PRIORITY_ORDER.indexOf(a.type)
      const bIdx = PRIORITY_ORDER.indexOf(b.type)
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx)
    })

    for (const item of sortedQueue) {
      try {
        await processQueueItem(item, supabase, managerId)
        results.push({ id: item.id, type: item.type, success: true })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({ id: item.id, type: item.type, success: false, error: message })
        failed.push(item)
      }
    }

    // ── Delta sync: return records changed since last_synced_at ─
    const delta: Record<string, unknown[]> = {}
    const since = last_synced_at ? new Date(last_synced_at) : new Date(Date.now() - 7 * 24 * 3600 * 1000)

    const [visitsRes, locationsRes, statusRes] = await Promise.all([
      supabase.from('visits')
        .select('*')
        .eq('manager_id', managerId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('journey_locations')
        .select('*')
        .eq('manager_id', managerId)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: false })
        .limit(500),
      supabase.from('status_history')
        .select('*')
        .eq('manager_id', managerId)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: false })
        .limit(50),
    ])

    delta.visits = visitsRes.data || []
    delta.journey_locations = locationsRes.data || []
    delta.status_history = statusRes.data || []

    // ── Update sync_log ───────────────────────────────────────
    await supabase.from('sync_log').upsert({
      user_id:       managerId,
      device_id:     device_id || 'unknown',
      table_name:    'all',
      last_synced_at: new Date().toISOString(),
      rows_synced:   queue.length,
      sync_type:     'flush',
    }, { onConflict: 'user_id,device_id,table_name' }).catch(() => {})

    return new Response(JSON.stringify({
      success: true,
      processed: results.length - failed.length,
      failed_count: failed.length,
      results,
      failed_items: failed,
      delta,
      synced_at: new Date().toISOString(),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[sync-flush]', err)
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Queue item processor ─────────────────────────────────────
async function processQueueItem(
  item: QueueItem,
  supabase: ReturnType<typeof createClient>,
  managerId: number
) {
  switch (item.type) {
    case 'startJourney': {
      const p = item.payload
      const { data: journey, error } = await supabase.from('journeys').insert({
        manager_id:      managerId,
        date:            p.date || new Date().toISOString().split('T')[0],
        start_time:      p.start_time || new Date().toISOString(),
        start_location:  p.start_location || 'Starting Point',
        start_latitude:  p.latitude || null,
        start_longitude: p.longitude || null,
        status:          'active',
      }).select().single()
      if (error) throw error
      // Map local ID → cloud ID for subsequent GPS points
      if (item.local_journey_id) {
        journeyIdMap.set(String(item.local_journey_id), journey.id)
      }
      return journey
    }

    case 'addJourneyLocation': {
      const cloudId = translateJourneyId(item.local_journey_id || item.payload.journey_id as number)
      if (!cloudId) throw new Error(`No mapped cloud journey_id for local_id=${item.local_journey_id}`)
      const p = item.payload
      const { data, error } = await supabase.from('journey_locations').insert({
        journey_id:       cloudId,
        manager_id:       managerId,
        latitude:         p.latitude,
        longitude:        p.longitude,
        timestamp:        p.timestamp || new Date().toISOString(),
        speed_kmh:        p.speed_kmh || 0,
        is_suspicious:    !!p.is_suspicious,
        suspicious_reason: p.suspicious_reason || '',
      }).select().single()
      if (error) throw error
      return data
    }

    case 'endJourney': {
      const cloudId = translateJourneyId(item.local_journey_id)
      if (!cloudId) throw new Error(`No mapped cloud journey_id for local_id=${item.local_journey_id}`)
      const p = item.payload
      const { data, error } = await supabase.from('journeys').update({
        end_time:      p.end_time || new Date().toISOString(),
        end_location:  p.end_location || 'End Point',
        end_latitude:  p.latitude || null,
        end_longitude: p.longitude || null,
        status:        'completed',
        total_visits:  p.total_visits || 0,
        total_km:      p.total_km || 0,
      }).eq('id', cloudId).select().single()
      if (error) throw error
      journeyIdMap.delete(String(item.local_journey_id))
      return data
    }

    case 'createVisit': {
      const p = item.payload
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase.from('visits').insert({
        manager_id:    managerId,
        customer_id:   p.customer_id || null,
        customer_name: p.customer_name || p.client_name || '',
        client_name:   p.customer_name || p.client_name || '',
        client_type:   p.client_type || 'Retailer',
        visit_type:    p.visit_type || 'Field Visit',
        visit_date:    p.visit_date || today,
        location:      p.location || '',
        latitude:      p.latitude || null,
        longitude:     p.longitude || null,
        contact_person: p.contact_person || '',
        contact_phone: p.contact_phone || '',
        notes:         p.notes || '',
        sale_amount:   p.sale_amount || 0,
        journey_id:    translateJourneyId(p.journey_id as number) || null,
        status:        'Completed',
        created_by:    managerId,
        source:        'offline',
      }).select().single()
      if (error) throw error
      return data
    }

    case 'updateStatus': {
      const { data, error } = await supabase.from('status_history').insert({
        manager_id: managerId,
        status:     item.payload.status,
        timestamp:  item.payload.timestamp || new Date().toISOString(),
      }).select().single()
      if (error) throw error
      return data
    }

    case 'createTask': {
      const p = item.payload
      const { data, error } = await supabase.from('tasks').insert({
        manager_id:    managerId,
        customer_id:   p.customer_id || null,
        title:         p.title || '',
        description:   p.description || '',
        status:        p.status || 'open',
        priority:      p.priority || 'medium',
        due_at:        p.due_at || null,
        source:        'offline',
        created_by:    managerId,
      }).select().single()
      if (error) throw error
      return data
    }

    case 'createCustomer': {
      const p = item.payload
      // Idempotent — skip if customer already exists
      const { data: existing } = await supabase.from('customers')
        .select('id').ilike('name', (p.name as string).trim()).maybeSingle()
      if (existing) return existing
      const { data, error } = await supabase.from('customers').insert({
        name:       (p.name as string).trim(),
        owner_name: p.owner_name || '',
        type:       p.type || 'Retailer',
        address:    p.address || '',
        phone:      p.phone || '',
        territory:  p.territory || '',
        latitude:   p.latitude || null,
        longitude:  p.longitude || null,
        created_by: managerId,
        source:     'offline',
      }).select().single()
      if (error) throw error
      return data
    }

    default:
      throw new Error(`Unsupported queue action type: ${item.type}`)
  }
}

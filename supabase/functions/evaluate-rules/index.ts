// ============================================================
// Edge Function: evaluate-rules
// Route: POST /functions/v1/evaluate-rules
//
// The Automation Engine — evaluates all active admin_rules
// against all active Sales Managers and generates alerts.
//
// Called by:
//   1. Supabase Cron Jobs (scheduled — see README)
//   2. Frontend after journey/visit events (event-driven)
//   3. Admin dashboard "Run Rules" button
//
// Rules supported:
//   - no_visit     : No visit logged by configured hour
//   - idle_alert   : Manager stationary on active journey
//   - no_activity  : No status update and no visits all day
//   - visit_limit  : Below minimum visit count by EOD
//   - gps_mismatch : GPS anomalies detected (from gps_anomalies table)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyJWT, extractBearer } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type AdminRule = {
  id: number
  name: string
  rule_type: string
  config: Record<string, unknown>
  action_type: string
  action_config: Record<string, unknown>
}

type ManagerSnapshot = {
  id: number
  username: string
  name?: string
  full_name?: string
  territory?: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Allow both GET (cron) and POST (manual/event)
  if (!['GET', 'POST'].includes(req.method)) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ── Auth: admin or internal cron secret ──────────────────
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const reqCronSecret = req.headers.get('x-cron-secret') || ''
    const isCronRequest = cronSecret && reqCronSecret === cronSecret

    if (!isCronRequest) {
      const token = extractBearer(req)
      const claims = await verifyJWT(token)
      if (!claims || claims.role !== 'Admin') {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const { rule_types, manager_id: targetManagerId } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const currentHour = now.getHours()
    const isWeekend = now.getDay() === 0 || now.getDay() === 6

    // ── Fetch active rules ───────────────────────────────────
    let rulesQuery = supabase.from('admin_rules')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)

    if (rule_types?.length > 0) {
      rulesQuery = rulesQuery.in('rule_type', rule_types)
    }

    const { data: rules, error: rulesError } = await rulesQuery
    if (rulesError) throw rulesError
    if (!rules?.length) {
      return new Response(JSON.stringify({ success: true, alerts_generated: 0, message: 'No active rules' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch active Sales Managers ──────────────────────────
    let managersQuery = supabase.from('users')
      .select('id, username, full_name, territory')
      .eq('role', 'Sales Manager')
      .eq('is_active', true)

    if (targetManagerId) {
      managersQuery = managersQuery.eq('id', targetManagerId)
    }

    const { data: managers, error: managersError } = await managersQuery
    if (managersError) throw managersError
    if (!managers?.length) {
      return new Response(JSON.stringify({ success: true, alerts_generated: 0, message: 'No managers found' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const alertsToInsert: Record<string, unknown>[] = []
    const evaluationLog: { manager: string; rule: string; fired: boolean; reason: string }[] = []

    // ── Evaluate each rule × each manager ───────────────────
    for (const rule of (rules as AdminRule[])) {
      const config = rule.config || {}
      const actionConfig = rule.action_config || {}
      const skipWeekends = config.skip_weekends as boolean ?? true

      if (skipWeekends && isWeekend) {
        evaluationLog.push({ manager: 'ALL', rule: rule.name, fired: false, reason: 'Weekend — skipped' })
        continue
      }

      for (const manager of (managers as ManagerSnapshot[])) {
        const managerName = manager.full_name || manager.name || manager.username

        try {
          // ── Check if alert already exists today (deduplicate) ──
          const { data: existingAlert } = await supabase.from('rule_alerts')
            .select('id')
            .eq('rule_id', rule.id)
            .eq('manager_id', manager.id)
            .eq('alert_date', today)
            .maybeSingle()

          if (existingAlert) {
            evaluationLog.push({ manager: managerName, rule: rule.name, fired: false, reason: 'Already alerted today' })
            continue
          }

          // ── Get manager's today summary ──────────────────────
          const { data: summary } = await supabase.rpc('get_manager_today_summary', { p_manager_id: manager.id })
          const snap = summary?.[0] || { visits_today: 0, is_on_journey: false, last_gps_at: null, last_visit_at: null }

          let shouldFire = false
          let alertMessage = actionConfig.message as string || rule.name

          // == Rule Evaluation Logic ============================

          switch (rule.rule_type) {
            case 'no_visit': {
              const byHour = config.by_hour as number ?? 14
              const minVisits = config.min_visits as number ?? 1
              if (currentHour >= byHour && snap.visits_today < minVisits) {
                shouldFire = true
                alertMessage = `${actionConfig.message || 'No visits logged'} (${snap.visits_today} visits by ${byHour}:00)`
              }
              break
            }

            case 'idle_alert': {
              const idleMinutes = config.idle_minutes as number ?? 30
              const duringJourneyOnly = config.during_journey_only as boolean ?? true

              if (duringJourneyOnly && !snap.is_on_journey) break

              if (snap.last_gps_at) {
                const minutesSinceGPS = (now.getTime() - new Date(snap.last_gps_at).getTime()) / 60_000
                if (minutesSinceGPS >= idleMinutes) {
                  shouldFire = true
                  alertMessage = `${actionConfig.message || 'Manager may be idle'} (${Math.round(minutesSinceGPS)} min since last GPS)`
                }
              }
              break
            }

            case 'no_activity': {
              const byHour = config.by_hour as number ?? 18
              if (currentHour >= byHour && snap.visits_today === 0 && !snap.is_on_journey) {
                shouldFire = true
                alertMessage = `${actionConfig.message || 'No activity today'} — 0 visits, not on journey`
              }
              break
            }

            case 'visit_limit': {
              const minVisitsByEod = config.min_visits_by_eod as number ?? 3
              const checkHour = config.check_hour as number ?? 17
              if (currentHour >= checkHour && snap.visits_today < minVisitsByEod) {
                shouldFire = true
                alertMessage = `${actionConfig.message || 'Below visit target'} (${snap.visits_today}/${minVisitsByEod} visits)`
              }
              break
            }

            case 'gps_mismatch': {
              // Check for unreviewed GPS anomalies today
              const { data: anomalies } = await supabase.from('gps_anomalies')
                .select('id')
                .eq('manager_id', manager.id)
                .gte('detected_at', `${today}T00:00:00`)
                .eq('is_reviewed', false)
                .limit(1)

              if (anomalies?.length) {
                shouldFire = true
                alertMessage = `${actionConfig.message || 'GPS anomaly detected'} — requires review`
              }
              break
            }
          }

          // == Fire Alert =======================================

          if (shouldFire) {
            alertsToInsert.push({
              rule_id:    rule.id,
              manager_id: manager.id,
              alert_date: today,
              alert_type: rule.rule_type,
              severity:   actionConfig.severity as string || 'warning',
              message:    alertMessage,
              context: {
                rule_name:    rule.name,
                current_hour: currentHour,
                visits_today: snap.visits_today,
                is_on_journey: snap.is_on_journey,
                last_gps_at:  snap.last_gps_at,
              },
            })
            evaluationLog.push({ manager: managerName, rule: rule.name, fired: true, reason: alertMessage })
          } else {
            evaluationLog.push({ manager: managerName, rule: rule.name, fired: false, reason: 'Condition not met' })
          }

        } catch (managerErr) {
          console.warn(`[evaluate-rules] Error for manager ${manager.id}:`, managerErr)
          evaluationLog.push({ manager: managerName, rule: rule.name, fired: false, reason: 'Evaluation error' })
        }
      }
    }

    // ── Bulk insert alerts ───────────────────────────────────
    let insertedCount = 0
    if (alertsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('rule_alerts')
        .insert(alertsToInsert)
        .select('id')
      if (insertError) console.error('[evaluate-rules] Alert insert error:', insertError)
      insertedCount = inserted?.length || 0
    }

    return new Response(JSON.stringify({
      success:          true,
      alerts_generated: insertedCount,
      rules_evaluated:  rules.length,
      managers_checked: managers.length,
      log:              evaluationLog,
      evaluated_at:     now.toISOString(),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[evaluate-rules]', err)
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

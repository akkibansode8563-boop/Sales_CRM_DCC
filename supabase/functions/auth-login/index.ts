// ============================================================
// Edge Function: auth-login
// Route: POST /functions/v1/auth-login
// Replaces: browser-side SHA-256 hash + btoa token
//
// Accepts: { username, password, device_id, device_name }
// Returns: { success, token, user: { id, username, role, ... } }
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── JWT secret from Supabase env ────────────────────────────
const JWT_SECRET = Deno.env.get('JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET') || 'fallback-secret-change-me'
const SESSION_HOURS = 8

// ── SHA-256 helper (supports legacy password_hash format) ───
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Create a signed JWT ─────────────────────────────────────
async function createJWT(payload: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return create({ alg: 'HS256', typ: 'JWT' }, payload, key)
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { username, password, device_id, device_name } = body

    // ── Input validation ──────────────────────────────────────
    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: 'Username and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, '_')

    // ── Supabase admin client (bypasses RLS for auth) ─────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Fetch user record ─────────────────────────────────────
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, password_hash, role, full_name, territory, email, phone, is_active, login_count')
      .eq('username', normalizedUsername)
      .eq('is_active', true)
      .maybeSingle()

    if (userError || !user) {
      // Log failed attempt
      await supabase.from('login_logs').insert({
        username: normalizedUsername,
        role: null,
        action: 'failed',
        device_info: device_name || req.headers.get('user-agent') || '',
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '',
      }).catch(() => {})

      return new Response(JSON.stringify({ success: false, message: 'Invalid username or password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Verify password (supports both SHA-256 legacy and bcrypt) ──
    const storedHash = user.password_hash
    let passwordValid = false

    if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
      // bcrypt hash — use pgcrypto verify
      const { data: bcryptCheck } = await supabase
        .rpc('verify_password', { plain_password: password, stored_hash: storedHash })
      passwordValid = !!bcryptCheck
    } else {
      // Legacy SHA-256 hash
      const sha256Hash = await sha256Hex(password)
      passwordValid = sha256Hash === storedHash
    }

    if (!passwordValid) {
      await supabase.from('login_logs').insert({
        user_id: user.id,
        username: normalizedUsername,
        role: user.role,
        action: 'failed',
        device_info: device_name || req.headers.get('user-agent') || '',
        ip_address: req.headers.get('x-forwarded-for') || '',
      }).catch(() => {})

      return new Response(JSON.stringify({ success: false, message: 'Invalid username or password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Issue signed JWT ──────────────────────────────────────
    const now = Math.floor(Date.now() / 1000)
    const jwtPayload = {
      sub: String(user.id),
      user_id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      territory: user.territory || '',
      iat: now,
      exp: now + SESSION_HOURS * 3600,
    }
    const token = await createJWT(jwtPayload)

    // ── Update device session ─────────────────────────────────
    if (device_id) {
      await supabase.from('device_sessions').upsert({
        user_id: user.id,
        device_id,
        device_name: device_name || '',
        ip_address: req.headers.get('x-forwarded-for') || '',
        jwt_token: token,
        is_active: true,
        expires_at: new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString(),
      }, { onConflict: 'user_id,device_id' }).catch(() => {})
    }

    // ── Update user stats + audit log ──────────────────────────
    await supabase.from('users')
      .update({ last_login_at: new Date().toISOString(), login_count: (user.login_count || 0) + 1 })
      .eq('id', user.id)
      .catch(() => {})

    await supabase.from('login_logs').insert({
      user_id: user.id,
      username: user.username,
      role: user.role,
      action: 'login',
      device_info: device_name || req.headers.get('user-agent') || '',
      ip_address: req.headers.get('x-forwarded-for') || '',
    }).catch(() => {})

    return new Response(JSON.stringify({
      success:   true,
      token,
      user: {
        id:        user.id,
        username:  user.username,
        role:      user.role,
        full_name: user.full_name,
        territory: user.territory || '',
        email:     user.email || '',
        phone:     user.phone || '',
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[auth-login]', err)
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

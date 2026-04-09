// ============================================================
// Shared: JWT verification for all Edge Functions
// Import as: import { verifyJWT, extractBearer } from '../_shared/auth.ts'
// ============================================================

import { verify } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const JWT_SECRET = Deno.env.get('JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET') || 'fallback-secret-change-me'

let _key: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key
  _key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return _key
}

export type JWTClaims = {
  sub: string
  user_id: number
  username: string
  role: string
  full_name: string
  territory: string
  iat: number
  exp: number
}

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns null if not present.
 */
export function extractBearer(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}

/**
 * Verifies a JWT token and returns its claims.
 * Returns null if invalid or expired.
 */
export async function verifyJWT(token: string | null): Promise<JWTClaims | null> {
  if (!token) return null
  try {
    const key = await getKey()
    const payload = await verify(token, key) as JWTClaims
    return payload
  } catch {
    return null
  }
}

/**
 * Returns true if the claims represent an admin user.
 */
export function isAdmin(claims: JWTClaims | null): boolean {
  return claims?.role === 'Admin'
}

/**
 * Returns true if the claims represent a Sales Manager.
 */
export function isManager(claims: JWTClaims | null): boolean {
  return claims?.role === 'Sales Manager'
}

/**
 * Asserts that the manager_id in the request matches the token subject.
 * Admins bypass this check.
 */
export function assertManagerOwnership(claims: JWTClaims, requestManagerId: number): boolean {
  if (claims.role === 'Admin') return true
  return Number(claims.user_id || claims.sub) === Number(requestManagerId)
}

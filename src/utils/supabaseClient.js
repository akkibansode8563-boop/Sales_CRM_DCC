import { createClient } from '@supabase/supabase-js'

// --- Configuration ----------------------------------------
// Replace these with your actual Supabase project values
// Found in: Supabase Dashboard → Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// --- Mode Detection ---------------------------------------
// If Supabase is not configured, fall back to localStorage
export const isSupabaseConfigured = () =>
  !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_URL.includes('.supabase.co')

// --- Client -----------------------------------------------
export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: { persistSession: false },
    })
  : null

// --- Mode label (for UI) ----------------------------------
export const getStorageMode = () =>
  isSupabaseConfigured() ? 'cloud' : 'local'

// --- Helper: log errors without crashing -----------------
export function handleSupabaseError(error, context = '') {
  if (!error) return null
  console.warn(`[Supabase${context ? ' ' + context : ''}]`, error.message)
  return error.message
}

// --- Helper: safe query wrapper --------------------------
export async function sbQuery(fn) {
  try {
    const { data, error } = await fn()
    if (error) throw error
    return data
  } catch (e) {
    console.warn('[Supabase query error]', e.message)
    throw e
  }
}

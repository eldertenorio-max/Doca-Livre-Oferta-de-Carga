import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url =
  (import.meta.env.VITE_LOGISTICA_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)
const anonKey =
  (import.meta.env.VITE_LOGISTICA_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes('SEU_PROJECT') && url.startsWith('http'),
)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null

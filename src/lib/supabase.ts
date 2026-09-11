import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('SEU_PROJECT'))

const g = globalThis as typeof globalThis & { __docaSupabase?: SupabaseClient | null }

if (g.__docaSupabase === undefined) {
  g.__docaSupabase = isSupabaseConfigured
    ? createClient(url!, anonKey!, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null
}

export const supabase: SupabaseClient | null = g.__docaSupabase ?? null

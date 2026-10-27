import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const urlAzure = 'https://ofertacarga-api.purpleocean-4b1d485c.brazilsouth.azurecontainerapps.io'
export const supabaseUrl = urlAzure
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('SEU_PROJECT'),
)

const g = globalThis as typeof globalThis & { __docaSupabase?: SupabaseClient | null }

if (g.__docaSupabase === undefined) {
  g.__docaSupabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null
}

export const supabase: SupabaseClient | null = g.__docaSupabase ?? null

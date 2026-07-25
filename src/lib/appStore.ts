/**
 * Store remoto (Supabase) — substitui localStorage para dados de negócio.
 * Cache só em memória; a fonte da verdade é a tabela `app_store`.
 */

import { isSupabaseConfigured, supabase } from './supabase'

const memory = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

export async function appStoreGet<T>(chave: string, fallback: T): Promise<T> {
  if (memory.has(chave)) return memory.get(chave) as T
  if (!isSupabaseConfigured || !supabase) {
    memory.set(chave, fallback)
    return fallback
  }
  const pending = inflight.get(chave)
  if (pending) return (await pending) as T

  const job = (async () => {
    const { data, error } = await supabase!
      .from('app_store')
      .select('valor')
      .eq('chave', chave)
      .maybeSingle()
    if (error || !data?.valor) {
      memory.set(chave, fallback)
      return fallback
    }
    const valor = data.valor as T
    memory.set(chave, valor)
    return valor
  })()

  inflight.set(chave, job)
  try {
    return (await job) as T
  } finally {
    inflight.delete(chave)
  }
}

export function appStoreGetCached<T>(chave: string, fallback: T): T {
  if (memory.has(chave)) return memory.get(chave) as T
  return fallback
}

export async function appStoreSet<T>(chave: string, valor: T): Promise<void> {
  memory.set(chave, valor)
  if (!isSupabaseConfigured || !supabase) return
  await supabase.from('app_store').upsert({
    chave,
    valor: valor as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })
}

/** Uma vez: sobe dado legado do localStorage e apaga a chave local. */
export async function migrateLocalKeyToAppStore<T>(
  localKey: string,
  storeKey: string,
  parse: (raw: string) => T | null,
): Promise<void> {
  try {
    const raw = localStorage.getItem(localKey)
    if (!raw) return
    const parsed = parse(raw)
    if (parsed == null) {
      localStorage.removeItem(localKey)
      return
    }
    const remote = await appStoreGet<T | null>(storeKey, null)
    if (remote == null) await appStoreSet(storeKey, parsed)
    localStorage.removeItem(localKey)
  } catch {
    /* ignore */
  }
}

export function clearLocalBusinessKeys(keys: string[]) {
  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

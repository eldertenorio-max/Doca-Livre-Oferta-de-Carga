/**
 * Mantém 1 rota por origem→destino (prefere ids seed a111…–a444…).
 * Apaga as demais cópias na tabela public.rotas.
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env', 'utf8')
function get(k) {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m?.[1]?.trim().replace(/^['"]|['"]$/g, '')
}

const PREFER = new Set([
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333',
  'a4444444-4444-4444-4444-444444444444',
])

const sb = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'))
const { data, error } = await sb.from('rotas').select('id, origem, destino, created_at')
if (error) {
  console.error('ERRO ao listar:', error.message)
  process.exit(1)
}

function keyOf(r) {
  const n = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  return `${n(r.origem)}|${n(r.destino)}`
}

const groups = new Map()
for (const r of data || []) {
  const k = keyOf(r)
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

const keep = []
const remove = []
for (const [, rows] of groups) {
  const preferred = rows.find((r) => PREFER.has(r.id))
  const winner =
    preferred ||
    [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
  keep.push(winner.id)
  for (const r of rows) {
    if (r.id !== winner.id) remove.push(r.id)
  }
}

console.log('MANTER:', keep.length)
console.log('APAGAR:', remove.length)

if (remove.length === 0) {
  console.log('Nada a limpar.')
  process.exit(0)
}

// delete em lotes
const chunk = 50
let ok = 0
let fail = 0
for (let i = 0; i < remove.length; i += chunk) {
  const ids = remove.slice(i, i + chunk)
  const { error: delErr } = await sb.from('rotas').delete().in('id', ids)
  if (delErr) {
    console.error('ERRO delete:', delErr.message)
    fail += ids.length
  } else {
    ok += ids.length
  }
}

const { count } = await sb.from('rotas').select('*', { count: 'exact', head: true })
console.log('APAGADAS_OK:', ok, 'FALHAS:', fail, 'TOTAL_AGORA:', count)

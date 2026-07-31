import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env', 'utf8')
function get(k) {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m?.[1]?.trim().replace(/^['"]|['"]$/g, '')
}

const url = get('VITE_SUPABASE_URL')
const key = get('VITE_SUPABASE_ANON_KEY')
if (!url || !key) {
  console.log('NO_ENV')
  process.exit(1)
}

const sb = createClient(url, key)
const { data, error, count } = await sb
  .from('rotas')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: true })

if (error) {
  console.log('ERROR:', error.message)
  console.log('CODE:', error.code)
  process.exit(0)
}

const rows = data || []
console.log('TOTAL:', count ?? rows.length)
for (const r of rows) {
  console.log(
    [
      r.id,
      r.classificacao,
      r.situacao || '?',
      `km=${r.km}`,
      `frete=${r.frete_tabela}`,
      `${r.origem} -> ${r.destino}`,
      r.descricao,
    ].join(' | '),
  )
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

const map = new Map()
for (const r of rows) {
  const k = keyOf(r)
  if (!map.has(k)) map.set(k, [])
  map.get(k).push(r.id)
}
const dups = [...map.entries()].filter(([, ids]) => ids.length > 1)
console.log('DUPLICATAS_ORIGEM_DESTINO:', dups.length)
for (const [k, ids] of dups) {
  console.log(`  ${ids.length}x ${k}`)
  for (const id of ids) console.log(`     - ${id}`)
}

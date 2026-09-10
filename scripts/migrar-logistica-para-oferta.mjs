import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_REF = 'zbjhaupxhriedfsgtlbj'
const TARGET_REF = 'imnlbbfgaztfhwndfxwb'
const OLD_HOST = `${SOURCE_REF}.supabase.co`
const NEW_HOST = `${TARGET_REF}.supabase.co`

function lerEnvArquivo(arquivo) {
  const out = {}
  if (!existsSync(arquivo)) return out
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim()
  }
  return out
}

const envOferta = lerEnvArquivo(resolve(root, '.env'))
const envLogistica = lerEnvArquivo(
  resolve('c:/Users/Diego/OneDrive/Desktop/PROJETOS/Mapa da Logística/.env'),
)

const sourceUrl =
  process.env.SOURCE_SUPABASE_URL || envLogistica.VITE_SUPABASE_URL || `https://${OLD_HOST}`
const sourceKey =
  process.env.SOURCE_SUPABASE_ANON_KEY || envLogistica.VITE_SUPABASE_ANON_KEY || ''
const targetUrl = process.env.VITE_SUPABASE_URL || envOferta.VITE_SUPABASE_URL || `https://${NEW_HOST}`
const targetKey =
  process.env.TARGET_SUPABASE_ANON_KEY || envOferta.VITE_SUPABASE_ANON_KEY || ''

if (!sourceKey || !targetKey) {
  console.error('Faltam chaves anon (origem e destino).')
  process.exit(1)
}

function reescreverUrls(valor) {
  if (valor == null) return valor
  if (typeof valor === 'string') return valor.split(OLD_HOST).join(NEW_HOST)
  if (Array.isArray(valor)) return valor.map(reescreverUrls)
  if (typeof valor === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(valor)) out[k] = reescreverUrls(v)
    return out
  }
  return valor
}

async function restListar(url, key, tabela) {
  const rows = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const res = await fetch(
      `${url}/rest/v1/${tabela}?select=*&order=id.asc&offset=${from}&limit=${page}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'count=exact',
        },
      },
    )
    if (!res.ok) {
      const texto = await res.text()
      throw new Error(`${tabela} ${res.status}: ${texto.slice(0, 400)}`)
    }
    const fatia = await res.json()
    rows.push(...fatia)
    if (fatia.length < page) break
  }
  return rows
}

async function restListarSemOrder(url, key, tabela) {
  const rows = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const to = from + page - 1
    const res = await fetch(`${url}/rest/v1/${tabela}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${to}`,
        Prefer: 'count=exact',
      },
    })
    if (!res.ok) {
      const texto = await res.text()
      throw new Error(`${tabela} ${res.status}: ${texto.slice(0, 400)}`)
    }
    const fatia = await res.json()
    rows.push(...fatia)
    if (fatia.length < page) break
  }
  return rows
}

async function aplicarSqlPostgres() {
  const password = process.env.TARGET_DB_PASSWORD || process.env.PGPASSWORD || ''
  if (!password) {
    console.warn('Sem TARGET_DB_PASSWORD/PGPASSWORD — pulando SQL via Postgres.')
    return false
  }
  const { default: pg } = await import('pg')
  const sql = readFileSync(resolve(root, 'supabase/logistica/completo.sql'), 'utf8')
  const tentativas = [
    {
      label: 'pooler aws-1-sa-east-1 :5432',
      host: 'aws-1-sa-east-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${TARGET_REF}`,
    },
    {
      label: 'pooler aws-0-sa-east-1 :5432',
      host: 'aws-0-sa-east-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${TARGET_REF}`,
    },
    {
      label: 'pooler aws-1-sa-east-1 :6543',
      host: 'aws-1-sa-east-1.pooler.supabase.com',
      port: 6543,
      user: `postgres.${TARGET_REF}`,
    },
    {
      label: 'db direto',
      host: `db.${TARGET_REF}.supabase.co`,
      port: 5432,
      user: 'postgres',
    },
  ]
  for (const cfg of tentativas) {
    const client = new pg.Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    })
    try {
      await client.connect()
      await client.query(sql)
      await client.end()
      console.log(`SQL aplicado via ${cfg.label}.`)
      return true
    } catch (err) {
      try {
        await client.end()
      } catch {
        /* ignore */
      }
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`Postgres (${cfg.label}):`, msg.split('\n')[0])
    }
  }
  return false
}

async function tabelaExiste(url, key) {
  const res = await fetch(`${url}/rest/v1/mapa_empresas?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

async function upsertLotes(client, tabela, rows, onConflict) {
  const lote = 80
  for (let i = 0; i < rows.length; i += lote) {
    const fatia = rows.slice(i, i + lote).map(reescreverUrls)
    const { error } = await client.from(tabela).upsert(fatia, { onConflict })
    if (error) throw new Error(`${tabela}: ${error.message}`)
    console.log(`  ${tabela} ${Math.min(i + lote, rows.length)}/${rows.length}`)
  }
}

async function listarStorage(url, key, bucket, prefix = '') {
  const arquivos = []
  let offset = 0
  for (;;) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prefix,
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    })
    if (!res.ok) {
      const texto = await res.text()
      console.warn('Storage list:', res.status, texto.slice(0, 200))
      return arquivos
    }
    const items = await res.json()
    if (!Array.isArray(items) || items.length === 0) break
    for (const item of items) {
      const nome = item.name
      if (!nome) continue
      const path = prefix ? `${prefix}${nome}` : nome
      if (item.id == null && item.metadata == null) {
        arquivos.push(...(await listarStorage(url, key, bucket, `${path}/`)))
      } else {
        arquivos.push(path)
      }
    }
    if (items.length < 100) break
    offset += items.length
  }
  return arquivos
}

async function copiarStorage(source, dest) {
  const paths = await listarStorage(sourceUrl, sourceKey, 'feed-midias')
  console.log(`Arquivos no bucket feed-midias: ${paths.length}`)
  for (const path of paths) {
    const dl = await fetch(`${sourceUrl}/storage/v1/object/feed-midias/${path}`, {
      headers: { apikey: sourceKey, Authorization: `Bearer ${sourceKey}` },
    })
    if (!dl.ok) {
      console.warn(`  falha download ${path}: ${dl.status}`)
      continue
    }
    const buf = Buffer.from(await dl.arrayBuffer())
    const contentType = dl.headers.get('content-type') || 'application/octet-stream'
    const { error } = await dest.storage.from('feed-midias').upload(path, buf, {
      contentType,
      upsert: true,
    })
    if (error) console.warn(`  falha upload ${path}: ${error.message}`)
    else console.log(`  midia ${path}`)
  }
}

async function main() {
  console.log('Destino:', targetUrl)
  const sqlOk = await aplicarSqlPostgres()
  let ok = sqlOk || (await tabelaExiste(targetUrl, targetKey))
  if (!ok) {
    console.error('Tabelas ainda não existem no Oferta. Cole supabase/logistica/completo.sql no SQL Editor:')
    console.error(`https://supabase.com/dashboard/project/${TARGET_REF}/sql/new`)
    process.exit(2)
  }

  const dest = createClient(targetUrl, targetKey)
  const tabelas = [
    ['mapa_empresas', 'id'],
    ['mapa_usuarios', 'usuario'],
    ['mapa_feed_posts', 'id'],
    ['mapa_feed_curtidas', 'post_id,usuario'],
    ['mapa_feed_comentarios', 'id'],
    ['mapa_notificacoes', 'id'],
  ]

  for (const [tabela, conflict] of tabelas) {
    let rows
    try {
      rows = await restListarSemOrder(sourceUrl, sourceKey, tabela)
    } catch (err) {
      console.warn(`Origem ${tabela}:`, err instanceof Error ? err.message : err)
      continue
    }
    console.log(`Copiando ${tabela}: ${rows.length}`)
    if (rows.length) {
      try {
        await upsertLotes(dest, tabela, rows, conflict)
      } catch (err) {
        console.warn(`Upsert ${tabela}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  try {
    await copiarStorage(sourceUrl, dest)
  } catch (err) {
    console.warn('Storage:', err instanceof Error ? err.message : err)
  }

  const { count, error } = await dest.from('mapa_empresas').select('id', { count: 'exact', head: true })
  if (error) throw error
  console.log(`Empresas no Oferta: ${count}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
